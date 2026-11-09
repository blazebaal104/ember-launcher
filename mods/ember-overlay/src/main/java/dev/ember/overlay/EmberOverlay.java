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
import org.lwjgl.glfw.GLFW;

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

        menu = Compat.key("menu", GLFW.GLFW_KEY_RIGHT_SHIFT);
        zoom = Compat.key("zoom", GLFW.GLFW_KEY_C);
        freelook = Compat.key("freelook", GLFW.GLFW_KEY_LEFT_ALT);
        snapLook = Compat.key("snaplook", GLFW.GLFW_KEY_UNKNOWN);
        stopwatch = Compat.key("stopwatch", GLFW.GLFW_KEY_UNKNOWN);
        memory = Compat.key("memory", GLFW.GLFW_KEY_UNKNOWN);
        servers = Compat.key("servers", GLFW.GLFW_KEY_UNKNOWN);
        cinematic = Compat.key("smoothcam", GLFW.GLFW_KEY_UNKNOWN);
        copyCoords = Compat.key("copycoords", GLFW.GLFW_KEY_UNKNOWN);
        for (int i = 0; i < macros.length; i++) macros[i] = Compat.key("macro" + (i + 1), GLFW.GLFW_KEY_UNKNOWN);

        // Options (gamma etc.) exist once the client has started; apply saved toggles then.
        ClientLifecycleEvents.CLIENT_STARTED.register(mc -> {
            Config.load();
            FeatureRegistry.rebuildActiveLists();
        });
        ClientLifecycleEvents.CLIENT_STOPPING.register(mc -> Config.save());

        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    }

    private void tick(Minecraft mc) {
        // Features that asked for ticks (only the enabled ones are in this list).
        List<Feature> ticking = FeatureRegistry.ticking();
        for (int i = 0, n = ticking.size(); i < n; i++) ticking.get(i).tick(mc);

        VisualFeatures.zoomHeld = zoom.isDown();
        QolFeatures.Freelook.update(mc, freelook.isDown());

        while (menu.consumeClick()) if (mc.screen == null) mc.setScreen(new OverlayScreen());
        while (snapLook.consumeClick()) QolFeatures.snap(mc);
        while (stopwatch.consumeClick()) if (HudFeatures.stopwatch.isEnabled()) HudFeatures.stopwatch.toggle();
        while (memory.consumeClick()) QolFeatures.freeMemory(mc);
        while (copyCoords.consumeClick()) QolFeatures.copyCoordinates(mc);
        while (servers.consumeClick()) if (QolFeatures.serverSwitcher.isEnabled() && mc.screen == null) mc.setScreen(new ServerSwitcherScreen(null));
        while (cinematic.consumeClick()) mc.options.smoothCamera = !mc.options.smoothCamera;
        for (int i = 0; i < macros.length; i++) while (macros[i].consumeClick()) QolFeatures.sendMacro(mc, i);
    }
}
