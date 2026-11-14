# Changelog

## 0.8.0
- **Ember speaks Italian.** The first time Ember starts it asks for your language (English or Italiano) before the tour, and the whole launcher follows it: menus, pages, settings, buttons, messages, dates.
- Change the language any time in **Settings → Launcher** or **Settings → About**. Ember reloads its window to switch.
- Existing installs are asked once after updating.
- **Signing in now works on any computer.** The installer includes Ember's Microsoft sign-in setup, so friends can sign in straight away.
- Not translated yet: the in-game menu, and some error messages that come straight from Minecraft or Microsoft.

## 0.7.1
- **Account page: the 3D skin preview now shows your skin.** It was being drawn at zero size, so the panel looked empty.
- The preview starts in a three-quarter view with room around the model, on a checkered backdrop, and the name tag uses a Minecraft-style font.
- New buttons on the preview: **pause / play** the animation and **show / hide the outer layer** (hat, jacket, sleeves).

## 0.7.0

### A real Account page
- **New Account page** (click your name at the bottom of the sidebar), replacing the old sign-in setup in Settings.
- **3D preview of your skin** as other players see it, with your name tag: drag to turn, scroll to zoom, and pick a pose (stand, walk, run, wave, sneak). Shows your cape, or try it as an elytra.
- **Skins**: drop in a PNG and preview it in 3D before wearing it, pick classic or slim arms, go back to the default skin. Every skin you use is kept in a **skin library** so you can switch back any time.
- **Capes**: pick which of your capes to wear, or hide it.
- **Change your name**, with a live "available / taken" check and when your next change is allowed.
- **Stats**: time played, favourite version, most played instance, sessions, and a chart of the last two weeks.
- **Server history**: servers you joined, when, and from which instance, with one-click Play.
- **Multiplayer status**: whether you can join servers, Realms and chat, and any active ban.
- **Several accounts**: add more Microsoft accounts and switch between them from the Account page or the arrows next to your name in the sidebar. Your existing sign-in carries over automatically.

## 0.6.0

### A brand-new in-game menu
- **Redesigned from scratch** (Right Shift): a glass panel in Ember's colours (it follows the theme and accent you picked in the app), with a card for every feature, filters on the side (All, Enabled, HUD, Visual, Utility) and search.
- **Click the bottom of a card** to turn a feature on or off. **Click the rest of the card** to open its settings page, with a simple description, the most useful options first, and an **Advanced settings** section for the rest.
- **Real options for every feature**: crosshair style, colour, size, gap and outline (plus a colour change when aiming at mobs); zoom amount and smoothness; FPS and ping coloured by value; coordinates layout and Nether/Overworld position; armor layout and durability as number, percent or bar; mini-map size, range and shape; and more. Every HUD module also has colour, background, opacity, size, shadow and padding options.
- **Live previews** on the settings page for HUD modules and the crosshair.
- **Edit HUD layout**: drag HUD modules anywhere, scroll to resize them, right-click to reset. They snap to the edges and the centre of the screen.
- **Nothing is turned on by default** any more. Pick what you want.
- **Menu updates without app updates**: Ember now downloads the newest in-game menu when you press Play (checked for integrity, and it keeps working offline), so menu fixes reach you within minutes.
- The in-game menu works on **26.1 to 26.3** too.
- **"You already have it"**: Ember checks your mods, and when one already does the same thing (for example an armor HUD, Zoomify, AppleSkin, Jade or a minimap) the card says so, so you don't end up with two of the same thing.

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
