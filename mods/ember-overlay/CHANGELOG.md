# In-game menu changelog

The in-game menu updates on its own: Ember downloads the newest version when you press Play.

## 2026-11-13 (3)
- **Much faster**: the minimap, world map and menu icons are now drawn as images instead of thousands of tiny rectangles. The minimap and the open menu should barely change your FPS.
- **No more black chunks**: the area around you is mapped within a second or two, and chunks that weren't ready are retried.
- **World map, rebuilt in the style of Xaero's World Map**: smooth zoom around the cursor, drag to move, arrow keys, + / - and Space to centre. Right-click the map to add a waypoint, copy coordinates or centre there. A waypoint list to rename, recolour, hide, teleport to or delete them. Your recent path, a chunk grid (G), your death point, and coordinates + biome under the cursor.
- **Waypoints on the minimap**, pinned to the edge when they're further away.
- **Edit HUD layout**: drag the little square on a module's corner to resize it.
- **Smart placement**: a module you turn on is moved to the nearest free spot along the screen edges if it would cover another one or the hotbar.

## 2026-11-13 (2)
- **New icons**: clean line icons, like Lunar Client's, instead of Minecraft blocks.
- **Minimap**: a real terrain map around you (like Xaero's), with players and mobs, north marker, coordinates, square or circle, four zoom levels, and a cave view in the Nether.
- **World map**: a full-screen map of everything you've explored, opened with M (change it on its settings page). Drag to move, scroll to zoom, shows where you died. Explored areas are saved per world.
- **Radar**: auto zoom (fits the farthest mob in range), its own colours for players, mobs and animals, distance rings, border.
- **Potion status**: show effect icons (icon + text, icons only, or text only), harmful effects in red.
- **Key bindings in the menu**: every feature with a key shows it on its settings page; click it and press a new key (Esc = no key).
- **Show HUD modules on a key**: any HUD module can be set to show always, only while holding a key, or toggled with a key.
- **Only options that do something**: e.g. the radar no longer has a text colour.
- More options: keystrokes fade and spacing, armor warning colour and background, FPS update speed, coordinates with biome, stopwatch tenths, and more.
- **Custom crosshair keeps the attack cooldown**: it now draws its own cooldown bar or ring (follows Options > Video > Attack Indicator).
