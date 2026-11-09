package dev.ember.overlay.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Shared look for HUD readouts: translucent deepslate plate, white text, copper accent. */
public final class HudStyle {
    public static final int BG = 0x90191C22;
    public static final int TEXT = 0xFFE7E9EE;
    public static final int MUTED = 0xFF8D95A5;
    public static final int ACCENT = 0xFF4FB8A0;
    public static final int WARN = 0xFFE3B341;
    public static final int DANGER = 0xFFE5484D;
    public static final int PAD = 3;
    public static final int GAP = 2;

    private HudStyle() {}

    /** Draws a label plate and returns the height consumed (including the gap). */
    public static int label(GuiGraphicsExtractor g, Minecraft mc, String text, int x, int y) {
        int w = mc.font.width(text) + PAD * 2;
        int h = mc.font.lineHeight + PAD * 2 - 1;
        g.fill(x, y, x + w, y + h, BG);
        g.text(mc.font, text, x + PAD, y + PAD, TEXT, false);
        return h + GAP;
    }
}
