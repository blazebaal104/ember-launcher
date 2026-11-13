package dev.ember.overlay.map;

import dev.ember.overlay.api.Gfx;

/**
 * Turns a rectangle of {@link MapData} into horizontal runs of same-coloured cells, rebuilt
 * only when the view or the terrain changes, and draws them with plain fills (so it works the
 * same on every Minecraft version).
 */
public final class MapView {
    private int[] runs = new int[4096]; // x1, x2, y, h, colour per run
    private int count;
    private long lastKey = Long.MIN_VALUE;
    private int lastVersion = -1;
    private long lastBuild;

    /**
     * @param left,top  world X/Z at the top-left corner
     * @param w,h       size in pixels
     * @param cellPx    pixels per cell
     * @param bpc       blocks per cell
     * @param circle    clip to the inscribed circle
     */
    public void build(double left, double top, int w, int h, int cellPx, double bpc, boolean circle) {
        long key = 17;
        key = key * 31 + (long) Math.floor(left / bpc);
        key = key * 31 + (long) Math.floor(top / bpc);
        key = key * 31 + w;
        key = key * 31 + h;
        key = key * 31 + cellPx;
        key = key * 31 + Double.hashCode(bpc);
        key = key * 31 + (circle ? 1 : 0);
        long now = System.currentTimeMillis();
        boolean terrainChanged = MapData.version != lastVersion && now - lastBuild > 150;
        if (key == lastKey && !terrainChanged) return;
        lastKey = key;
        lastVersion = MapData.version;
        lastBuild = now;
        count = 0;
        int cols = (w + cellPx - 1) / cellPx, rows = (h + cellPx - 1) / cellPx;
        double cx = w / 2.0, cy = h / 2.0, r2 = Math.min(cx, cy) * Math.min(cx, cy);
        for (int row = 0; row < rows; row++) {
            int py = row * cellPx, ph = Math.min(cellPx, h - py);
            int c0 = 0, c1 = cols;
            if (circle) {
                double dy = py + ph / 2.0 - cy;
                if (dy * dy > r2) continue;
                double half = Math.sqrt(r2 - dy * dy);
                c0 = Math.max(0, (int) Math.floor((cx - half) / cellPx));
                c1 = Math.min(cols, (int) Math.ceil((cx + half) / cellPx));
            }
            int wz = (int) Math.floor(top + (row + 0.5) * bpc);
            int runStart = -1, runColor = 0;
            for (int col = c0; col <= c1; col++) {
                int color = col < c1 ? MapData.colorAt((int) Math.floor(left + (col + 0.5) * bpc), wz) : 0;
                if (col < c1 && color == runColor && runStart >= 0) continue;
                if (runStart >= 0 && runColor != 0) add(runStart * cellPx, Math.min(w, col * cellPx), py, ph, runColor);
                runStart = col;
                runColor = color;
            }
        }
    }

    private void add(int x1, int x2, int y, int h, int color) {
        if (count * 5 + 5 > runs.length) runs = java.util.Arrays.copyOf(runs, runs.length * 2);
        int i = count++ * 5;
        runs[i] = x1;
        runs[i + 1] = x2;
        runs[i + 2] = y;
        runs[i + 3] = h;
        runs[i + 4] = color;
    }

    /** Draw at screen position (ox, oy). */
    public void draw(Gfx g, int ox, int oy) {
        for (int i = 0; i < count; i++) {
            int j = i * 5;
            g.fill(ox + runs[j], oy + runs[j + 2], ox + runs[j + 1], oy + runs[j + 2] + runs[j + 3], runs[j + 4]);
        }
    }

    public int runs() {
        return count;
    }
}
