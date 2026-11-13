package dev.ember.overlay.map;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.material.MapColor;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * What the minimap and world map draw: the colour of the top block of every column you have
 * seen, like a vanilla map item, per world and dimension. Chunks around you are (re)scanned a
 * few per tick; explored terrain is saved in config/ember-map so the world map remembers it.
 *
 * Each column is one byte: (map colour id << 2) | shade, 0 = not explored.
 */
public final class MapData {
    private MapData() {}

    private static final int RADIUS = 10; // chunks scanned around the player
    private static final int[][] SPIRAL;
    private static final int[] SHADE = {180, 220, 255, 135};
    private static final int[] RGB = new int[256];
    private static boolean rgbReady;

    static {
        List<int[]> offs = new ArrayList<>();
        for (int dx = -RADIUS; dx <= RADIUS; dx++)
            for (int dz = -RADIUS; dz <= RADIUS; dz++)
                if (dx * dx + dz * dz <= RADIUS * RADIUS) offs.add(new int[]{dx, dz});
        offs.sort((a, b) -> Integer.compare(a[0] * a[0] + a[1] * a[1], b[0] * b[0] + b[1] * b[1]));
        SPIRAL = offs.toArray(new int[0][]);
    }

    private static final ExecutorService SAVER = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "ember-map-save");
        t.setDaemon(true);
        return t;
    });

    private static final Map<Long, byte[]> chunks = new HashMap<>();
    private static final Map<Long, Long> scannedAt = new HashMap<>();
    /** Per 128x128-block tile (8x8 chunks): bumped when terrain inside it changes. */
    private static final Map<Long, Integer> tileVer = new HashMap<>();
    /** Your recent path ("footsteps"), newest last. */
    private static final java.util.ArrayDeque<int[]> trail = new java.util.ArrayDeque<>();
    private static String world;
    private static boolean dirty, caveMode;
    private static long lastSave;
    /** Bumped whenever terrain changes, so views know to rebuild. */
    public static volatile int version;

    public static boolean active;

    // ------------------------------------------------------------------ colours

    private static void buildRgb() {
        for (int id = 0; id < 64; id++) {
            int col;
            try {
                col = MapColor.byId(id).col;
            } catch (RuntimeException e) {
                col = 0;
            }
            for (int s = 0; s < 4; s++) {
                int m = SHADE[s];
                int r = ((col >> 16) & 0xFF) * m / 255, g = ((col >> 8) & 0xFF) * m / 255, b = (col & 0xFF) * m / 255;
                RGB[(id << 2) | s] = 0xFF000000 | (r << 16) | (g << 8) | b;
            }
        }
        RGB[0] = RGB[1] = RGB[2] = RGB[3] = 0;
        rgbReady = true;
    }

    /** ARGB colour of a block column, or 0 if never seen. */
    public static int colorAt(int x, int z) {
        byte[] c = chunks.get(key(x >> 4, z >> 4));
        if (c == null) return 0;
        int p = c[((z & 15) << 4) | (x & 15)] & 0xFF;
        if (p == 0) return 0;
        if (!rgbReady) buildRgb();
        return RGB[p];
    }

    public static String world() {
        return world == null ? "" : world;
    }

    /** Version of a tile's terrain, or -1 if nothing in it was explored. */
    public static int tileVersion(int tx, int tz) {
        Integer v = tileVer.get(key(tx, tz));
        return v == null ? -1 : v;
    }

    public static Iterable<int[]> trail() {
        return trail;
    }

    private static void touchTile(int cx, int cz) {
        tileVer.merge(key(cx >> 3, cz >> 3), 1, Integer::sum);
    }

    public static boolean cave() {
        return caveMode;
    }

    private static long key(int cx, int cz) {
        return ((long) cx << 32) ^ (cz & 0xFFFFFFFFL);
    }

    // ------------------------------------------------------------------ scanning

    private static String worldKey(Minecraft mc) {
        String base;
        try {
            if (mc.getCurrentServer() != null) base = "mp_" + mc.getCurrentServer().ip;
            else if (mc.getSingleplayerServer() != null) base = "sp_" + mc.getSingleplayerServer().getWorldData().getLevelName();
            else base = "world";
        } catch (RuntimeException e) {
            base = "world";
        }
        String dim = mc.level.dimension().toString();
        int slash = dim.lastIndexOf('/');
        if (slash >= 0) dim = dim.substring(slash + 1);
        return (base + "_" + dim).replaceAll("[^A-Za-z0-9._-]", "_");
    }

    /** Called every client tick while the minimap or world map is on. */
    public static void tick(Minecraft mc, boolean caveInNether) {
        if (mc.level == null || mc.player == null) {
            if (world != null) unload();
            return;
        }
        String w = worldKey(mc);
        if (!w.equals(world)) {
            if (world != null) unload();
            load(w);
        }
        caveMode = caveInNether && w.endsWith("the_nether");
        int px = mc.player.getBlockX(), pz = mc.player.getBlockZ();
        int[] last = trail.peekLast();
        if (last == null || Math.abs(last[0] - px) + Math.abs(last[1] - pz) >= 6) {
            trail.addLast(new int[]{px, pz});
            if (trail.size() > 300) trail.removeFirst();
        }
        int pcx = mc.player.getBlockX() >> 4, pcz = mc.player.getBlockZ() >> 4;
        long now = System.currentTimeMillis();
        // Spend at most ~1.5 ms per tick (3% of a tick): the area around you fills in within a
        // second or two without costing FPS. Always restart from the nearest chunks.
        long deadline = System.nanoTime() + 1_500_000;
        for (int i = 0; i < SPIRAL.length && System.nanoTime() < deadline; i++) {
            int[] o = SPIRAL[i];
            int cx = pcx + o[0], cz = pcz + o[1];
            if (!mc.level.hasChunk(cx, cz)) continue;
            long k = key(cx, cz);
            Long at = scannedAt.get(k);
            long maxAge = (Math.abs(o[0]) <= 1 && Math.abs(o[1]) <= 1) ? 1_000 : 15_000;
            if (at != null && now - at < maxAge) continue;
            // only count a chunk as done when (nearly) every column found its colour; the client
            // sometimes has a chunk before its height data, so try again shortly
            if (scan(mc, cx, cz)) scannedAt.put(k, now);
            else scannedAt.put(k, now - maxAge + 500);
        }
        if (dirty && now - lastSave > 60_000) save();
    }

    private static boolean scan(Minecraft mc, int cx, int cz) {
        var level = mc.level;
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        int[] heights = new int[16 * 17];
        int[] ids = new int[256];
        int playerY = mc.player.getBlockY();
        for (int dz = -1; dz < 16; dz++) {
            for (int dx = 0; dx < 16; dx++) {
                int x = (cx << 4) + dx, z = (cz << 4) + dz;
                int y;
                if (caveMode) {
                    y = playerY + 1;
                    int floor = playerY - 48;
                    // skip the air you're standing in, then find the floor
                    while (y > floor && level.getBlockState(pos.set(x, y, z)).isAir()) y--;
                } else {
                    y = level.getHeight(Heightmap.Types.WORLD_SURFACE, x, z) - 1;
                }
                int id = 0, depth = 0;
                for (int i = 0; i < 64; i++) {
                    BlockState st = level.getBlockState(pos.set(x, y, z));
                    MapColor mcol = st.getMapColor(level, pos);
                    if (mcol == MapColor.WATER) {
                        // count water depth for the shade, like vanilla maps
                        if (id == 0) id = MapColor.WATER.id;
                        depth++;
                        y--;
                        continue;
                    }
                    if (id == MapColor.WATER.id) break;
                    if (mcol != MapColor.NONE) {
                        id = mcol.id;
                        break;
                    }
                    y--;
                }
                heights[(dz + 1) * 16 + dx] = id == MapColor.WATER.id ? -depth * 4 : y;
                if (dz >= 0) ids[dz * 16 + dx] = id;
            }
        }
        byte[] out = chunks.computeIfAbsent(key(cx, cz), k -> new byte[256]);
        int missing = 0;
        boolean changed = false;
        for (int dz = 0; dz < 16; dz++) {
            for (int dx = 0; dx < 16; dx++) {
                int id = ids[dz * 16 + dx];
                if (id == 0) {
                    missing++;
                    continue;
                }
                int h = heights[(dz + 1) * 16 + dx], north = heights[dz * 16 + dx];
                int shade;
                if (id == MapColor.WATER.id) shade = h > -8 ? 2 : h > -20 ? 1 : 0;
                else shade = h > north ? 2 : h < north ? 0 : 1;
                byte b = (byte) ((id << 2) | shade);
                if (out[dz * 16 + dx] != b) {
                    out[dz * 16 + dx] = b;
                    dirty = true;
                    changed = true;
                }
            }
        }
        if (changed) {
            touchTile(cx, cz);
            version++;
        }
        return missing < 8;
    }

    // ------------------------------------------------------------------ storage

    private static Path file(String w) {
        return FabricLoader.getInstance().getConfigDir().resolve("ember-map").resolve(w + ".bin.gz");
    }

    private static void load(String w) {
        world = w;
        chunks.clear();
        scannedAt.clear();
        tileVer.clear();
        trail.clear();
        dirty = false;
        lastSave = System.currentTimeMillis();
        Path f = file(w);
        if (!Files.exists(f)) return;
        try (DataInputStream in = new DataInputStream(new GZIPInputStream(Files.newInputStream(f)))) {
            if (in.readInt() != 0x454D4150) return; // "EMAP"
            int n = in.readInt();
            for (int i = 0; i < n; i++) {
                long k = in.readLong();
                byte[] b = new byte[256];
                in.readFully(b);
                chunks.put(k, b);
                tileVer.putIfAbsent(key((int) (k >> 32) >> 3, (int) k >> 3), 0);
            }
        } catch (IOException e) {
            System.err.println("[ember-overlay] could not read map " + f + ": " + e);
        }
        version++;
    }

    private static void save() {
        if (world == null) return;
        Path f = file(world);
        Map<Long, byte[]> copy = new HashMap<>();
        chunks.forEach((k, v) -> copy.put(k, v.clone()));
        dirty = false;
        lastSave = System.currentTimeMillis();
        SAVER.submit(() -> {
            try {
                Files.createDirectories(f.getParent());
                Path tmp = f.resolveSibling(f.getFileName() + ".tmp");
                try (DataOutputStream out = new DataOutputStream(new GZIPOutputStream(Files.newOutputStream(tmp)))) {
                    out.writeInt(0x454D4150);
                    out.writeInt(copy.size());
                    for (var e : copy.entrySet()) {
                        out.writeLong(e.getKey());
                        out.write(e.getValue());
                    }
                }
                Files.move(tmp, f, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                System.err.println("[ember-overlay] could not save map: " + e);
            }
        });
    }

    private static void unload() {
        if (dirty) save();
        world = null;
        chunks.clear();
        scannedAt.clear();
        tileVer.clear();
        trail.clear();
        version++;
    }

    /** Save now (game closing). */
    public static void flush() {
        if (dirty) save();
    }
}
