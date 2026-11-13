package dev.ember.overlay.hud;

import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.Setting;
import net.minecraft.client.KeyMapping;

/**
 * The look and visibility options HUD modules share. Each module asks only for the parts it
 * really uses (a radar has no text, so it gets no text colour), so every option on its settings
 * page does something. They are added after the module's own options.
 */
public final class HudLook {
    public static final int TEXT = 1, BACKGROUND = 2, SHADOW = 4, ROUNDED = 8, PADDING = 16, BRACKETS = 32;
    /** Everything a text readout uses. */
    public static final int LABEL = TEXT | BACKGROUND | SHADOW | ROUNDED | PADDING | BRACKETS;

    public final Setting.Color text;
    public final Setting.Bool background, shadow, rounded;
    public final Setting.Slider opacity, size, padding;
    public final Setting.Choice brackets, show;
    public final Setting.Key key;
    private final int defaultText;
    private boolean toggledOn = true;

    private HudLook(Feature f, int parts, int textColor) {
        defaultText = textColor;
        var s = f.settings;
        // Visibility first: it's what new players look for ("can I show this only when I want?").
        show = new Setting.Choice("show", "Show", 0, "Always", "While holding key", "Toggle with key")
                .help("Pick a key below to show this only when you want it.");
        s.add(show);
        KeyMapping mapping = Compat.key("hud_" + f.id, Compat.UNBOUND);
        key = new Setting.Key("show_key", "Key", mapping);
        key.showIf(() -> show.v != 0);
        s.add(key);
        size = new Setting.Slider("size", "Size", 50, 200, 10, 100, v -> v + "%").help("You can also scroll over it in Edit HUD layout.");
        s.add(size);
        text = (parts & TEXT) != 0 ? s_add(f, new Setting.Color("text_color", "Text colour", textColor)) : null;
        background = (parts & BACKGROUND) != 0 ? s_add(f, new Setting.Bool("background", "Background", true).help("Dark plate behind it so it's readable anywhere.")) : null;
        if (background != null) {
            opacity = s_add(f, new Setting.Slider("background_opacity", "Background opacity", 0, 100, 5, 55, v -> v + "%"));
            opacity.showIf(() -> background.v);
        } else opacity = null;
        shadow = (parts & SHADOW) != 0 ? s_add(f, new Setting.Bool("shadow", "Text shadow", false).adv()) : null;
        rounded = (parts & ROUNDED) != 0 ? s_add(f, new Setting.Bool("rounded", "Rounded corners", true).adv()) : null;
        padding = (parts & PADDING) != 0 ? s_add(f, new Setting.Slider("padding", "Padding", 1, 6, 1, 3, v -> v + " px").adv()) : null;
        brackets = (parts & BRACKETS) != 0 ? s_add(f, new Setting.Choice("brackets", "Brackets", 0, "None", "[ ]", "( )").adv()) : null;
    }

    private static <S extends Setting> S s_add(Feature f, S s) {
        f.settings.add(s);
        return s;
    }

    public static HudLook attach(Feature f, int parts) {
        return new HudLook(f, parts, HudStyle.TEXT);
    }

    public static HudLook attach(Feature f, int parts, int textColor) {
        return new HudLook(f, parts, textColor);
    }

    public int textColor() {
        return text == null ? defaultText : text.v;
    }

    public boolean hasBackground() {
        return background != null && background.v;
    }

    public int bg() {
        return hasBackground() ? ((Math.round(opacity.v * 2.55f) & 0xFF) << 24) | (HudStyle.BG & 0xFFFFFF) : 0;
    }

    public boolean shadow() {
        return shadow != null && shadow.v;
    }

    public boolean rounded() {
        return rounded == null || rounded.v;
    }

    public int padding() {
        return padding == null ? 3 : padding.v;
    }

    public float scale() {
        return size.v / 100f;
    }

    public String wrap(String s) {
        if (brackets == null) return s;
        return switch (brackets.v) {
            case 1 -> "[" + s + "]";
            case 2 -> "(" + s + ")";
            default -> s;
        };
    }

    /** Called every client tick for enabled modules: handles the toggle key. */
    public void tickKey() {
        if (show.v == 2) while (key.mapping.consumeClick()) toggledOn = !toggledOn;
    }

    /** Whether the module should be drawn right now. */
    public boolean visible() {
        return switch (show.v) {
            case 1 -> key.mapping.isDown();
            case 2 -> toggledOn;
            default -> true;
        };
    }
}
