package dev.ember.overlay.ui;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Tiny immediate-mode helper: while drawing, screens register clickable/draggable zones;
 * clicks are matched against the zones of the last frame. Also keeps per-element animations.
 */
final class Ui {
    interface Drag {
        void at(double x, double y);
    }

    private record Zone(int x1, int y1, int x2, int y2, Runnable click, Drag drag) {}

    private final List<Zone> zones = new ArrayList<>(), next = new ArrayList<>();
    private final Map<String, float[]> anims = new HashMap<>();
    private Drag dragging;
    private long lastNanos;
    int mx, my;
    /** Seconds since the previous frame (capped). */
    float dt;
    private int cx1 = Integer.MIN_VALUE, cy1 = Integer.MIN_VALUE, cx2 = Integer.MAX_VALUE, cy2 = Integer.MAX_VALUE;

    void begin(int mouseX, int mouseY) {
        long now = System.nanoTime();
        dt = lastNanos == 0 ? 0 : Math.min(0.1f, (now - lastNanos) / 1e9f);
        lastNanos = now;
        mx = mouseX;
        my = mouseY;
        next.clear();
        if (dragging != null) dragging.at(mx, my);
    }

    /** Swap in the zones registered this frame. */
    void end() {
        zones.clear();
        zones.addAll(next);
        unclip();
    }

    void clip(int x1, int y1, int x2, int y2) {
        cx1 = x1;
        cy1 = y1;
        cx2 = x2;
        cy2 = y2;
    }

    void unclip() {
        cx1 = cy1 = Integer.MIN_VALUE;
        cx2 = cy2 = Integer.MAX_VALUE;
    }

    boolean dragging() {
        return dragging != null;
    }

    boolean hover(int x1, int y1, int x2, int y2) {
        return dragging == null && mx >= Math.max(x1, cx1) && mx < Math.min(x2, cx2) && my >= Math.max(y1, cy1) && my < Math.min(y2, cy2);
    }

    void click(int x1, int y1, int x2, int y2, Runnable r) {
        next.add(new Zone(Math.max(x1, cx1), Math.max(y1, cy1), Math.min(x2, cx2), Math.min(y2, cy2), r, null));
    }

    void drag(int x1, int y1, int x2, int y2, Drag d) {
        next.add(new Zone(Math.max(x1, cx1), Math.max(y1, cy1), Math.min(x2, cx2), Math.min(y2, cy2), null, d));
    }

    /** Returns true when the press hit a zone. Later zones are on top. */
    boolean press(double x, double y) {
        for (int i = zones.size() - 1; i >= 0; i--) {
            Zone z = zones.get(i);
            if (x < z.x1() || x >= z.x2() || y < z.y1() || y >= z.y2()) continue;
            if (z.drag() != null) {
                dragging = z.drag();
                dragging.at(x, y);
            } else z.click().run();
            return true;
        }
        return false;
    }

    void release() {
        dragging = null;
    }

    /** Eases a 0..1 value towards target; speed ~ 1/seconds. */
    float anim(String key, boolean target, float speed) {
        float[] v = anims.computeIfAbsent(key, k -> new float[]{target ? 1 : 0});
        float goal = target ? 1 : 0;
        float step = dt * speed;
        v[0] = v[0] < goal ? Math.min(goal, v[0] + step) : Math.max(goal, v[0] - step);
        return v[0];
    }

    static float easeOut(float t) {
        float u = 1 - t;
        return 1 - u * u * u;
    }
}
