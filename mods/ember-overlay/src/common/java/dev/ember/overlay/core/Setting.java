package dev.ember.overlay.core;

import com.google.gson.JsonElement;
import com.google.gson.JsonPrimitive;

import java.util.function.BooleanSupplier;
import java.util.function.IntFunction;

/**
 * One customisable option of a feature, shown on its settings page. Values are plain public
 * fields ({@code v}) so render code reads them without boxing or lookups.
 */
public abstract class Setting {
    public final String key;
    public final String label;
    public String help = "";
    public boolean advanced;
    public BooleanSupplier visible = () -> true;
    public Runnable onChange = () -> {};

    protected Setting(String key, String label) {
        this.key = key;
        this.label = label;
    }

    public abstract void reset();

    public abstract JsonElement save();

    public abstract void load(JsonElement e);

    protected void changed() {
        onChange.run();
    }

    // ---------------------------------------------------------------- fluent helpers

    @SuppressWarnings("unchecked")
    public <S extends Setting> S adv() {
        advanced = true;
        return (S) this;
    }

    @SuppressWarnings("unchecked")
    public <S extends Setting> S help(String text) {
        help = text;
        return (S) this;
    }

    @SuppressWarnings("unchecked")
    public <S extends Setting> S showIf(BooleanSupplier when) {
        visible = when;
        return (S) this;
    }

    @SuppressWarnings("unchecked")
    public <S extends Setting> S onChange(Runnable r) {
        onChange = r;
        return (S) this;
    }

    // ---------------------------------------------------------------- kinds

    public static final class Bool extends Setting {
        public final boolean def;
        public boolean v;

        public Bool(String key, String label, boolean def) {
            super(key, label);
            this.def = this.v = def;
        }

        public void set(boolean value) {
            if (v == value) return;
            v = value;
            changed();
        }

        @Override public void reset() { set(def); }
        @Override public JsonElement save() { return new JsonPrimitive(v); }
        @Override public void load(JsonElement e) { set(e.getAsBoolean()); }
    }

    /** Whole-number slider. */
    public static final class Slider extends Setting {
        public final int min, max, step, def;
        public int v;
        public IntFunction<String> format;

        public Slider(String key, String label, int min, int max, int step, int def, IntFunction<String> format) {
            super(key, label);
            this.min = min;
            this.max = max;
            this.step = Math.max(1, step);
            this.def = this.v = def;
            this.format = format == null ? String::valueOf : format;
        }

        public void set(int value) {
            int c = Math.max(min, Math.min(max, min + Math.round((value - min) / (float) step) * step));
            if (c == v) return;
            v = c;
            changed();
        }

        /** 0..1 position of the value on the track. */
        public float fraction() {
            return max == min ? 0 : (v - min) / (float) (max - min);
        }

        public void setFraction(float f) {
            set(min + Math.round(Math.max(0, Math.min(1, f)) * (max - min)));
        }

        public String text() {
            return format.apply(v);
        }

        @Override public void reset() { set(def); }
        @Override public JsonElement save() { return new JsonPrimitive(v); }
        @Override public void load(JsonElement e) { set(e.getAsInt()); }
    }

    /** ARGB colour picked from swatches (or typed as hex on the settings page). */
    public static final class Color extends Setting {
        public static final int[] SWATCHES = {
                0xFFFFFFFF, 0xFFE9EBF0, 0xFF8E96A6, 0xFF4FB8A0, 0xFF3CCF6E, 0xFF5CC8F2,
                0xFF6C8CFF, 0xFFA07CF0, 0xFFF06CC0, 0xFFEF4F5A, 0xFFE07C4C, 0xFFE8B931, 0xFF1B1E24};
        public final int def;
        public int v;

        public Color(String key, String label, int def) {
            super(key, label);
            this.def = this.v = def;
        }

        public void set(int argb) {
            if (v == argb) return;
            v = argb;
            changed();
        }

        public String hex() {
            return String.format("#%06X", v & 0xFFFFFF);
        }

        @Override public void reset() { set(def); }
        @Override public JsonElement save() { return new JsonPrimitive(hex()); }

        @Override
        public void load(JsonElement e) {
            try {
                set(0xFF000000 | Integer.parseInt(e.getAsString().replace("#", ""), 16));
            } catch (Exception ignored) {
            }
        }
    }

    /** One of a few named options (segmented control). */
    public static final class Choice extends Setting {
        public final String[] options;
        public final int def;
        public int v;

        public Choice(String key, String label, int def, String... options) {
            super(key, label);
            this.options = options;
            this.def = this.v = def;
        }

        public void set(int index) {
            int c = Math.floorMod(index, options.length);
            if (c == v) return;
            v = c;
            changed();
        }

        public String text() {
            return options[v];
        }

        @Override public void reset() { set(def); }
        @Override public JsonElement save() { return new JsonPrimitive(options[v]); }

        @Override
        public void load(JsonElement e) {
            String s = e.getAsString();
            for (int i = 0; i < options.length; i++) if (options[i].equals(s)) set(i);
        }
    }

    /** Free text (chat macros, filter rules). */
    public static final class Text extends Setting {
        public final String def;
        public final String hint;
        public String v;

        public Text(String key, String label, String def, String hint) {
            super(key, label);
            this.def = this.v = def;
            this.hint = hint;
        }

        public void set(String value) {
            if (value.equals(v)) return;
            v = value;
            changed();
        }

        @Override public void reset() { set(def); }
        @Override public JsonElement save() { return new JsonPrimitive(v); }
        @Override public void load(JsonElement e) { set(e.getAsString()); }
    }

    /**
     * A key binding. It IS the vanilla key mapping (so it also shows, and can be changed, in
     * Options > Controls); the menu just offers a quicker way to set it.
     */
    public static final class Key extends Setting {
        public final net.minecraft.client.KeyMapping mapping;

        public Key(String key, String label, net.minecraft.client.KeyMapping mapping) {
            super(key, label);
            this.mapping = mapping;
        }

        public String text() {
            return mapping.isUnbound() ? "Not set" : mapping.getTranslatedKeyMessage().getString();
        }

        public void bind(com.mojang.blaze3d.platform.InputConstants.Key k) {
            mapping.setKey(k);
            net.minecraft.client.KeyMapping.resetMapping();
            net.minecraft.client.Minecraft.getInstance().options.save();
            changed();
        }

        @Override public void reset() { bind(mapping.getDefaultKey()); }
        // Stored by Minecraft in options.txt, not in our config.
        @Override public com.google.gson.JsonElement save() { return com.google.gson.JsonNull.INSTANCE; }
        @Override public void load(com.google.gson.JsonElement e) {}
    }
}
