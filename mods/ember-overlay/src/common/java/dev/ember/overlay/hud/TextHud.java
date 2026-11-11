package dev.ember.overlay.hud;

import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Feature;
import net.minecraft.client.Minecraft;
import dev.ember.overlay.api.Gfx;

import java.util.function.Function;

/**
 * A one-line HUD readout. The text is recomputed at 20 Hz in {@link #tick}; the frame
 * loop only draws the cached string, so 20 readouts cost ~20 drawString calls per frame.
 */
public class TextHud extends Feature implements HudModule {
    private final Function<Minecraft, String> supplier;
    private volatile String cached = "";

    public TextHud(String id, String name, String description, boolean def, Function<Minecraft, String> supplier) {
        super(id, name, Category.HUD, description, def);
        this.supplier = supplier;
    }

    @Override
    public boolean wantsTick() {
        return true;
    }

    @Override
    public void tick(Minecraft mc) {
        if (mc.player == null) return;
        try {
            cached = supplier.apply(mc);
        } catch (RuntimeException e) {
            cached = "";
        }
    }

    @Override
    public int render(Gfx g, Minecraft mc, int x, int y) {
        String text = cached;
        if (text == null || text.isEmpty()) return 0;
        return HudStyle.label(g, mc, text, x, y);
    }
}
