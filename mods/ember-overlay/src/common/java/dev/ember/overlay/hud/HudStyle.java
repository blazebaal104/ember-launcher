package dev.ember.overlay.hud;

import dev.ember.overlay.api.Draw;
import dev.ember.overlay.api.Gfx;
import net.minecraft.client.Minecraft;

/** Shared look for HUD readouts. Defaults match the launcher (deepslate + oxidised copper). */
public final class HudStyle {
    public static final int BG = 0x90191C22;
    public static final int TEXT = 0xFFE9EBF0;
    public static final int MUTED = 0xFF8E96A6;
    public static final int ACCENT = 0xFF4FB8A0;
    public static final int GOOD = 0xFF3CCF6E;
    public static final int WARN = 0xFFE3B341;
    public static final int DANGER = 0xFFE5484D;
    public static final int GAP = 2;

    private HudStyle() {}

    public static void plate(Gfx g, HudLook look, int x1, int y1, int x2, int y2) {
        int bg = look == null ? BG : look.bg();
        if (bg == 0) return;
        if (look == null || look.rounded.v) Draw.round(g, x1, y1, x2, y2, 2, bg);
        else g.fill(x1, y1, x2, y2, bg);
    }

    /** Draws a label plate (one or more lines split by '\n') and returns the height used, gap included. */
    public static int label(Gfx g, Minecraft mc, String text, int x, int y, HudLook look, int color) {
        if (text == null || text.isEmpty()) return 0;
        int pad = look == null ? 3 : look.padding.v;
        boolean shadow = look != null && look.shadow.v;
        int lines = 1, w = 0, start = 0;
        for (int i = 0; i <= text.length(); i++) {
            if (i == text.length() || text.charAt(i) == '\n') {
                w = Math.max(w, mc.font.width(text.substring(start, i)));
                if (i < text.length()) lines++;
                start = i + 1;
            }
        }
        int lh = mc.font.lineHeight;
        int h = lines * lh + (lines - 1) + pad * 2 - 1;
        plate(g, look, x, y, x + w + pad * 2, y + h);
        int ly = y + pad;
        start = 0;
        for (int i = 0; i <= text.length(); i++) {
            if (i == text.length() || text.charAt(i) == '\n') {
                g.text(text.substring(start, i), x + pad, ly, color, shadow);
                ly += lh + 1;
                start = i + 1;
            }
        }
        return h + GAP;
    }

    public static int label(Gfx g, Minecraft mc, String text, int x, int y, HudLook look) {
        return label(g, mc, text, x, y, look, look == null ? TEXT : look.text.v);
    }
}
