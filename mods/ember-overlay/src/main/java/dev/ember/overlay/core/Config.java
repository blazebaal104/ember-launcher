package dev.ember.overlay.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** config/ember-overlay.json - lives in the instance folder, so every instance has its own. */
public final class Config {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("ember-overlay.json");

    /** Chat macros bound to the three macro keys. A leading "/" sends a command. */
    public static List<String> macros = new ArrayList<>(List.of("/home", "gg", "/spawn"));
    /** Case-insensitive regexes; matching chat lines are hidden by the chat filter. */
    public static List<String> chatFilterRules = new ArrayList<>(List.of("discord\\.gg/", "(?i)free\\s+(rank|vip)"));
    private static List<Pattern> compiled = List.of();

    private Config() {}

    public static List<Pattern> chatFilters() {
        return compiled;
    }

    private static void compile() {
        List<Pattern> out = new ArrayList<>();
        for (String r : chatFilterRules) {
            try {
                out.add(Pattern.compile(r, Pattern.CASE_INSENSITIVE));
            } catch (Exception e) {
                System.err.println("[ember-overlay] bad chat filter " + r + ": " + e.getMessage());
            }
        }
        compiled = List.copyOf(out);
    }

    public static void load() {
        compile();
        if (!Files.exists(FILE)) return;
        try {
            JsonObject root = GSON.fromJson(Files.readString(FILE), JsonObject.class);
            if (root.has("macros")) {
                macros = new ArrayList<>();
                root.getAsJsonArray("macros").forEach(e -> macros.add(e.getAsString()));
            }
            if (root.has("chatFilter")) {
                chatFilterRules = new ArrayList<>();
                root.getAsJsonArray("chatFilter").forEach(e -> chatFilterRules.add(e.getAsString()));
                compile();
            }
            JsonObject enabled = root.getAsJsonObject("enabled");
            if (enabled == null) return;
            for (Feature f : FeatureRegistry.all()) {
                if (enabled.has(f.id) && f.isAvailable()) f.setEnabled(enabled.get(f.id).getAsBoolean());
            }
        } catch (Exception e) {
            System.err.println("[ember-overlay] could not read config, using defaults: " + e);
        }
    }

    public static void save() {
        JsonObject enabled = new JsonObject();
        for (Feature f : FeatureRegistry.all()) enabled.addProperty(f.id, f.isEnabled());
        JsonObject root = new JsonObject();
        root.add("enabled", enabled);
        root.add("macros", GSON.toJsonTree(macros));
        root.add("chatFilter", GSON.toJsonTree(chatFilterRules));
        try {
            Files.createDirectories(FILE.getParent());
            Files.writeString(FILE, GSON.toJson(root));
        } catch (IOException e) {
            System.err.println("[ember-overlay] could not save config: " + e);
        }
    }
}
