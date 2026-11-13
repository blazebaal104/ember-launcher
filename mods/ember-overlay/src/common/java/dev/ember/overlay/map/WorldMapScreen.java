package dev.ember.overlay.map;

import com.mojang.blaze3d.platform.InputConstants;
import dev.ember.overlay.api.Canvas;
import dev.ember.overlay.api.Draw;
import dev.ember.overlay.api.Gfx;
import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.compat.EmberScreen;
import dev.ember.overlay.features.QolFeatures;
import dev.ember.overlay.ui.Icons;
import dev.ember.overlay.ui.Theme;
import dev.ember.overlay.ui.Ui;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;

import java.util.List;
import java.util.Locale;

/**
 * Full-screen map of everything explored in this world and dimension, in the spirit of Xaero's
 * World Map: smooth zoom around the cursor, drag to pan, waypoints (right-click to add, list on
 * the side to rename, recolour, hide, teleport or delete), your recent path, a chunk grid,
 * your death point and the coordinates/biome under the cursor.
 *
 * Terrain is drawn as 128x128-block textures ({@link MapTiles}), so it stays fast at any zoom.
 */
public final class WorldMapScreen extends EmberScreen {
    private static float zoomTarget = 1f; // pixels per block
    private static boolean showGrid, showTrail = true, showList;
    private final Ui ui = new Ui();
    private float zoom = zoomTarget;
    private double centerX, centerZ;
    private boolean dragging, dragged, follow = true;
    private double dragX, dragY, dragCX, dragCZ;
    private int menuX = -1, menuY;
    private double menuWX, menuWZ;
    private Waypoints.Waypoint selected;
    private EditBox nameBox;

    public WorldMapScreen() {
        super(Component.literal("World map"));
        Theme.load();
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    @Override
    protected boolean vanillaBackground() {
        return false;
    }

    @Override
    protected void init() {
        if (minecraft.player != null && follow) {
            centerX = minecraft.player.getX();
            centerZ = minecraft.player.getZ();
        }
        if (zoomTarget <= 0) zoomTarget = 1;
        int start = QolFeatures.worldMap.startZoom();
        if (zoom == zoomTarget && start >= 0) zoom = zoomTarget = new float[]{8, 4, 2, 1, 0.5f, 0.25f, 0.125f, 0.0625f}[Math.min(7, start)];
        nameBox = new EditBox(font, 0, 0, 120, 12, Component.literal("Name"));
        nameBox.setBordered(false);
        nameBox.setMaxLength(32);
        nameBox.setTextColor(Theme.TEXT);
        nameBox.setResponder(s -> {
            if (selected != null) {
                selected.name = s;
                Waypoints.save();
            }
        });
        nameBox.visible = false;
        addRenderableWidget(nameBox);
    }

    private double worldX(double sx) {
        return centerX + (sx - width / 2.0) / zoom;
    }

    private double worldZ(double sy) {
        return centerZ + (sy - height / 2.0) / zoom;
    }

    private float screenX(double wx) {
        return (float) (width / 2.0 + (wx - centerX) * zoom);
    }

    private float screenY(double wz) {
        return (float) (height / 2.0 + (wz - centerZ) * zoom);
    }

    // ------------------------------------------------------------------ input

    @Override
    protected boolean onMousePress(double x, double y, int button) {
        if (button == 0 && ui.press(x, y)) return true;
        if (menuX >= 0) { // click outside the context menu closes it
            menuX = -1;
            return true;
        }
        if (nameBox.isFocused() && !nameBox.isMouseOver(x, y)) nameBox.setFocused(false);
        if (button == 1) {
            menuX = (int) x;
            menuY = (int) y;
            menuWX = worldX(x);
            menuWZ = worldZ(y);
            return true;
        }
        if (button == 0) {
            dragging = true;
            dragged = false;
            dragX = x;
            dragY = y;
            dragCX = centerX;
            dragCZ = centerZ;
            return true;
        }
        return false;
    }

    @Override
    protected void onMouseRelease(double x, double y, int button) {
        dragging = false;
        ui.release();
    }

    @Override
    public boolean mouseScrolled(double x, double y, double horizontal, double vertical) {
        if (showList && x > width - 170) return true;
        zoomTarget = (float) Math.max(1 / 16f, Math.min(16f, zoomTarget * Math.pow(1.3, vertical)));
        zoomAnchorX = x;
        zoomAnchorY = y;
        return true;
    }

    private double zoomAnchorX = -1, zoomAnchorY;

    @Override
    protected boolean onKey(InputConstants.Key key) {
        if (nameBox.isFocused()) return false;
        int k = key.getValue();
        var mapping = QolFeatures.worldMap.openKey();
        if (mapping != null && !mapping.isUnbound() && key.getName().equals(mapping.saveString())) {
            onClose();
            return true;
        }
        double step = 48 / zoom;
        if (k == InputConstants.KEY_LEFT) pan(-step, 0);
        else if (k == InputConstants.KEY_RIGHT) pan(step, 0);
        else if (k == InputConstants.KEY_UP) pan(0, -step);
        else if (k == InputConstants.KEY_DOWN) pan(0, step);
        else if (k == InputConstants.KEY_SPACE) follow = true;
        else if (k == InputConstants.KEY_EQUALS || k == InputConstants.KEY_ADD) zoomTarget = Math.min(16f, zoomTarget * 1.5f);
        else if (k == InputConstants.KEY_MINUS || k == InputConstants.KEY_SUBTRACT) zoomTarget = Math.max(1 / 16f, zoomTarget / 1.5f);
        else if (k == InputConstants.KEY_G) showGrid = !showGrid;
        else return false;
        return true;
    }

    private void pan(double dx, double dz) {
        follow = false;
        centerX += dx;
        centerZ += dz;
    }

    // ------------------------------------------------------------------ drawing

    @Override
    protected void drawBackdrop(Gfx g, int mx, int my) {
        ui.begin(mx, my);
        var player = minecraft.player;

        // smooth zoom around the cursor (or the centre for keyboard zoom)
        if (Math.abs(zoom - zoomTarget) > 0.0005f) {
            double ax = zoomAnchorX >= 0 ? zoomAnchorX : width / 2.0, ay = zoomAnchorX >= 0 ? zoomAnchorY : height / 2.0;
            double wx = worldX(ax), wz = worldZ(ay);
            zoom += (zoomTarget - zoom) * Math.min(1f, ui.dt * 14f);
            if (Math.abs(zoom - zoomTarget) < 0.001f) zoom = zoomTarget;
            if (!follow) {
                centerX = wx - (ax - width / 2.0) / zoom;
                centerZ = wz - (ay - height / 2.0) / zoom;
            }
        } else zoomAnchorX = -1;

        if (dragging) {
            if (Math.abs(mx - dragX) + Math.abs(my - dragY) > 3) {
                dragged = true;
                follow = false;
            }
            if (dragged) {
                centerX = dragCX - (mx - dragX) / zoom;
                centerZ = dragCZ - (my - dragY) / zoom;
            }
        } else if (follow && player != null) {
            centerX = player.getX();
            centerZ = player.getZ();
        }

        g.fill(0, 0, width, height, 0xFF0C0E12);
        drawTiles(g);
        if (showGrid && zoom >= 1.5f) drawGrid(g);
        if (showTrail) drawTrail(g);
        drawDeath(g, mx, my);
        drawWaypoints(g, mx, my);
        if (player != null) Draw.arrow(g, Math.round(screenX(player.getX())), Math.round(screenY(player.getZ())), player.getYRot(), 5, 0xFFFFFFFF, 0xD0000000);

        drawHeader(g);
        drawFooter(g, mx, my);
        if (showList) drawList(g);
        else nameBox.visible = false;
        if (menuX >= 0) drawMenu(g);
        ui.end();
    }

    private void drawTiles(Gfx g) {
        int ts = MapTiles.SIZE;
        int tx0 = (int) Math.floor(worldX(0) / ts), tx1 = (int) Math.floor(worldX(width) / ts);
        int tz0 = (int) Math.floor(worldZ(0) / ts), tz1 = (int) Math.floor(worldZ(height) / ts);
        int[] budget = {3};
        boolean any = false;
        for (int tz = tz0; tz <= tz1; tz++) {
            for (int tx = tx0; tx <= tx1; tx++) {
                Canvas c = MapTiles.get(tx, tz, budget);
                if (c == null) continue;
                any = true;
                g.push(screenX((double) tx * ts), screenY((double) tz * ts), zoom);
                g.canvas(c, 0, 0);
                g.pop();
            }
        }
        if (!any && MapData.tileVersion((int) Math.floor(centerX / ts), (int) Math.floor(centerZ / ts)) < 0) {
            String t = "Nothing explored here yet. Walk around with the minimap or world map on.";
            g.text(t, (width - font.width(t)) / 2, height / 2 + 14, Theme.MUTED, false);
        }
    }

    private void drawGrid(Gfx g) {
        int c = zoom >= 4 ? 0x30FFFFFF : 0x20FFFFFF;
        double x0 = Math.floor(worldX(0) / 16) * 16, z0 = Math.floor(worldZ(0) / 16) * 16;
        for (double wx = x0; screenX(wx) < width; wx += 16) {
            int sx = Math.round(screenX(wx));
            g.fill(sx, 0, sx + 1, height, c);
        }
        for (double wz = z0; screenY(wz) < height; wz += 16) {
            int sy = Math.round(screenY(wz));
            g.fill(0, sy, width, sy + 1, c);
        }
    }

    private void drawTrail(Gfx g) {
        int i = 0;
        for (int[] p : MapData.trail()) {
            i++;
            int sx = Math.round(screenX(p[0] + 0.5)), sy = Math.round(screenY(p[1] + 0.5));
            if (sx < 0 || sy < 0 || sx > width || sy > height) continue;
            g.fill(sx - 1, sy - 1, sx + 1, sy + 1, 0x90FFFFFF);
        }
    }

    private void drawDeath(Gfx g, int mx, int my) {
        var death = QolFeatures.lastDeath;
        if (death == null || !QolFeatures.worldMap.showDeath() || minecraft.level == null || !death.dimension().equals(minecraft.level.dimension().toString())) return;
        int dx = Math.round(screenX(death.x() + 0.5)), dy = Math.round(screenY(death.z() + 0.5));
        Draw.circle(g, dx, dy, 6, 0xC0000000);
        Icons.draw(g, "death_coords", dx - 5, dy - 5, 10, Theme.RED);
        if (Math.abs(mx - dx) < 7 && Math.abs(my - dy) < 7) tooltip(g, "Where you died  ·  " + death.x() + ", " + death.y() + ", " + death.z(), dx, dy - 20);
    }

    private void drawWaypoints(Gfx g, int mx, int my) {
        Waypoints.Waypoint hover = null;
        int hx = 0, hy = 0;
        for (Waypoints.Waypoint w : Waypoints.all()) {
            if (!w.visible) continue;
            int sx = Math.round(screenX(w.x + 0.5)), sy = Math.round(screenY(w.z + 0.5));
            if (sx < -10 || sy < -10 || sx > width + 10 || sy > height + 10) continue;
            marker(g, w, sx, sy, w == selected);
            if (Math.abs(mx - sx) < 7 && Math.abs(my - sy) < 7) {
                hover = w;
                hx = sx;
                hy = sy;
            }
            final Waypoints.Waypoint ww = w;
            ui.click(sx - 6, sy - 6, sx + 7, sy + 7, () -> {
                selected = ww;
                showList = true;
            });
        }
        if (hover != null) tooltip(g, hover.name + "  ·  " + hover.x + ", " + hover.y + ", " + hover.z + distance(hover), hx, hy - 20);
    }

    public static void marker(Gfx g, Waypoints.Waypoint w, int sx, int sy, boolean selected) {
        // a diamond with the first letter, like Xaero's
        for (int i = 0; i <= 6; i++) {
            int half = 6 - i;
            g.fill(sx - half - 1, sy - i - 1, sx + half + 2, sy - i, 0xB0000000);
            g.fill(sx - half - 1, sy + i, sx + half + 2, sy + i + 1, 0xB0000000);
        }
        for (int i = 0; i <= 5; i++) {
            int half = 5 - i;
            g.fill(sx - half, sy - i, sx + half + 1, sy - i + 1, w.color);
            g.fill(sx - half, sy + i, sx + half + 1, sy + i + 1, w.color);
        }
        var font = net.minecraft.client.Minecraft.getInstance().font;
        String l = w.initial();
        g.text(l, sx - font.width(l) / 2 + 1, sy - 3, Draw.luma(w.color) > 0.6f ? 0xFF15171C : 0xFFFFFFFF, false);
        if (selected) Draw.outline(g, sx - 8, sy - 8, sx + 9, sy + 9, 3, 0xFFFFFFFF);
    }

    private String distance(Waypoints.Waypoint w) {
        var p = minecraft.player;
        if (p == null) return "";
        double d = Math.sqrt(Math.pow(p.getX() - w.x, 2) + Math.pow(p.getZ() - w.z, 2));
        return "  ·  " + Math.round(d) + "m";
    }

    private void tooltip(Gfx g, String text, int x, int y) {
        int w = font.width(text) + 10;
        int tx = Math.max(2, Math.min(width - w - 2, x - w / 2));
        Draw.round(g, tx, y, tx + w, y + 14, 3, Draw.withAlpha(Theme.BASE, 240));
        Draw.outline(g, tx, y, tx + w, y + 14, 3, Draw.withAlpha(Theme.LINE, 255));
        g.text(text, tx + 5, y + 3, Theme.TEXT, false);
    }

    private boolean iconButton(Gfx g, String icon, String label, int x, int y, boolean on, Runnable action) {
        int w = 18 + (label.isEmpty() ? 0 : font.width(label) + 6);
        boolean hov = ui.hover(x, y, x + w, y + 18);
        Draw.round(g, x, y, x + w, y + 18, 4, on ? Theme.ACCENT : hov ? Theme.LINE : Draw.withAlpha(Theme.BASE, 230));
        Icons.draw(g, icon, x + 4, y + 4, 10, on ? Theme.ON_ACCENT : hov ? Theme.TEXT : Theme.MUTED);
        if (!label.isEmpty()) g.text(label, x + 18, y + 5, on ? Theme.ON_ACCENT : Theme.TEXT, false);
        ui.click(x, y, x + w, y + 18, action);
        return hov;
    }

    private void drawHeader(Gfx g) {
        String dim = minecraft.level == null ? "" : minecraft.level.dimension().toString();
        int slash = dim.lastIndexOf('/');
        String name = slash >= 0 ? dim.substring(slash + 1).replace("]", "").replace("minecraft:", "").replace('_', ' ').trim() : dim;
        if (!name.isEmpty()) name = Character.toUpperCase(name.charAt(0)) + name.substring(1);
        String title = "World map" + (name.isEmpty() ? "" : "  ·  " + name) + (MapData.cave() ? "  ·  cave view" : "");
        int tw = font.width(title) + 30;
        Draw.round(g, 6, 6, 6 + tw, 24, 5, Draw.withAlpha(Theme.BASE, 235));
        Icons.draw(g, "worldmap", 11, 9, 12, Theme.ACCENT);
        g.text(title, 28, 11, Theme.TEXT, false);

        int x = width - 24;
        iconButton(g, "ui_close", "", x, 6, false, this::onClose);
        x -= 4 + 18 + font.width("Centre") + 6;
        iconButton(g, "coords", "Centre", x, 6, follow, () -> follow = true);
        x -= 4 + 18 + font.width("Waypoints") + 6;
        iconButton(g, "coords", "Waypoints", x, 6, showList, () -> showList = !showList);
        x -= 4 + 18;
        iconButton(g, "chunk", "", x, 6, showGrid, () -> showGrid = !showGrid);
        x -= 4 + 18;
        iconButton(g, "minimal_bob", "", x, 6, showTrail, () -> showTrail = !showTrail);
    }

    private void drawFooter(Gfx g, int mx, int my) {
        int wx = (int) Math.floor(worldX(mx)), wz = (int) Math.floor(worldZ(my));
        String pos = "X " + wx + "  Z " + wz;
        if (minecraft.level != null && minecraft.level.hasChunk(wx >> 4, wz >> 4)) pos += "  ·  " + Compat.biomeName(minecraft, new BlockPos(wx, 64, wz));
        int pw = font.width(pos) + 12;
        Draw.round(g, 6, height - 22, 6 + pw, height - 6, 4, Draw.withAlpha(Theme.BASE, 215));
        g.text(pos, 12, height - 18, Theme.TEXT, false);

        String hint = "Drag · Scroll to zoom · Right-click for waypoints · G grid · Space centre";
        if (font.width(hint) + 40 < width - pw - 120) {
            int hw = font.width(hint) + 12;
            Draw.round(g, (width - hw) / 2, height - 22, (width + hw) / 2, height - 6, 4, Draw.withAlpha(Theme.BASE, 190));
            g.text(hint, (width - hw) / 2 + 6, height - 18, Theme.MUTED, false);
        }
        String zt = zoom >= 1 ? String.format(Locale.ROOT, "%.1fx", zoom) : String.format(Locale.ROOT, "1 px = %d blocks", Math.round(1 / zoom));
        g.text(zt, width - 8 - font.width(zt), height - 18, Theme.MUTED, false);
    }

    private void drawMenu(Gfx g) {
        String[] items = {"Add waypoint here", "Copy coordinates", "Centre here"};
        int w = 0;
        for (String s : items) w = Math.max(w, font.width(s));
        w += 26;
        int h = items.length * 16 + 4;
        int x = Math.min(menuX, width - w - 4), y = Math.min(menuY, height - h - 4);
        Draw.round(g, x, y, x + w, y + h, 4, Draw.withAlpha(Theme.BASE, 245));
        Draw.outline(g, x, y, x + w, y + h, 4, Theme.LINE);
        String[] icons = {"coords", "copy_coords", "ui_all"};
        Runnable[] actions = {
                () -> {
                    int yy = minecraft.player == null ? 64 : minecraft.player.getBlockY();
                    selected = Waypoints.add("Waypoint " + (Waypoints.all().size() + 1), (int) Math.floor(menuWX), yy, (int) Math.floor(menuWZ));
                    showList = true;
                    menuX = -1;
                },
                () -> {
                    minecraft.keyboardHandler.setClipboard((int) Math.floor(menuWX) + " ~ " + (int) Math.floor(menuWZ));
                    menuX = -1;
                },
                () -> {
                    follow = false;
                    centerX = menuWX;
                    centerZ = menuWZ;
                    menuX = -1;
                }
        };
        for (int i = 0; i < items.length; i++) {
            int iy = y + 2 + i * 16;
            boolean hov = ui.hover(x + 2, iy, x + w - 2, iy + 16);
            if (hov) Draw.round(g, x + 2, iy, x + w - 2, iy + 16, 3, Theme.LINE);
            Icons.draw(g, icons[i], x + 6, iy + 3, 10, hov ? Theme.ACCENT : Theme.MUTED);
            g.text(items[i], x + 20, iy + 4, Theme.TEXT, false);
            ui.click(x + 2, iy, x + w - 2, iy + 16, actions[i]);
        }
    }

    private void drawList(Gfx g) {
        int pw = 164, x = width - pw - 6, y = 30, h = height - 60;
        Draw.round(g, x, y, x + pw, y + h, 6, Draw.withAlpha(Theme.BASE, 240));
        Draw.outline(g, x, y, x + pw, y + h, 6, Draw.withAlpha(Theme.LINE, 255));
        ui.click(x, y, x + pw, y + h, () -> {}); // swallow clicks on the panel
        g.text("§lWaypoints", x + 8, y + 7, Theme.TEXT, false);
        List<Waypoints.Waypoint> list = Waypoints.all();
        if (list.isEmpty()) {
            int ly = y + 26;
            for (String l : new String[]{"No waypoints yet.", "Right-click the map and", "choose Add waypoint here."}) {
                g.text(l, x + 8, ly, Theme.MUTED, false);
                ly += 11;
            }
        }
        int ry = y + 22, bottom = y + h - (selected != null ? 70 : 6);
        for (Waypoints.Waypoint w : list) {
            if (ry + 18 > bottom) break;
            boolean sel = w == selected, hov = ui.hover(x + 4, ry, x + pw - 4, ry + 18);
            if (sel || hov) Draw.round(g, x + 4, ry, x + pw - 4, ry + 18, 3, sel ? Draw.withAlpha(Theme.ACCENT, 60) : Theme.LINE);
            Draw.round(g, x + 8, ry + 5, x + 16, ry + 13, 2, w.visible ? w.color : Draw.withAlpha(w.color, 90));
            String n = w.name;
            while (font.width(n) > pw - 70 && n.length() > 1) n = n.substring(0, n.length() - 1);
            g.text(n, x + 20, ry + 5, w.visible ? Theme.TEXT : Theme.MUTED, false);
            String d = distance(w).replace("  ·  ", "");
            g.text(d, x + pw - 8 - font.width(d), ry + 5, Theme.MUTED, false);
            final Waypoints.Waypoint ww = w;
            ui.click(x + 4, ry, x + pw - 4, ry + 18, () -> {
                selected = ww;
                nameBox.setValue(ww.name);
                follow = false;
                centerX = ww.x + 0.5;
                centerZ = ww.z + 0.5;
            });
            ry += 20;
        }
        if (selected == null || !list.contains(selected)) {
            selected = null;
            nameBox.visible = false;
            return;
        }
        // editor for the selected waypoint
        int ey = y + h - 66;
        g.fill(x + 6, ey - 4, x + pw - 6, ey - 3, Theme.LINE);
        Draw.round(g, x + 6, ey, x + pw - 6, ey + 16, 3, Draw.withAlpha(Theme.SURFACE, 255));
        nameBox.setX(x + 10);
        nameBox.setY(ey + 4);
        nameBox.setWidth(pw - 20);
        nameBox.visible = true;
        if (!nameBox.isFocused() && !nameBox.getValue().equals(selected.name)) nameBox.setValue(selected.name);
        ui.click(x + 6, ey, x + pw - 6, ey + 16, () -> {
            setFocused(nameBox);
            nameBox.setFocused(true);
        });
        int sx = x + 8;
        for (int c : Waypoints.COLORS) {
            boolean on = (selected.color & 0xFFFFFF) == (c & 0xFFFFFF);
            if (on) Draw.round(g, sx - 1, ey + 21, sx + 12, ey + 34, 3, 0xFFFFFFFF);
            Draw.round(g, sx, ey + 22, sx + 11, ey + 33, 2, c);
            final int col = c;
            ui.click(sx - 1, ey + 21, sx + 12, ey + 34, () -> {
                selected.color = col;
                Waypoints.save();
            });
            sx += 14;
        }
        int bx = x + 6, by = ey + 40;
        Waypoints.Waypoint s = selected;
        iconButton(g, s.visible ? "freelook" : "hide_vanilla_effects", s.visible ? "Shown" : "Hidden", bx, by, false, () -> {
            s.visible = !s.visible;
            Waypoints.save();
        });
        iconButton(g, "server_switcher", "", x + pw - 50, by, false, () -> {
            if (minecraft.player != null) minecraft.player.connection.sendCommand("tp @s " + s.x + " " + s.y + " " + s.z);
        });
        iconButton(g, "memory_cleaner", "", x + pw - 28, by, false, () -> {
            Waypoints.remove(s);
            selected = null;
        });
    }

    @Override
    public void onClose() {
        Compat.setScreen(minecraft, null);
    }
}
