package dev.ember.overlay.hud;

import net.minecraft.client.Minecraft;
import dev.ember.overlay.api.Gfx;

/** Something drawn on the HUD. Implementations must not allocate in {@link #render}. */
public interface HudModule {
    /** Draw with its top-left at (x, y); return the height used so automatic layout can stack. */
    int render(Gfx g, Minecraft mc, int x, int y);

    /** Full-screen effects (edge pulse) return false: they ignore x/y and can't be moved. */
    default boolean positionable() {
        return true;
    }

    /**
     * Where the module goes before the player moves it: null = the automatic column on the
     * left, or {x, y} as fractions of the free screen space (1, 0 = top right).
     */
    default float[] defaultPos() {
        return null;
    }

    /** Looks (colour, background, size); null for modules without the shared look options. */
    default HudLook look() {
        return null;
    }
}
