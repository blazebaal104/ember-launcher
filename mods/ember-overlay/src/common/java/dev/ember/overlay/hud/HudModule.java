package dev.ember.overlay.hud;

import net.minecraft.client.Minecraft;
import dev.ember.overlay.api.Gfx;

/** Something drawn on the HUD. Implementations must not allocate in {@link #render}. */
public interface HudModule {
    /** Draw at (x, y); return the height used so the next module stacks below. */
    int render(Gfx g, Minecraft mc, int x, int y);

    /** Modules that draw elsewhere (crosshair, warnings) return false and ignore x/y. */
    default boolean stacked() {
        return true;
    }
}
