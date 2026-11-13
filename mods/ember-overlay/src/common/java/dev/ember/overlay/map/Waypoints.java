package dev.ember.overlay.map;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import net.fabricmc.loader.api.FabricLoader;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Waypoints for the current world and dimension (like Xaero's): made from the world map
 * (right-click), shown on the world map and minimap. Saved in config/ember-map.
 */
public final class Waypoints {
    private Waypoints() {}

    public static final int[] COLORS = {0xFFEF4F5A, 0xFFE8B931, 0xFF3CCF6E, 0xFF5CC8F2, 0xFFA07CF0, 0xFFF06CC0, 0xFFE07C4C, 0xFFFFFFFF};

    public static final class Waypoint {
        public String name;
        public int x, y, z;
        public int color;
        public boolean visible = true;

        public Waypoint(String name, int x, int y, int z, int color) {
            this.name = name;
            this.x = x;
            this.y = y;
            this.z = z;
            this.color = color;
        }

        /** One or two letters for the marker. */
        public String initial() {
            String n = name == null ? "" : name.trim();
            return n.isEmpty() ? "?" : n.substring(0, 1).toUpperCase();
        }
    }

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static List<Waypoint> list = new ArrayList<>();
    private static String loadedFor = "";

    private static Path file(String world) {
        return FabricLoader.getInstance().getConfigDir().resolve("ember-map").resolve(world + ".waypoints.json");
    }

    public static List<Waypoint> all() {
        String w = MapData.world();
        if (!w.equals(loadedFor)) {
            loadedFor = w;
            list = new ArrayList<>();
            if (!w.isEmpty()) {
                try {
                    Path f = file(w);
                    if (Files.exists(f)) {
                        List<Waypoint> read = GSON.fromJson(Files.readString(f), new TypeToken<List<Waypoint>>() {}.getType());
                        if (read != null) list = new ArrayList<>(read);
                    }
                } catch (Exception e) {
                    System.err.println("[ember-overlay] could not read waypoints: " + e);
                }
            }
        }
        return list;
    }

    public static Waypoint add(String name, int x, int y, int z) {
        Waypoint w = new Waypoint(name, x, y, z, COLORS[all().size() % COLORS.length]);
        all().add(w);
        save();
        return w;
    }

    public static void remove(Waypoint w) {
        all().remove(w);
        save();
    }

    public static void save() {
        if (loadedFor.isEmpty()) return;
        try {
            Path f = file(loadedFor);
            Files.createDirectories(f.getParent());
            Files.writeString(f, GSON.toJson(list));
        } catch (Exception e) {
            System.err.println("[ember-overlay] could not save waypoints: " + e);
        }
    }
}
