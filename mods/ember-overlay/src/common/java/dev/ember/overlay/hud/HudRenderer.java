package dev.ember.overlay.hud;

import dev.ember.overlay.api.Gfx;
import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.FeatureRegistry;
import net.minecraft.client.Minecraft;

import java.util.List;

/**
 * The single HUD layer. Iterates the pre-filtered active list; modules the player placed are
 * drawn where they were dropped (stored as fractions of the screen, so they survive resizing),
 * the rest stack in a column on the left.
 */
public final class HudRenderer {
    private HudRenderer() {}

    /** True while the layout editor draws the HUD itself. */
    public static volatile boolean suppressed;
    private static final Tracker TRACKER = new Tracker();

    public static void register() {
        Compat.addHud(graphics -> {
            Minecraft mc = Minecraft.getInstance();
            if (suppressed || mc.player == null || Compat.hudHidden(mc)) return;
            drawAll(graphics, mc);
        });
    }

    /** Draws every active module; also used by the layout editor. */
    public static void drawAll(Gfx g, Minecraft mc) {
        List<HudModule> modules = FeatureRegistry.hud();
        int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
        int column = 4;
        for (int i = 0, n = modules.size(); i < n; i++) {
            HudModule m = modules.get(i);
            if (!m.positionable() || !(m instanceof Feature f)) {
                m.render(g, mc, 0, 0);
                continue;
            }
            HudLook look = m.look();
            float s = look == null ? 1f : look.scale();
            float fx = f.posX, fy = f.posY;
            if (fx < 0) {
                float[] d = m.defaultPos();
                if (d != null) {
                    fx = d[0];
                    fy = d[1];
                }
            }
            int w = Math.round(f.lastW * s), h = Math.round(f.lastH * s);
            float px, py;
            if (fx < 0) {
                px = 4;
                py = column;
            } else {
                px = Math.round(fx * Math.max(0, sw - w));
                py = Math.round(fy * Math.max(0, sh - h));
            }
            f.lastX = Math.round(px);
            f.lastY = Math.round(py);
            g.push(px, py, s);
            int used = m.render(TRACKER.begin(g), mc, 0, 0);
            g.pop();
            f.lastW = TRACKER.width();
            f.lastH = TRACKER.height();
            if (fx < 0) column += Math.round(used * s);
        }
    }
}
