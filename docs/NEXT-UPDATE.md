# Next update: to-do list

Collected from testing v0.3.0. Tick off as they land.

## Servers
- [ ] **Bug:** server page → Mods → add a mod installs it into an *instance*, not the server. Installs started from a server must go to that server's `mods/` (Fabric) or `plugins/` (Paper).
- [ ] Make adding mods/plugins to a server more intuitive: an inline "Add mods" search on the server page (like the instance Mods tab), showing only server-compatible builds for its version, "Installed" badges, and a clear "Installing to: <server>" label.
- [ ] General polish pass on the integrated server.
- [ ] Rename `view-distance` to "Max render distance (each player chooses up to this)"; default 16 for new servers; warn on the Dashboard when memory gets tight.
- [ ] "Pre-generate world" button (Chunky) with a progress bar on the Dashboard.
- [ ] "Voxy far view" option: install Voxy Server Side on the server and offer to add Voxy + Voxy Server Side to players' instances in one click (warn when no build exists for the server's version).

## Instances
- [ ] Add Bobby (client chunk cache) to the default performance mods.

## Later
- [ ] Automatic log upload/sharing (auto-logs).
