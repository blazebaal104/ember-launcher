package dev.ember.overlay.hud;

import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.core.FeatureRegistry;
import net.minecraft.client.Minecraft;

import java.util.List;

/** The single HUD layer. Iterates the pre-filtered active list; nothing else per frame. */
public final class HudRenderer {
    private HudRenderer() {}

    public static void register() {
        Compat.addHudLayer("hud", (graphics, delta) -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.options.hideGui || mc.player == null || mc.getDebugOverlay().showDebugScreen()) return;
            List<HudModule> modules = FeatureRegistry.hud();
            int y = 4;
            for (int i = 0, n = modules.size(); i < n; i++) {
                HudModule m = modules.get(i);
                if (m.stacked()) y += m.render(graphics, mc, 4, y);
                else m.render(graphics, mc, 0, 0);
            }
        });
    }
}
