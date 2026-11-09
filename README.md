# Ember Launcher

A fast, dark-mode-first Minecraft: Java Edition launcher for **1.21 and newer** (including 26.x,
snapshots, pre-releases and release candidates), built with Tauri 2, React and Rust.

* **Isolated instances.** Each one has its own mods, configs, worlds and packs.
* **Automatic performance stack.** Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling
  and more, resolved for the exact version of every new instance.
* **Discover content.** Mods, resource packs, data packs, shaders, modpacks and plugins from
  Modrinth and CurseForge.
* **Mod-Version Transfer.** Drop an old mods folder, zip or modpack. Ember finds each mod's build
  for the new version and suggests successors or forks when one doesn't exist.
* **In-game menu (Right Shift).** 50+ HUD, visual and quality-of-life tweaks in one lightweight
  Fabric mod, verified in a real Minecraft 26.3 game on CI.
* **Game profiles.** Keybinds, FOV, video and sound set once and applied to every instance.
* **Play with friends.** One-click world sharing (e4mc) or dedicated Paper/Fabric/Vanilla servers
  with a console and plugin installs.
* **Modpacks.** Install any Modrinth modpack as a ready-to-play instance.
* **Fully customisable.** Themes, accent colour, liquid glass, animations, layout, sounds.

```bash
npm install && npm test && cargo test -p launcher-core
npm --workspace apps/desktop run dev    # UI with demo data in your browser
npm run dev                             # full desktop app (needs Tauri system deps)
```

**Want to play on Windows with your Microsoft account?** Follow **[docs/WINDOWS-SETUP.md](docs/WINDOWS-SETUP.md)**.

Read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the design, data flows, security model,
setup (Azure app, CurseForge key) and an honest status table.
