package dev.ember.overlay.ui;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Colours of the in-game menu. Same palettes as the launcher; Ember writes
 * config/ember-theme.json at every launch with the theme and accent you picked in the app,
 * so the menu always matches it.
 */
public final class Theme {
    private Theme() {}

    public static int INK, BASE, SURFACE, RAISED, LINE, TEXT, MUTED;
    public static int ACCENT = 0xFF4FB8A0, ON_ACCENT = 0xFF0D1512;
    public static final int GOLD = 0xFFE3B341, RED = 0xFFE5484D, GREEN = 0xFF3CCF6E;
    public static boolean light;
    /** How see-through panels are (launcher "glass" setting). */
    public static float glass = 0.6f;

    static {
        palette("deepslate");
    }

    private static void palette(String id) {
        light = false;
        switch (id) {
            case "midnight" -> set(0x0B0D16, 0x0F1220, 0x171B2E, 0x20263D, 0x2B3250, 0xE8EAF6, 0x8A90B0);
            case "oled" -> set(0x000000, 0x000000, 0x0D0D0F, 0x17171A, 0x242428, 0xF1F1F3, 0x8B8B93);
            case "calcite" -> {
                set(0xE6E3DC, 0xEFEDE8, 0xFFFFFF, 0xF3F1EC, 0xDCD8CF, 0x1C1D21, 0x6B6E78);
                light = true;
            }
            default -> set(0x121418, 0x171A20, 0x20242D, 0x2A2F3B, 0x343A48, 0xE9EBF0, 0x8E96A6);
        }
    }

    private static void set(int ink, int base, int surface, int raised, int line, int text, int muted) {
        INK = 0xFF000000 | ink;
        BASE = 0xFF000000 | base;
        SURFACE = 0xFF000000 | surface;
        RAISED = 0xFF000000 | raised;
        LINE = 0xFF000000 | line;
        TEXT = 0xFF000000 | text;
        MUTED = 0xFF000000 | muted;
    }

    public static void load() {
        Path file = FabricLoader.getInstance().getConfigDir().resolve("ember-theme.json");
        if (!Files.exists(file)) return;
        try {
            JsonObject o = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
            if (o.has("theme")) palette(o.get("theme").getAsString());
            if (o.has("accent")) {
                ACCENT = 0xFF000000 | Integer.parseInt(o.get("accent").getAsString().replace("#", ""), 16);
                float l = (0.299f * ((ACCENT >> 16) & 0xFF) + 0.587f * ((ACCENT >> 8) & 0xFF) + 0.114f * (ACCENT & 0xFF)) / 255f;
                ON_ACCENT = l > 0.55f ? 0xFF0D1512 : 0xFFFFFFFF;
            }
            if (o.has("glass") && !o.get("glass").getAsBoolean()) glass = 0f;
            else if (o.has("glassStrength")) glass = o.get("glassStrength").getAsFloat();
        } catch (Exception e) {
            System.err.println("[ember-overlay] could not read ember-theme.json: " + e);
        }
    }

    /** Panel background alpha: more see-through with stronger glass. */
    public static int panelAlpha() {
        return Math.round(250 - 70 * glass);
    }
}
