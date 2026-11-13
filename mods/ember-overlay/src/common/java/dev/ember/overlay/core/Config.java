package dev.ember.overlay.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * config/ember-overlay.json - lives in the instance folder, so every instance has its own.
 * Holds which features are on, every feature's settings and HUD positions.
 */
public final class Config {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("ember-overlay.json");
    /** 2 = everything off by default, per-feature settings. Older files keep only their settings. */
    private static final int VERSION = 2;

    private Config() {}

    public static void load() {
        if (!Files.exists(FILE)) return;
        try {
            JsonObject root = GSON.fromJson(Files.readString(FILE), JsonObject.class);
            boolean current = root.has("version") && root.get("version").getAsInt() >= VERSION;
            JsonObject settings = root.getAsJsonObject("settings");
            JsonObject layout = root.getAsJsonObject("layout");
            for (Feature f : FeatureRegistry.all()) {
                JsonObject mine = settings == null ? null : settings.getAsJsonObject(f.id);
                if (mine != null) {
                    for (Setting s : f.settings) {
                        JsonElement e = mine.get(s.key);
                        if (e == null || e.isJsonNull()) continue;
                        try {
                            s.load(e);
                        } catch (Exception ignored) {
                            // wrong type after an update: keep the default
                        }
                    }
                }
                if (layout != null && layout.has(f.id)) {
                    JsonObject p = layout.getAsJsonObject(f.id);
                    f.posX = p.get("x").getAsFloat();
                    f.posY = p.get("y").getAsFloat();
                }
            }
            // Before version 2 several features were on by default; start those players clean.
            JsonObject enabled = current ? root.getAsJsonObject("enabled") : null;
            if (enabled != null) {
                for (Feature f : FeatureRegistry.all()) {
                    if (enabled.has(f.id) && f.isAvailable()) f.setEnabled(enabled.get(f.id).getAsBoolean());
                }
            }
        } catch (Exception e) {
            System.err.println("[ember-overlay] could not read config, using defaults: " + e);
        }
    }

    public static void save() {
        JsonObject root = new JsonObject();
        root.addProperty("version", VERSION);
        JsonObject enabled = new JsonObject(), settings = new JsonObject(), layout = new JsonObject();
        for (Feature f : FeatureRegistry.all()) {
            enabled.addProperty(f.id, f.isEnabled());
            if (!f.settings.isEmpty()) {
                JsonObject mine = new JsonObject();
                for (Setting s : f.settings) mine.add(s.key, s.save());
                settings.add(f.id, mine);
            }
            if (f.posX >= 0) {
                JsonObject p = new JsonObject();
                p.addProperty("x", f.posX);
                p.addProperty("y", f.posY);
                layout.add(f.id, p);
            }
        }
        root.add("enabled", enabled);
        root.add("settings", settings);
        root.add("layout", layout);
        try {
            Files.createDirectories(FILE.getParent());
            Files.writeString(FILE, GSON.toJson(root));
        } catch (IOException e) {
            System.err.println("[ember-overlay] could not save config: " + e);
        }
    }
}
