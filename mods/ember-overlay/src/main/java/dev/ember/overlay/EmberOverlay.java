package dev.ember.overlay;

import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.core.Config;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.FeatureRegistry;
import dev.ember.overlay.features.HudFeatures;
import dev.ember.overlay.features.QolFeatures;
import dev.ember.overlay.features.VisualFeatures;
import dev.ember.overlay.hud.HudRenderer;
import dev.ember.overlay.ui.OverlayScreen;
import dev.ember.overlay.ui.ServerSwitcherScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;

import java.util.List;

public final class EmberOverlay implements ClientModInitializer {
    private KeyMapping menu, zoom, freelook, snapLook, stopwatch, memory, servers, cinematic, copyCoords;
    private final KeyMapping[] macros = new KeyMapping[3];

    @Override
    public void onInitializeClient() {
        HudFeatures.registerAll();
        VisualFeatures.registerAll();
        QolFeatures.registerAll();
        HudRenderer.register();

        menu = Compat.key("menu", Compat.KEY_RSHIFT);
        zoom = Compat.key("zoom", Compat.KEY_C);
        freelook = Compat.key("freelook", Compat.KEY_LALT);
        snapLook = Compat.key("snaplook", Compat.UNBOUND);
        stopwatch = Compat.key("stopwatch", Compat.UNBOUND);
        memory = Compat.key("memory", Compat.UNBOUND);
        servers = Compat.key("servers", Compat.UNBOUND);
        cinematic = Compat.key("smoothcam", Compat.UNBOUND);
        copyCoords = Compat.key("copycoords", Compat.UNBOUND);
        for (int i = 0; i < macros.length; i++) macros[i] = Compat.key("macro" + (i + 1), Compat.UNBOUND);

        // Options (gamma etc.) exist once the client has started; apply saved toggles then.
        ClientLifecycleEvents.CLIENT_STARTED.register(mc -> {
            Config.load();
            FeatureRegistry.rebuildActiveLists();
            if (SELFTEST) {
                int available = 0;
                for (Feature f : FeatureRegistry.all()) if (f.isAvailable()) available++;
                System.out.println("EMBER_SELFTEST_OK features=" + FeatureRegistry.count() + " working=" + available);
            }
        });
        ClientLifecycleEvents.CLIENT_STOPPING.register(mc -> Config.save());

        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    }

    /** CI only: `gradle runClient -Pselftest` boots the game, reports, then quits. */
    private static final boolean SELFTEST = System.getProperty("ember.selftest") != null;
    private int selftestTicks;

    private void tick(Minecraft mc) {
        if (SELFTEST && ++selftestTicks > 200) {
            System.out.println("EMBER_SELFTEST_EXIT");
            Runtime.getRuntime().halt(0);
        }
        // Features that asked for ticks (only the enabled ones are in this list).
        List<Feature> ticking = FeatureRegistry.ticking();
        for (int i = 0, n = ticking.size(); i < n; i++) ticking.get(i).tick(mc);

        VisualFeatures.zoomHeld = zoom.isDown();
        QolFeatures.Freelook.update(mc, freelook.isDown());

        while (menu.consumeClick()) if (Compat.screen(mc) == null) Compat.setScreen(mc, new OverlayScreen());
        while (snapLook.consumeClick()) QolFeatures.snap(mc);
        while (stopwatch.consumeClick()) if (HudFeatures.stopwatch.isEnabled()) HudFeatures.stopwatch.toggle();
        while (memory.consumeClick()) QolFeatures.freeMemory(mc);
        while (copyCoords.consumeClick()) QolFeatures.copyCoordinates(mc);
        while (servers.consumeClick()) if (QolFeatures.serverSwitcher.isEnabled() && Compat.screen(mc) == null) Compat.setScreen(mc, new ServerSwitcherScreen(null));
        while (cinematic.consumeClick()) mc.options.smoothCamera = !mc.options.smoothCamera;
        for (int i = 0; i < macros.length; i++) while (macros[i].consumeClick()) QolFeatures.sendMacro(mc, i);
    }
}
