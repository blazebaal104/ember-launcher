# Changelog

## 0.5.0

### The in-game menu works on many more versions
- The Ember in-game menu (Right Shift) now works on **Minecraft 1.21 to 1.21.11 and 26.1 to 26.3** (Fabric and Quilt), not just 26.3.
- It's added to your **existing** instances automatically the next time you press Play, and kept up to date when Ember updates. Switching it off in the instance settings removes it.
- On 1.21 to 1.21.5, the options that hide vanilla HUD pieces (scoreboard, boss bars, titles, effect icons, custom crosshair) show as unavailable; everything else works.

### Faster updates
- Ember builds about twice as fast, so fixes reach you sooner.

## 0.4.3

- Fixed the installer stopping with "Error opening file for writing ... playitd.exe": Ember now closes its playit program before updating, when it quits, and when it starts (in case one was left running).

## 0.4.2

- Invite friends: your server's address is always at the top with a Copy button (also when the server is off, once playit.gg is set up), every address has its own Copy, and you can customize it: change the port, or pick a nicer playit.gg address with "Customize on playit.gg".
- playit.gg now comes online straight away when you connect it (or switch it on) while the server is already running: no restart needed. If it ever shows an error, there's a Retry button.
- Fixed servers failing to start with "another process has locked a portion of the file": a copy of the server left running from an earlier session is now found and stopped automatically.
- Closing Ember now stops your running servers properly (saving the world) instead of leaving them running in the background.

## 0.4.1

- Fixed **Connect playit.gg** stopping with "AgentVersionTooOld": Ember now identifies itself to playit.gg the way its bundled playit program expects. If you tried before, press Disconnect (if shown) and Connect playit.gg again.

## 0.4.0

### Servers, redesigned
- **New server wizard**: pick *Just play with friends*, *Modded* or *Plugins*, choose a new world or copy one of your singleplayer worlds, set memory, and it creates, sets up and starts everything.
- **Invite friends**: one panel that finds the best way in. Same Wi-Fi, your router (automatic), or **playit.gg with one click**: approve once in your browser and Ember creates the tunnel and runs it with the server. The address never changes.
- **Restart button**, a clearer header with status and player count.
- **Players** tab: operators, whitelist and bans, all editable by name.
- **Mods / Plugins** tab: search and add straight to the server (no more installing into an instance by mistake), with Installed badges.
- **World** tab: pre-generate with a progress bar (pause, continue, cancel), backups with one-click restore, use one of your worlds, start a fresh world.
- **Settings** in plain language: max render distance (each player picks up to it), simulation distance, memory, faster world generation (C2ME), far view (Voxy), daily backups, restart on crash, stop when everyone leaves, and a live preview of how the server looks in the server list.
- Memory warning on the Overview when the server is close to its limit.

### Instances
- Bobby is now part of the performance mods: chunks you've seen load instantly and render further on servers.

### Updates
- Ember now updates itself: when a new version is out, a window shows what's new and installs it in one click.
