# Ember Launcher - Architecture

A Minecraft: Java Edition launcher for **1.21 and newer**, including the year-numbered releases
(26.1, 26.2, ...), plus all snapshots, pre-releases and release candidates.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** | Uses the OS WebView. Idle RAM is ~40-80 MB, versus ~250 MB for Electron. Native installers are a few MB. |
| UI | React 19 + TypeScript + Tailwind v4 | Fast to iterate. Tailwind tokens hold the design system. |
| Core | **Rust** (`crates/launcher-core`) | Downloads, hashing, process spawning, auth. Has no UI dependency, so it can be unit-tested without Tauri. |
| Content engine | TypeScript (`packages/content-engine`) | Modrinth/CurseForge clients plus the Mod-Version Transfer Engine. Shared by the UI and its Web Worker, and tested in Node. |
| In-game overlay | Fabric client mod, Java 21 (`mods/ember-overlay`) | The only way to draw inside the game. It has no injector or process attach, so it stays anti-cheat-friendly. |

## 2. Directory structure

```text
ember-launcher/
├─ Cargo.toml                    Rust workspace (core + Tauri shell)
├─ package.json                  npm workspaces (engine + desktop)
├─ docs/ARCHITECTURE.md
│
├─ crates/launcher-core/         ── BACKEND CORE (Rust, UI-agnostic) ─────────────────
│  └─ src/
│     ├─ versions.rs             manifest + "1.21 and newer" policy (date-based, see 4.1)
│     ├─ version_json.rs         client.json model + loader-profile merge
│     ├─ rules.rs                Mojang OS/feature rule evaluation
│     ├─ install.rs              client jar, libraries, assets, log config (shared store)
│     ├─ java.rs                 managed Java runtimes from Mojang's runtime index
│     ├─ auth.rs                 Microsoft device code → Xbox → XSTS → Minecraft
│     ├─ instance.rs             isolated instances + InstanceHook pipeline
│     ├─ perf_bundle.rs          PERFORMANCE INJECTION (an InstanceHook)
│     ├─ launch.rs               argument building, G1 tuning, process spawn
│     ├─ fabric.rs, modrinth.rs  small API clients used by the core
│     ├─ download.rs             parallel, SHA-1 verified, atomic-rename downloads
│     └─ paths.rs                on-disk layout + Maven path helper
│
├─ apps/desktop/                 ── DESKTOP APP ──────────────────────────────────────
│  ├─ src-tauri/                 thin IPC layer: commands.rs validates every input
│  │  ├─ capabilities/default.json   HTTP allow-list (Modrinth only)
│  │  └─ resources/overlay/      built ember-overlay-<mc>.jar files are shipped here
│  └─ src/
│     ├─ components/             Sidebar (Discover content group), DiscoverMenu (dropdown),
│     │                          TopBar, NewInstanceDialog, AccountButton
│     ├─ pages/                  Home (dashboard), Discover, Transfer
│     ├─ workers/inspect.worker.ts   MOD-MANAGEMENT WORKER THREAD (unzip + hash)
│     └─ lib/                    ipc.ts (typed Rust bridge + browser demo data), clients.ts
│
├─ packages/content-engine/      ── CONTENT ENGINE (TypeScript) ──────────────────────
│  ├─ src/
│  │  ├─ jar-inspector.ts        reads fabric.mod.json / quilt.mod.json / (neoforge.)mods.toml,
│  │  │                          .zip folders, .mrpack, CurseForge manifest.json
│  │  ├─ hashing.ts              SHA-1/512 + CurseForge murmur2 fingerprint
│  │  ├─ modrinth.ts, curseforge.ts   API clients and Discover category mapping
│  │  ├─ transfer-engine.ts      MOD-VERSION TRANSFER ENGINE
│  │  ├─ similarity.ts           explainable "closest functional match" scoring
│  │  └─ successors.ts           curated discontinued → successor table
│  └─ test/engine.test.ts        end-to-end engine test against a mocked Modrinth
│
└─ mods/ember-overlay/           ── IN-GAME OVERLAY (Fabric, Java) ───────────────────
   └─ src/main/java/dev/ember/overlay/
      ├─ compat/Compat.java      every version-sensitive MC/Fabric call, in one file
      ├─ core/                   Feature, FeatureRegistry (pre-filtered hot lists), Config
      ├─ hud/                    single HUD layer, cached text readouts
      ├─ features/               HudFeatures (25), VisualFeatures (17), QolFeatures (14)
      ├─ mixin/                  7 small, flag-guarded mixins
      └─ ui/                     OverlayScreen (Right Shift), server switcher, screenshots
```

## 3. On-disk layout and isolation

```text
<app data>/
  shared/        versions/, libraries/, assets/, runtimes/   ← content-addressed, read-only to the game
  instances/<id>/                                            ← passed as --gameDir and used as the cwd
     instance.json  mods/  config/  saves/  resourcepacks/  shaderpacks/  datapacks/  screenshots/  logs/
     .ember/natives/   .ember/bundle.lock.json
```

Everything the user touches lives inside the instance folder. Two instances never share a mod,
config, world or option file. Only immutable, hash-verified files (libraries, assets, Java) are
shared, which saves gigabytes without risking conflicts. "Open mods folder" goes straight to
`instances/<id>/mods`, so managing mods by hand is simple.

`datapacks/` is a staging folder. Data packs are per-world in vanilla, so the UI copies them into
`saves/<world>/datapacks` when the user picks a world.

## 4. Core flows

### 4.1 Version policy

Mojang switched to year-based numbers in December 2025 (`26.1`, `26.1-snapshot-1`, `26.1-pre-1`,
`26.1-rc-1`). A string check for "1.21" would hide every new version. `versions.rs` reads the
**release time of `1.21` from the manifest** and keeps everything released at or after it.
It also keeps 1.21's own pre-releases and release candidates, and classifies each entry as
release, snapshot, pre-release or release candidate. Java is chosen per version from
`javaVersion.component` (Java 21 for 1.21.x, Java 25 for 26.x). Users never install Java.

### 4.2 Instance creation and performance injection

```text
UI ──create_instance──▶ InstanceManager.create()
                          ├─ hook.before_create()   PerformanceBundleHook: vanilla → Fabric,
                          │                         pin newest stable loader (or stay vanilla
                          │                         if Fabric doesn't support a fresh snapshot)
                          ├─ mkdir instance dirs, write instance.json
                          └─ hook.after_create()    PerformanceBundleHook:
                                                     1. resolve each bundle mod on Modrinth for the
                                                        EXACT game version + loader (parallel)
                                                     2. pull required deps transitively
                                                     3. drop mods another bundle mod marks incompatible
                                                     4. download with SHA-1 check into mods/
                                                     5. write .ember/bundle.lock.json
                                                     6. copy ember-overlay-<mc>.jar if shipped
                          ◀── HookReport (installed / skipped / warnings) shown in the dialog
```

The bundle is data (`perf_bundle::BUNDLE`): Sodium, Lithium, FerriteCore, ImmediatelyFast,
Entity Culling, ModernFix, Dynamic FPS, Krypton and Fabric API. For NeoForge and Quilt, entries
are filtered per loader. Quilt also accepts Fabric builds. Hook failures never block creation;
they surface as warnings. The lockfile lets "update bundle" and "remove bundle" touch only
Ember's files, never the user's.

**Production tip:** serve `BUNDLE` and `SUCCESSORS` as signed remote JSON, so the stack can be
updated for a new Minecraft drop without shipping a launcher release.

### 4.3 Launch

`install::prepare` fetches the version JSON (hash-checked against the manifest) and merges the
Fabric profile, letting the loader's libraries win on conflict. It then downloads the client jar,
rule-filtered libraries, the log config and assets with 32-way concurrency. `java::ensure_runtime`
installs the right JRE. `launch::build` substitutes `${...}` variables, evaluates feature rules
(custom resolution, quick-play multiplayer) and adds G1 tuning. The process starts with
`cwd = --gameDir = instance folder`. stdout/stderr are streamed to the UI as `game-log` events.
The access token appears only in argv and is never logged.

### 4.4 Mod-Version Transfer Engine

```text
 drop .jar / .zip / .mrpack / CF pack
          │
  [Web Worker]  inspectUploads(): unzip, read metadata, SHA-1, SHA-512, murmur2      (CPU, no network)
          │
  [Main thread] TransferEngine.plan(files, {gameVersion, loader})
    1 IDENTIFY   POST modrinth /version_files            sha1 → project   (1 request for ALL files)
                 POST curseforge /fingerprints/432       leftovers         (1 request)
                 manifest refs → CF project id; CF projects also matched to a Modrinth twin by slug
                 metadata fallback: mod id as slug, then name search (≥0.85 similarity)
    2 RESOLVE    POST modrinth /version_files/update {loaders, game_versions}   (1 request)
                 GET  /project/{id}/version (twins / metadata matches)
                 GET  curseforge /mods/{id}/files?gameVersion&modLoaderType
    3 FALLBACK   a) successors.ts  (OptiFine → Sodium + Iris, Ok Zoomer → Zoomify, LazyDFU → obsolete...)
                 b) Modrinth search pre-filtered to target version + loader, scored by
                    0.35·name + 0.25·categories + 0.25·description + 0.10·popularity + 0.05·freshness,
                    with continuation forks ("X Continued", "X Reforged") boosted to ≥ 0.8
    4 DEPS       required dependencies of every chosen build, transitively
          │
  TransferPlan → review UI (Ready / Needs your pick / Not needed anymore / Couldn't carry over)
          │
  finalize(plan, choices) → re-resolve deps for chosen alternatives → install_files (Rust)
```

Every suggestion carries a human-readable reason and a confidence score, so users see *why*
something was proposed. CurseForge files whose authors disallow third-party downloads come back
with `url: null`. The UI links to the project page instead of downloading.

### 4.5 Discover content

The six categories map to Modrinth facets and CurseForge class ids (`modrinth.ts`, `curseforge.ts`):

| Category | Modrinth facet | CurseForge classId |
|---|---|---|
| Mods | `project_type:mod` + loader categories | 6 |
| Resource Packs | `project_type:resourcepack` | 12 |
| Data Packs | `categories:datapack` | 6945 |
| Shaders | `project_type:shader` | 6552 |
| Modpacks | `project_type:modpack`, default sort by follows ("best rated") | 4471 |
| Plugins | `categories:paper/purpur/spigot/bukkit/folia/velocity/...` | 5 |

Results are pre-filtered to the selected instance's game version and loader. Installs resolve the
best build for that instance and download into the right sub-folder. Plugins are server-side, so
they open on their project page.

## 5. In-game overlay: how "minimal impact" is achieved

The brief asked for virtually zero impact on frame rates. No overlay is free, but this one is
built so the cost is a few microseconds per frame:

* **One HUD layer.** Fabric's `HudElementRegistry`, attached after chat.
* **Text is computed at 20 Hz, drawn per frame.** `TextHud.tick()` caches the string, and the
  frame loop only calls `drawString`.
* **Pre-filtered hot lists.** `FeatureRegistry` rebuilds immutable `ticking`/`hud` lists only
  when a toggle changes, so disabled features are never iterated.
* **Flag-guarded mixins.** Each hook's first instruction is a single boolean check.
  `"defaultRequire": 0` means a target missing in some version disables that feature instead of
  crashing the game.
* **Menu built from vanilla widgets**, with no custom input handling. It doesn't pause
  single-player.
* **No `-XX:+DisableExplicitGC`**, so the memory cleaner works. It frees heap after long
  sessions but doesn't raise FPS, and the UI says so.

Feature inventory: 56 registered, **51 implemented**, 5 shown as planned (world map, clear water,
item physics, block outline colour, low fire). The full list is in the menu or in
`features/*Features.java`.

## 6. Security

* The webview is untrusted. Instance ids are validated. Downloads are limited to
  `cdn.modrinth.com` / `*.forgecdn.net` over HTTPS. File names are sanitised. Target folders are
  allow-listed.
* The CurseForge API key is compiled into Rust (`EMBER_CURSEFORGE_KEY`) and reachable only through
  an allow-listed read-only proxy command.
* The Microsoft refresh token lives in the OS keychain (`keyring`), never in JSON.
* Tauri's HTTP plugin capability only allows the Modrinth API/CDN. The CSP blocks other origins.

## 7. Setup

```bash
npm install
npm test                         # content-engine tests
cargo test -p launcher-core      # core tests

# Linux build deps for Tauri: libwebkit2gtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev
EMBER_MSA_CLIENT_ID=<azure-app-id> EMBER_CURSEFORGE_KEY=<key> npm run dev

npm --workspace apps/desktop run dev   # UI only, in a browser, with demo data

cd mods/ember-overlay && gradle copyToLauncher   # build overlay into the launcher's resources
```

**Microsoft sign-in:** the client ID is a *runtime setting* (Settings page → `settings.json`), with
`EMBER_MSA_CLIENT_ID` as an optional build-time default. Auth errors are typed (`app_not_approved`,
`app_misconfigured`, `not_signed_in`, ...) so the UI can say exactly what to fix. Step-by-step for
players: [WINDOWS-SETUP.md](WINDOWS-SETUP.md). The refresh token goes to the OS keychain, with a
fallback file in the profile folder when the keychain rejects it (Windows' ~2.5 KB limit).

**Before shipping:**

1. **Azure app.** Personal accounts, public client, "Allow public client flows". New apps must be
   **approved by Mojang** for the Minecraft services API (https://aka.ms/mce-reviewappid). Until
   then `login_with_xbox` returns 403.
2. **CurseForge API key** from console.curseforge.com. Respect their third-party distribution flag
   (already handled).
3. **Modrinth User-Agent.** Set a real contact URL in `lib.rs` and `clients.ts`.

## 8. Status and roadmap

| Area | Status |
|---|---|
| Version list, instances, installs, Fabric, Java, launch, MS auth | Implemented. Core is unit-tested; the full shell compiles. |
| Performance injection | Implemented (hook + lockfile). |
| Transfer engine | Implemented and tested end-to-end against a mocked Modrinth. |
| Discover (6 categories, Modrinth + CurseForge) | Implemented. |
| NeoForge instances | Install step not wired yet: needs the NeoForge installer processors. Content and transfer already support NeoForge. |
| Modpack install (.mrpack → new instance) | Planned. The inspector already parses `.mrpack`. |
| Overlay | Written against 1.21.11 names. **Not compiled in CI yet.** First job: run `gradle build` and fix any mapping drift in `Compat.java` and the mixins. |
| Overlay terrain minimap, world map | Planned. A radar ships now. |
