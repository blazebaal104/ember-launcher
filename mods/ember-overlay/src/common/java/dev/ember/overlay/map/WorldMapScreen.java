package dev.ember.overlay.map;

import com.mojang.blaze3d.platform.InputConstants;
import dev.ember.overlay.api.Draw;
import dev.ember.overlay.api.Gfx;
import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.compat.EmberScreen;
import dev.ember.overlay.features.QolFeatures;
import dev.ember.overlay.ui.Icons;
import dev.ember.overlay.ui.Theme;
import net.minecraft.network.chat.Component;

/**
 * Full-screen map of everything you've explored in this world and dimension (recorded while
 * the minimap or world map is on). Drag to move, scroll to zoom, press the map key or Esc to close.
 */
public final class WorldMapScreen extends EmberScreen {
    /** {pixels per cell, blocks per cell}, closest first. */
    private static final int[][] LEVELS = {{8, 1}, {6, 1}, {4, 1}, {3, 1}, {2, 1}, {2, 2}, {2, 4}, {2, 8}, {2, 16}};
    private static int level = 3;
    private final MapView view = new MapView();
    private double centerX, centerZ;
    private boolean dragging;
    private double dragX, dragY, dragCX, dragCZ;
    private int mouseX, mouseY;
    private boolean follow = true;

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
        if (minecraft.player != null) {
            centerX = minecraft.player.getX();
            centerZ = minecraft.player.getZ();
        }
        level = Math.max(0, Math.min(LEVELS.length - 1, QolFeatures.worldMap.startZoom()));
    }

    private double bpp() {
        return LEVELS[level][1] / (double) LEVELS[level][0];
    }

    private double worldX(double sx) {
        return centerX + (sx - width / 2.0) * bpp();
    }

    private double worldZ(double sy) {
        return centerZ + (sy - height / 2.0) * bpp();
    }

    private int screenX(double wx) {
        return (int) Math.round(width / 2.0 + (wx - centerX) / bpp());
    }

    private int screenY(double wz) {
        return (int) Math.round(height / 2.0 + (wz - centerZ) / bpp());
    }

    @Override
    protected boolean onMousePress(double x, double y, int button) {
        // buttons in the corner
        if (y >= 6 && y < 22) {
            if (x >= width - 26 && x < width - 8) {
                onClose();
                return true;
            }
            if (x >= width - 92 && x < width - 32) {
                follow = true;
                return true;
            }
        }
        if (button == 0) {
            dragging = true;
            follow = false;
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
    }

    @Override
    public boolean mouseScrolled(double x, double y, double horizontal, double vertical) {
        double wx = worldX(x), wz = worldZ(y);
        int next = Math.max(0, Math.min(LEVELS.length - 1, level + (vertical > 0 ? -1 : 1)));
        if (next == level) return true;
        level = next;
        // keep the spot under the cursor still
        centerX = wx - (x - width / 2.0) * bpp();
        centerZ = wz - (y - height / 2.0) * bpp();
        follow = false;
        return true;
    }

    @Override
    protected boolean onKey(InputConstants.Key key) {
        var mapping = QolFeatures.worldMap.openKey();
        if (mapping != null && !mapping.isUnbound() && key.getName().equals(mapping.saveString())) {
            onClose();
            return true;
        }
        return false;
    }

    @Override
    protected void drawBackdrop(Gfx g, int mx, int my) {
        mouseX = mx;
        mouseY = my;
        var player = minecraft.player;
        if (dragging) {
            centerX = dragCX - (mx - dragX) * bpp();
            centerZ = dragCZ - (my - dragY) * bpp();
        } else if (follow && player != null) {
            centerX = player.getX();
            centerZ = player.getZ();
        }
        g.fill(0, 0, width, height, 0xF00C0E12);
        int cell = LEVELS[level][0], bpc = LEVELS[level][1];
        // snap the origin to whole cells so the map doesn't shimmer while it moves
        double left = Math.floor(worldX(0) / bpc) * bpc, top = Math.floor(worldZ(0) / bpc) * bpc;
        int ox = screenX(left), oy = screenY(top);
        view.build(left, top, width - ox + cell, height - oy + cell, cell, bpc, false);
        view.draw(g, ox, oy);

        if (view.runs() == 0) {
            String t = "Nothing explored here yet: walk around with the minimap or world map on.";
            g.text(t, (width - font.width(t)) / 2, height / 2 + 12, Theme.MUTED, false);
        }

        // death point
        var death = QolFeatures.lastDeath;
        if (death != null && QolFeatures.worldMap.showDeath() && minecraft.level != null && death.dimension().equals(minecraft.level.dimension().toString())) {
            int dx = screenX(death.x() + 0.5), dy = screenY(death.z() + 0.5);
            for (int i = -3; i <= 3; i++) {
                g.fill(dx + i, dy + i, dx + i + 1, dy + i + 1, Theme.RED);
                g.fill(dx + i, dy - i, dx + i + 1, dy - i + 1, Theme.RED);
            }
            if (Math.abs(mx - dx) < 6 && Math.abs(my - dy) < 6) tooltip(g, "Where you died", dx, dy - 14);
        }
        if (player != null) {
            Draw.arrow(g, screenX(player.getX()), screenY(player.getZ()), player.getYRot(), 5, 0xFFFFFFFF, 0xD0000000);
        }

        // header
        String dim = minecraft.level == null ? "" : minecraft.level.dimension().toString();
        int slash = dim.lastIndexOf('/');
        String dimName = slash >= 0 ? dim.substring(slash + 1).replace("]", "").replace("minecraft:", "").replace('_', ' ').trim() : dim;
        String title = "World map  ·  " + (dimName.isEmpty() ? "" : Character.toUpperCase(dimName.charAt(0)) + dimName.substring(1));
        int tw = font.width(title) + 34;
        Draw.round(g, 8, 6, 8 + tw, 22, 4, Draw.withAlpha(Theme.BASE, 230));
        Icons.draw(g, "worldmap", 13, 8, 12, Theme.ACCENT);
        g.text(title, 29, 10, Theme.TEXT, false);

        String hint = "Drag to move  ·  Scroll to zoom  ·  " + (QolFeatures.worldMap.openKey() != null ? QolFeatures.worldMap.openKey().getTranslatedKeyMessage().getString() + " or " : "") + "Esc to close";
        int hw = font.width(hint) + 16;
        Draw.round(g, (width - hw) / 2, height - 22, (width + hw) / 2, height - 6, 4, Draw.withAlpha(Theme.BASE, 210));
        g.text(hint, (width - hw) / 2 + 8, height - 18, Theme.MUTED, false);

        // centre + close buttons
        boolean hc = mx >= width - 92 && mx < width - 32 && my >= 6 && my < 22;
        Draw.round(g, width - 92, 6, width - 32, 22, 4, follow ? Theme.ACCENT : hc ? Theme.LINE : Draw.withAlpha(Theme.BASE, 230));
        g.text("Centre", width - 62 - font.width("Centre") / 2, 10, follow ? Theme.ON_ACCENT : Theme.TEXT, false);
        boolean hx = mx >= width - 26 && mx < width - 8 && my >= 6 && my < 22;
        Draw.round(g, width - 26, 6, width - 8, 22, 4, hx ? Theme.RED : Draw.withAlpha(Theme.BASE, 230));
        Icons.draw(g, "ui_close", width - 23, 8, 12, hx ? 0xFFFFFFFF : Theme.MUTED);

        // cursor position
        if (QolFeatures.worldMap.showCursor()) {
            String pos = (int) Math.floor(worldX(mx)) + ", " + (int) Math.floor(worldZ(my));
            int pw = font.width(pos) + 12;
            Draw.round(g, 8, height - 22, 8 + pw, height - 6, 4, Draw.withAlpha(Theme.BASE, 210));
            g.text(pos, 14, height - 18, Theme.TEXT, false);
        }
        String zoom = (LEVELS[level][1] == 1 ? LEVELS[level][0] + " px per block" : "1 px = " + LEVELS[level][1] / LEVELS[level][0] + " blocks");
        g.text(zoom, width - 8 - font.width(zoom), height - 18, Theme.MUTED, false);
    }

    private void tooltip(Gfx g, String text, int x, int y) {
        int w = font.width(text) + 8;
        Draw.round(g, x - w / 2, y, x + w / 2, y + 12, 3, Draw.withAlpha(Theme.BASE, 235));
        g.text(text, x - w / 2 + 4, y + 2, Theme.TEXT, false);
    }

    @Override
    public void onClose() {
        Compat.setScreen(minecraft, null);
    }
}
