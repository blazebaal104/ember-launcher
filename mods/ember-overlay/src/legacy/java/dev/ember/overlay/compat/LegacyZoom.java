package dev.ember.overlay.compat;

import dev.ember.overlay.features.VisualFeatures;
import dev.ember.overlay.mixin.OptionInstanceAccessor;
import net.minecraft.client.Minecraft;

/**
 * Zoom on 1.21.x: the FOV hook's return type changed between 1.21 releases, so instead of a
 * mixin we briefly lower the FOV option (bypassing its 30..110 range) and restore it after.
 */
final class LegacyZoom {
    private LegacyZoom() {}

    private static Integer baseFov;

    static void tick(Minecraft mc) {
        float f = VisualFeatures.stepZoom();
        var fov = mc.options.fov();
        if (f >= 0.999f) {
            if (baseFov != null) {
                ((OptionInstanceAccessor) (Object) fov).ember$setValue(baseFov);
                baseFov = null;
            }
            return;
        }
        if (baseFov == null) baseFov = fov.get();
        ((OptionInstanceAccessor) (Object) fov).ember$setValue(Math.max(1, Math.round(baseFov * f)));
    }
}
