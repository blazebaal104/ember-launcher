package dev.ember.overlay.ui;

import dev.ember.overlay.api.Draw;
import dev.ember.overlay.api.Gfx;
import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.compat.EmberScreen;
import dev.ember.overlay.core.Config;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.FeatureRegistry;
import dev.ember.overlay.hud.HudLook;
import dev.ember.overlay.hud.HudModule;
import dev.ember.overlay.hud.HudRenderer;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Edit HUD layout: drag modules anywhere, scroll over one to resize it, right-click to put it
 * back in the automatic column. Positions are saved as fractions of the screen so they stay in
 * place at any window size or GUI scale. Snaps to the screen edges and centre lines.
 */
public final class HudEditorScreen extends EmberScreen {
    private static final int SNAP = 5;
    private final Screen parent;
    private final Feature focus;
    private final Ui ui = new Ui();
    private Feature dragging;
    private int grabX, grabY;
    private boolean guideX, guideY;

    public HudEditorScreen(Screen parent, Feature focus) {
        super(Component.literal("Edit HUD layout"));
        this.parent = parent;
        this.focus = focus;
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
        HudRenderer.suppressed = true;
        // Show the module you came from even if it was off, so it can be placed.
        if (focus != null && focus.isAvailable() && !focus.isEnabled()) focus.setEnabled(true);
    }

    private List<Feature> modules() {
        List<Feature> out = new ArrayList<>();
        for (HudModule m : FeatureRegistry.hud()) if (m.positionable() && m instanceof Feature f) out.add(f);
        return out;
    }

    private static float scaleOf(Feature f) {
        HudLook l = ((HudModule) f).look();
        return l == null ? 1f : l.scale();
    }

    private int[] rect(Feature f) {
        float s = scaleOf(f);
        return new int[]{f.lastX, f.lastY, Math.max(8, Math.round(f.lastW * s)), Math.max(8, Math.round(f.lastH * s))};
    }

    private Feature under(double x, double y) {
        List<Feature> list = modules();
        for (int i = list.size() - 1; i >= 0; i--) {
            int[] r = rect(list.get(i));
            if (x >= r[0] - 2 && x < r[0] + r[2] + 2 && y >= r[1] - 2 && y < r[1] + r[3] + 2) return list.get(i);
        }
        return null;
    }

    @Override
    protected boolean onMousePress(double x, double y, int button) {
        if (ui.press(x, y)) return true;
        Feature f = under(x, y);
        if (f == null) return false;
        if (button == 1) {
            f.posX = f.posY = -1;
            return true;
        }
        if (button == 0) {
            dragging = f;
            grabX = (int) x - f.lastX;
            grabY = (int) y - f.lastY;
            return true;
        }
        return false;
    }

    @Override
    protected void onMouseRelease(double x, double y, int button) {
        dragging = null;
        ui.release();
    }

    @Override
    public boolean mouseScrolled(double x, double y, double horizontal, double vertical) {
        Feature f = under(x, y);
        if (f == null) return false;
        HudLook l = ((HudModule) f).look();
        if (l != null) l.size.set(l.size.v + (vertical > 0 ? 10 : -10));
        return true;
    }

    private void move(int mx, int my) {
        Feature f = dragging;
        int[] r = rect(f);
        int w = r[2], h = r[3];
        int nx = mx - grabX, ny = my - grabY;
        guideX = guideY = false;
        // snap to edges (4 px margin) and to the centre lines
        if (Math.abs(nx - 4) < SNAP) nx = 4;
        if (Math.abs(nx + w - (width - 4)) < SNAP) nx = width - 4 - w;
        if (Math.abs(ny - 4) < SNAP) ny = 4;
        if (Math.abs(ny + h - (height - 4)) < SNAP) ny = height - 4 - h;
        if (Math.abs(nx + w / 2 - width / 2) < SNAP) {
            nx = width / 2 - w / 2;
            guideX = true;
        }
        if (Math.abs(ny + h / 2 - height / 2) < SNAP) {
            ny = height / 2 - h / 2;
            guideY = true;
        }
        nx = Math.max(0, Math.min(width - w, nx));
        ny = Math.max(0, Math.min(height - h, ny));
        f.posX = width - w <= 0 ? 0 : nx / (float) (width - w);
        f.posY = height - h <= 0 ? 0 : ny / (float) (height - h);
        f.lastX = nx;
        f.lastY = ny;
    }

    @Override
    protected void drawBackdrop(Gfx g, int mouseX, int mouseY) {
        ui.begin(mouseX, mouseY);
        if (dragging != null) move(mouseX, mouseY);
        g.fill(0, 0, width, height, 0x30000000);
        // faint grid helps line things up
        for (int x = 0; x < width; x += 20) g.fill(x, 0, x + 1, height, 0x0CFFFFFF);
        for (int y = 0; y < height; y += 20) g.fill(0, y, width, y + 1, 0x0CFFFFFF);
        if (dragging != null && guideX) g.fill(width / 2, 0, width / 2 + 1, height, Theme.ACCENT);
        if (dragging != null && guideY) g.fill(0, height / 2, width, height / 2 + 1, Theme.ACCENT);

        if (minecraft.player != null) HudRenderer.drawAll(g, minecraft);

        List<Feature> list = modules();
        Feature hov = dragging != null ? dragging : under(mouseX, mouseY);
        for (Feature f : list) {
            int[] r = rect(f);
            boolean active = f == hov || f == focus;
            if (active) Draw.round(g, r[0] - 2, r[1] - 2, r[0] + r[2] + 2, r[1] + r[3] + 2, 2, Draw.withAlpha(Theme.ACCENT, 40));
            Draw.outline(g, r[0] - 2, r[1] - 2, r[0] + r[2] + 2, r[1] + r[3] + 2, 2, active ? Theme.ACCENT : 0x70FFFFFF);
            if (active) {
                String label = f.name + "  " + Math.round(scaleOf(f) * 100) + "%";
                int lw = font.width(label) + 8, ly = r[1] - 15 < 0 ? r[1] + r[3] + 4 : r[1] - 15;
                int lx = Math.max(2, Math.min(width - lw - 2, r[0] - 2));
                Draw.round(g, lx, ly, lx + lw, ly + 12, 3, Theme.ACCENT);
                g.text(label, lx + 4, ly + 2, Theme.ON_ACCENT, false);
            }
        }

        // help pill
        String help = list.isEmpty()
                ? "Turn on a HUD module in the menu first, then place it here."
                : "Drag to move  ·  Scroll to resize  ·  Right-click to reset";
        int hw = font.width(help) + 20, hx = (width - hw) / 2, hy = 8;
        Draw.round(g, hx, hy, hx + hw, hy + 18, 6, Draw.withAlpha(Theme.BASE, 230));
        Draw.outline(g, hx, hy, hx + hw, hy + 18, 6, Draw.withAlpha(Theme.LINE, 255));
        g.text(help, hx + 10, hy + 5, Theme.TEXT, false);

        // buttons
        int bw = 80, by = height - 28, bx = width / 2 - bw - 3;
        pill(g, "Back to menu", bx, by, bw, false, this::back);
        pill(g, "Done", width / 2 + 3, by, bw, true, this::done);
        ui.end();
    }

    private void pill(Gfx g, String label, int x, int y, int w, boolean primary, Runnable action) {
        boolean hov = ui.hover(x, y, x + w, y + 18);
        int bg = primary ? (hov ? Draw.lighten(Theme.ACCENT, 0.12f) : Theme.ACCENT) : (hov ? Theme.LINE : Draw.withAlpha(Theme.BASE, 235));
        Draw.round(g, x, y, x + w, y + 18, 5, bg);
        if (!primary) Draw.outline(g, x, y, x + w, y + 18, 5, Draw.withAlpha(Theme.LINE, 255));
        g.text(label, x + (w - font.width(label)) / 2, y + 5, primary ? Theme.ON_ACCENT : Theme.TEXT, false);
        ui.click(x, y, x + w, y + 18, action);
    }

    private void back() {
        Config.save();
        HudRenderer.suppressed = false;
        Compat.setScreen(minecraft, parent instanceof OverlayScreen ? parent : new OverlayScreen());
    }

    private void done() {
        Config.save();
        HudRenderer.suppressed = false;
        Compat.setScreen(minecraft, null);
    }

    @Override
    public void onClose() {
        done();
    }

    @Override
    public void removed() {
        HudRenderer.suppressed = false;
        Config.save();
        super.removed();
    }
}
