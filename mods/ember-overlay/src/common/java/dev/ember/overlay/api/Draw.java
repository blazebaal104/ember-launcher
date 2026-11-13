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

    /**
     * A filled arrow head centred on (cx, cy) pointing towards {@code yawDeg} (Minecraft yaw:
     * 0 = south/down the screen, 180 = north/up), drawn row by row.
     */
    public static void arrow(Gfx g, int cx, int cy, float yawDeg, int size, int argb, int outline) {
        double a = Math.toRadians(yawDeg);
        // direction the tip points to, in screen space (x right, y down)
        double fx = -Math.sin(a), fy = Math.cos(a);
        double px = -fy, py = fx; // perpendicular
        double tipX = fx * size, tipY = fy * size;
        double l1x = -fx * size * 0.7 + px * size * 0.75, l1y = -fy * size * 0.7 + py * size * 0.75;
        double l2x = -fx * size * 0.7 - px * size * 0.75, l2y = -fy * size * 0.7 - py * size * 0.75;
        double nx = -fx * size * 0.3, ny = -fy * size * 0.3; // notch
        for (int pass = 0; pass < 2; pass++) {
            int color = pass == 0 ? outline : argb;
            double grow = pass == 0 ? 1.2 : 0;
            if ((color >>> 24) == 0) continue;
            for (int y = -size - 2; y <= size + 2; y++) {
                int start = Integer.MIN_VALUE;
                for (int x = -size - 2; x <= size + 3; x++) {
                    boolean in = x <= size + 2 && (inside(x + 0.5, y + 0.5, tipX, tipY, l1x, l1y, nx, ny, grow) || inside(x + 0.5, y + 0.5, tipX, tipY, nx, ny, l2x, l2y, grow));
                    if (in && start == Integer.MIN_VALUE) start = x;
                    else if (!in && start != Integer.MIN_VALUE) {
                        g.fill(cx + start, cy + y, cx + x, cy + y + 1, color);
                        start = Integer.MIN_VALUE;
                    }
                }
            }
        }
    }

    private static boolean inside(double x, double y, double ax, double ay, double bx, double by, double cx, double cy, double grow) {
        double d1 = side(x, y, ax, ay, bx, by), d2 = side(x, y, bx, by, cx, cy), d3 = side(x, y, cx, cy, ax, ay);
        double tol = grow * Math.max(Math.hypot(bx - ax, by - ay), 1);
        boolean neg = d1 < -tol || d2 < -tol || d3 < -tol, pos = d1 > tol || d2 > tol || d3 > tol;
        return !(neg && pos);
    }

    private static double side(double x, double y, double ax, double ay, double bx, double by) {
        return (x - bx) * (ay - by) - (ax - bx) * (y - by);
    }
}
