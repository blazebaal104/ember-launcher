package dev.ember.overlay.hud;

import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.Setting;

import java.util.List;

/**
 * The look options every HUD module shares (colour, background, size...). Attaching adds them
 * to the feature's settings page, after the feature's own options.
 */
public final class HudLook {
    public final Setting.Color text;
    public final Setting.Bool background;
    public final Setting.Slider opacity;
    public final Setting.Slider size;
    public final Setting.Bool shadow;
    public final Setting.Bool rounded;
    public final Setting.Slider padding;
    public final Setting.Choice brackets;

    private HudLook(List<Setting> into, int textColor) {
        text = new Setting.Color("text_color", "Text colour", textColor);
        background = new Setting.Bool("background", "Background", true).help("Dark plate behind the text so it's readable anywhere.");
        opacity = new Setting.Slider("background_opacity", "Background opacity", 0, 100, 5, 55, v -> v + "%");
        opacity.showIf(() -> background.v);
        size = new Setting.Slider("size", "Size", 50, 200, 10, 100, v -> v + "%").help("You can also scroll over it in Edit HUD layout.");
        shadow = new Setting.Bool("shadow", "Text shadow", false).adv();
        rounded = new Setting.Bool("rounded", "Rounded corners", true).adv();
        padding = new Setting.Slider("padding", "Padding", 1, 6, 1, 3, v -> v + " px").adv();
        brackets = new Setting.Choice("brackets", "Brackets", 0, "None", "[ ]", "( )").adv();
        into.addAll(List.of(text, background, opacity, size, shadow, rounded, padding, brackets));
    }

    public static HudLook attach(Feature f) {
        return new HudLook(f.settings, HudStyle.TEXT);
    }

    public static HudLook attach(Feature f, int textColor) {
        return new HudLook(f.settings, textColor);
    }

    public int bg() {
        return background.v ? ((Math.round(opacity.v * 2.55f) & 0xFF) << 24) | (HudStyle.BG & 0xFFFFFF) : 0;
    }

    public float scale() {
        return size.v / 100f;
    }

    public String wrap(String s) {
        return switch (brackets.v) {
            case 1 -> "[" + s + "]";
            case 2 -> "(" + s + ")";
            default -> s;
        };
    }
}
