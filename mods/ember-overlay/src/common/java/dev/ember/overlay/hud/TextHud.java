package dev.ember.overlay.hud;

import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Feature;
import net.minecraft.client.Minecraft;
import dev.ember.overlay.api.Gfx;

import java.util.function.Function;

/**
 * A text HUD readout. The text is recomputed at 20 Hz in {@link #tick}; the frame loop only
 * draws the cached string, so 20 readouts cost ~20 drawString calls per frame.
 */
public class TextHud extends Feature implements HudModule {
    private final Function<Minecraft, String> supplier;
    protected volatile String cached = "";
    protected volatile int color;
    public HudLook look;

    public TextHud(String id, String name, String description, Function<Minecraft, String> supplier) {
        super(id, name, Category.HUD, description);
        this.supplier = supplier;
    }

    /** Look options come after the feature's own settings. */
    @Override
    public void finishSettings() {
        if (look == null) look = HudLook.attach(this, HudLook.LABEL);
    }

    /** Text colour for this tick; override to colour by value (FPS, ping). */
    protected int colorFor(Minecraft mc) {
        return look.textColor();
    }

    @Override
    public HudLook look() {
        return look;
    }

    @Override
    public boolean wantsTick() {
        return true;
    }

    @Override
    public void tick(Minecraft mc) {
        if (mc.player == null) return;
        try {
            String s = supplier.apply(mc);
            cached = s == null || s.isEmpty() ? "" : look.wrap(s);
            color = colorFor(mc);
        } catch (RuntimeException e) {
            cached = "";
        }
    }

    @Override
    public int render(Gfx g, Minecraft mc, int x, int y) {
        return HudStyle.label(g, mc, cached, x, y, look, color);
    }
}
