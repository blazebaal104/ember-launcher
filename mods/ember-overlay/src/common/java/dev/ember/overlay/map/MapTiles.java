package dev.ember.overlay.map;

import dev.ember.overlay.api.Canvas;
import dev.ember.overlay.compat.Compat;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * The explored map as 128x128-block textures (one pixel per block), built from {@link MapData}
 * and rebuilt only when a chunk inside them changes. Drawing the world map is then one textured
 * quad per visible tile, at any zoom.
 */
public final class MapTiles {
    private MapTiles() {}

    public static final int SIZE = 128;
    private static final int MAX_TILES = 400;

    private static final class Tile {
        Canvas canvas;
        int builtVersion = -1;
        long lastUsed;
    }

    private static final Map<Long, Tile> tiles = new HashMap<>();
    private static String world;

    public static long key(int tx, int tz) {
        return ((long) tx << 32) ^ (tz & 0xFFFFFFFFL);
    }

    /**
     * The tile texture covering blocks [tx*128, tx*128+128) x [tz*128, ...), rebuilding it if its
     * terrain changed. {@code budget[0]} limits rebuilds per frame (so panning never stutters);
     * a tile that's out of budget is drawn as it was.
     */
    public static Canvas get(int tx, int tz, int[] budget) {
        if (!MapData.world().equals(world)) clear();
        world = MapData.world();
        long k = key(tx, tz);
        int ver = MapData.tileVersion(tx, tz);
        if (ver < 0) return null; // nothing explored there
        Tile t = tiles.get(k);
        if (t == null) {
            if (budget[0] <= 0) return null;
            t = new Tile();
            try {
                t.canvas = Compat.canvas("map_" + Integer.toHexString(tx) + "_" + Integer.toHexString(tz) + "_" + tiles.size(), SIZE, SIZE);
            } catch (Throwable e) {
                return null;
            }
            tiles.put(k, t);
        }
        t.lastUsed = System.currentTimeMillis();
        if (t.builtVersion != ver && budget[0] > 0) {
            budget[0]--;
            Canvas c = t.canvas;
            int bx = tx * SIZE, bz = tz * SIZE;
            for (int z = 0; z < SIZE; z++)
                for (int x = 0; x < SIZE; x++) c.set(x, z, MapData.colorAt(bx + x, bz + z));
            c.upload();
            t.builtVersion = ver;
        }
        if (tiles.size() > MAX_TILES) evict();
        return t.builtVersion < 0 ? null : t.canvas;
    }

    private static void evict() {
        long cutoff = System.currentTimeMillis() - 20_000;
        Iterator<Tile> it = tiles.values().iterator();
        while (it.hasNext()) {
            Tile t = it.next();
            if (t.lastUsed < cutoff) {
                t.canvas.close();
                it.remove();
            }
        }
    }

    public static void clear() {
        for (Tile t : tiles.values()) t.canvas.close();
        tiles.clear();
    }
}
