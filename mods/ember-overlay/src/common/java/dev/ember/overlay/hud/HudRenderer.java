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
            drawAll(graphics, mc, false);
        });
    }

    /** Draws every active module; also used by the layout editor. */
    public static void drawAll(Gfx g, Minecraft mc, boolean editor) {
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
            // "Show while holding key" / "Toggle with key" (the layout editor shows everything)
            if (!editor && look != null && !look.visible()) continue;
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
        if (!editor) placeNew(modules, sw, sh);
    }

    // ------------------------------------------------------------------ automatic placement

    private static boolean overlaps(int ax, int ay, int aw, int ah, int bx, int by, int bw, int bh) {
        return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
    }

    /**
     * A module that was just turned on (no saved position) is given a fixed spot: where it
     * appeared if that's free, otherwise the nearest spot along the screen edges that doesn't
     * cover another module or the hotbar.
     */
    private static void placeNew(List<HudModule> modules, int sw, int sh) {
        for (HudModule m : modules) {
            if (!(m instanceof Feature f) || !m.positionable() || f.posX >= 0 || f.lastW <= 0 || f.lastH <= 0) continue;
            HudLook look = m.look();
            float s = look == null ? 1f : look.scale();
            int w = Math.round(f.lastW * s), h = Math.round(f.lastH * s);
            int bestX = f.lastX, bestY = f.lastY;
            if (blocked(f, modules, bestX, bestY, w, h, sw, sh)) {
                long bestD = Long.MAX_VALUE;
                int[][] edges = {{4, -1}, {sw - w - 4, -1}, {-1, 4}, {-1, sh - h - 4}};
                for (int[] e : edges) {
                    int steps = e[0] >= 0 ? sh : sw;
                    for (int t = 4; t + (e[0] >= 0 ? h : w) <= steps - 4; t += 2) {
                        int x = e[0] >= 0 ? e[0] : t, y = e[0] >= 0 ? t : e[1];
                        if (x < 0 || y < 0) continue;
                        long d = (long) (x - f.lastX) * (x - f.lastX) + (long) (y - f.lastY) * (y - f.lastY);
                        if (d >= bestD || blocked(f, modules, x, y, w, h, sw, sh)) continue;
                        bestD = d;
                        bestX = x;
                        bestY = y;
                    }
                }
            }
            f.posX = sw - w <= 0 ? 0 : Math.max(0, Math.min(1, bestX / (float) (sw - w)));
            f.posY = sh - h <= 0 ? 0 : Math.max(0, Math.min(1, bestY / (float) (sh - h)));
            f.lastX = bestX;
            f.lastY = bestY;
            dev.ember.overlay.core.Config.save();
        }
    }

    private static boolean blocked(Feature self, List<HudModule> modules, int x, int y, int w, int h, int sw, int sh) {
        // hotbar, health and hunger
        if (overlaps(x, y, w, h, sw / 2 - 96, sh - 42, 192, 42)) return true;
        for (HudModule o : modules) {
            if (o == self || !(o instanceof Feature of) || !o.positionable() || of.lastW <= 0) continue;
            if (of.posX < 0 && of != self) {
                // not placed yet either: it will find its own spot
                continue;
            }
            HudLook l = o.look();
            float s = l == null ? 1f : l.scale();
            if (overlaps(x, y, w, h, of.lastX - 2, of.lastY - 2, Math.round(of.lastW * s) + 4, Math.round(of.lastH * s) + 4)) return true;
        }
        return false;
    }
}
