# Next update: to-do list

Everything below shipped in 0.4.0 except what is still unticked.

Collected from testing v0.3.0. Tick off as they land.

## Servers
- [x] **Bug:** server page → Mods → add a mod installs it into an *instance*, not the server. Installs started from a server must go to that server's `mods/` (Fabric) or `plugins/` (Paper).
- [x] Make adding mods/plugins to a server more intuitive: an inline "Add mods" search on the server page (like the instance Mods tab), showing only server-compatible builds for its version, "Installed" badges, and a clear "Installing to: <server>" label.
- [x] General polish pass on the integrated server.
- [x] Rename `view-distance` to "Max render distance (each player chooses up to this)"; default 16 for new servers; warn on the Dashboard when memory gets tight.
- [x] "Pre-generate world" button (Chunky) with a progress bar on the Dashboard.
- [x] "Voxy far view" option: install Voxy Server Side on the server and offer to add Voxy + Voxy Server Side to players' instances in one click (warn when no build exists for the server's version).

## Instances
- [x] Add Bobby (client chunk cache) to the default performance mods.

## Later
- [ ] Automatic log upload/sharing (auto-logs).
