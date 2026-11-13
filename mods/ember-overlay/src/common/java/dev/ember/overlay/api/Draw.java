package dev.ember.overlay.api;

/** Shape and colour helpers built only from {@link Gfx#fill}, so they work on every version. */
public final class Draw {
    private Draw() {}

    /** Precomputed corner insets for radius 0..8 (row i of a radius-r corner is inset[r][i] pixels in). */
    private static final int[][] INSET = new int[9][];

    static {
        for (int r = 0; r <= 8; r++) {
            INSET[r] = new int[r];
            for (int i = 0; i < r; i++) {
                double dy = r - i - 0.5;
                INSET[r][i] = (int) Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
            }
        }
    }

    /** Filled rounded rectangle without overlapping fills (so translucent colours stay even). */
    public static void round(Gfx g, int x1, int y1, int x2, int y2, int r, int argb) {
        if ((argb >>> 24) == 0 || x2 <= x1 || y2 <= y1) return;
        r = Math.max(0, Math.min(Math.min(r, 8), Math.min(x2 - x1, y2 - y1) / 2));
        int[] in = INSET[r];
        for (int i = 0; i < r; i++) {
            g.fill(x1 + in[i], y1 + i, x2 - in[i], y1 + i + 1, argb);
            g.fill(x1 + in[i], y2 - i - 1, x2 - in[i], y2 - i, argb);
        }
        g.fill(x1, y1 + r, x2, y2 - r, argb);
    }

    /** 1px rounded outline. */
    public static void outline(Gfx g, int x1, int y1, int x2, int y2, int r, int argb) {
        if ((argb >>> 24) == 0) return;
        r = Math.max(0, Math.min(Math.min(r, 8), Math.min(x2 - x1, y2 - y1) / 2));
        int[] in = INSET[r];
        for (int i = 0; i < r; i++) {
            int next = i + 1 < r ? in[i + 1] : 0;
            int a = in[i], b = Math.max(a + 1, next);
            g.fill(x1 + a, y1 + i, x1 + b, y1 + i + 1, argb);
            g.fill(x2 - b, y1 + i, x2 - a, y1 + i + 1, argb);
            g.fill(x1 + a, y2 - i - 1, x1 + b, y2 - i, argb);
            g.fill(x2 - b, y2 - i - 1, x2 - a, y2 - i, argb);
        }
        g.fill(x1 + r, y1, x2 - r, y1 + 1, argb);
        g.fill(x1 + r, y2 - 1, x2 - r, y2, argb);
        g.fill(x1, y1 + r, x1 + 1, y2 - r, argb);
        g.fill(x2 - 1, y1 + r, x2, y2 - r, argb);
    }

    /** Vertical gradient in bands (menus only; a few dozen fills). */
    public static void vgradient(Gfx g, int x1, int y1, int x2, int y2, int top, int bottom) {
        int h = y2 - y1, band = Math.max(2, h / 24);
        for (int y = y1; y < y2; y += band) {
            float t = (y - y1) / (float) Math.max(1, h);
            g.fill(x1, y, x2, Math.min(y2, y + band), mix(top, bottom, t));
        }
    }

    /** Filled circle. */
    public static void circle(Gfx g, int cx, int cy, int r, int argb) {
        for (int dy = -r; dy < r; dy++) {
            double yy = dy + 0.5;
            int half = (int) Math.round(Math.sqrt(Math.max(0, r * r - yy * yy)));
            if (half > 0) g.fill(cx - half, cy + dy, cx + half, cy + dy + 1, argb);
        }
    }

    public static int alpha(int argb, float a) {
        int na = Math.round(((argb >>> 24) & 0xFF) * Math.max(0, Math.min(1, a)));
        return (na << 24) | (argb & 0xFFFFFF);
    }

    public static int withAlpha(int rgb, int a) {
        return (Math.max(0, Math.min(255, a)) << 24) | (rgb & 0xFFFFFF);
    }

    public static int mix(int c1, int c2, float t) {
        t = Math.max(0, Math.min(1, t));
        int a = (int) (((c1 >>> 24) & 0xFF) + (((c2 >>> 24) & 0xFF) - ((c1 >>> 24) & 0xFF)) * t);
        int r = (int) (((c1 >> 16) & 0xFF) + (((c2 >> 16) & 0xFF) - ((c1 >> 16) & 0xFF)) * t);
        int gg = (int) (((c1 >> 8) & 0xFF) + (((c2 >> 8) & 0xFF) - ((c1 >> 8) & 0xFF)) * t);
        int b = (int) ((c1 & 0xFF) + ((c2 & 0xFF) - (c1 & 0xFF)) * t);
        return (a << 24) | (r << 16) | (gg << 8) | b;
    }

    /** Brighten (t > 0) towards white. */
    public static int lighten(int argb, float t) {
        return mix(argb, (argb & 0xFF000000) | 0xFFFFFF, t);
    }

    /** Perceived brightness 0..1, to pick dark or light text on a coloured background. */
    public static float luma(int argb) {
        return (0.299f * ((argb >> 16) & 0xFF) + 0.587f * ((argb >> 8) & 0xFF) + 0.114f * (argb & 0xFF)) / 255f;
    }
}
