package dev.ember.overlay;

import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.core.Config;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.FeatureRegistry;
import dev.ember.overlay.core.ModScan;
import dev.ember.overlay.core.Setting;
import dev.ember.overlay.map.MapData;
import dev.ember.overlay.map.WorldMapScreen;
import dev.ember.overlay.features.HudFeatures;
import dev.ember.overlay.features.QolFeatures;
import dev.ember.overlay.features.VisualFeatures;
import dev.ember.overlay.hud.HudRenderer;
import dev.ember.overlay.ui.HudEditorScreen;
import dev.ember.overlay.ui.OverlayScreen;
import dev.ember.overlay.ui.Theme;
import dev.ember.overlay.ui.ServerSwitcherScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;

import java.util.List;

public final class EmberOverlay implements ClientModInitializer {
    private KeyMapping menu, zoom, freelook, snapLook, stopwatch, memory, servers, cinematic, copyCoords, worldMap;
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
        worldMap = Compat.key("worldmap", Compat.KEY_M);

        // Shown on each feature's settings page ("Key: C").
        bindKey("zoom", zoom);
        bindKey("freelook", freelook);
        bindKey("snap_look", snapLook);
        bindKey("stopwatch", stopwatch);
        bindKey("memory_cleaner", memory);
        bindKey("server_switcher", servers);
        bindKey("cinematic_key", cinematic);
        bindKey("copy_coords", copyCoords);
        bindKey("worldmap", worldMap);
        bindKey("macros", macros[2], "Macro 3 key");
        bindKey("macros", macros[1], "Macro 2 key");
        bindKey("macros", macros[0], "Macro 1 key");

        // Options (gamma etc.) exist once the client has started; apply saved toggles then.
        ClientLifecycleEvents.CLIENT_STARTED.register(mc -> {
            Config.load();
            ModScan.run();
            Theme.load();
            FeatureRegistry.rebuildActiveLists();
            if (SELFTEST) {
                int available = 0;
                for (Feature f : FeatureRegistry.all()) if (f.isAvailable()) available++;
                int on = 0, settings = 0;
                for (Feature f : FeatureRegistry.all()) {
                    if (f.isEnabled()) on++;
                    settings += f.settings.size();
                }
                // Everything must start off.
                if (on != 0) throw new IllegalStateException(on + " features are on by default");
                System.out.println("EMBER_SELFTEST_OK features=" + FeatureRegistry.count() + " working=" + available + " settings=" + settings);
            }
        });
        ClientLifecycleEvents.CLIENT_STOPPING.register(mc -> {
            Config.save();
            MapData.flush();
        });

        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
    }

    private static void bindKey(String feature, KeyMapping key) {
        bindKey(feature, key, "Key");
    }

    /** Shows the key on the feature's settings page, where it can be changed. */
    private static void bindKey(String feature, KeyMapping key, String label) {
        Feature f = FeatureRegistry.get(feature);
        if (f == null) return;
        if (f.key == null) f.key = key;
        f.settings.add(0, new Setting.Key("key_" + key.getName().replace('.', '_'), label, key));
    }

    /** CI only: `gradle runClient -Pselftest` boots the game, reports, then quits. */
    private static final boolean SELFTEST = System.getProperty("ember.selftest") != null;
    private int selftestTicks;

    /**
     * Opens every kind of menu page so a rendering bug crashes the CI run, and prints
     * EMBER_SHOT markers the workflow uses to take screenshots of each page.
     */
    /** CI only: save what's on screen (OpenGL front buffer) to run/ember-shots/<name>.png. */
    private static void shot(Minecraft mc, String name) {
        System.out.println("EMBER_SHOT " + name);
        if (!Compat.GL_SCREENSHOTS) return;
        try {
            int w = mc.getWindow().getWidth(), h = mc.getWindow().getHeight();
            java.nio.ByteBuffer buf = org.lwjgl.BufferUtils.createByteBuffer(w * h * 4);
            org.lwjgl.opengl.GL30.glBindFramebuffer(org.lwjgl.opengl.GL30.GL_READ_FRAMEBUFFER, 0);
            org.lwjgl.opengl.GL11.glReadBuffer(org.lwjgl.opengl.GL11.GL_FRONT);
            org.lwjgl.opengl.GL11.glPixelStorei(org.lwjgl.opengl.GL11.GL_PACK_ALIGNMENT, 1);
            org.lwjgl.opengl.GL11.glReadPixels(0, 0, w, h, org.lwjgl.opengl.GL11.GL_RGBA, org.lwjgl.opengl.GL11.GL_UNSIGNED_BYTE, buf);
            var img = new java.awt.image.BufferedImage(w, h, java.awt.image.BufferedImage.TYPE_INT_RGB);
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++) {
                    int i = ((h - 1 - y) * w + x) * 4;
                    img.setRGB(x, y, ((buf.get(i) & 0xFF) << 16) | ((buf.get(i + 1) & 0xFF) << 8) | (buf.get(i + 2) & 0xFF));
                }
            java.nio.file.Path dir = mc.gameDirectory.toPath().resolve("ember-shots");
            java.nio.file.Files.createDirectories(dir);
            javax.imageio.ImageIO.write(img, "png", dir.resolve(name + ".png").toFile());
        } catch (Throwable e) {
            System.out.println("EMBER_SHOT_FAILED " + e);
        }
    }

    private static void selftest(Minecraft mc, int t) {
        switch (t) {
            case 40 -> {
                FeatureRegistry.get("zoom").setEnabled(true);
                FeatureRegistry.get("fps").setEnabled(true);
                FeatureRegistry.get("keystrokes").setEnabled(true);
                Compat.setScreen(mc, new OverlayScreen());
            }
            case 80 -> shot(mc, "grid");
            case 100 -> Compat.setScreen(mc, new OverlayScreen(FeatureRegistry.get("crosshair").isAvailable() ? FeatureRegistry.get("crosshair") : FeatureRegistry.get("zoom")));
            case 140 -> shot(mc, "details");
            case 160 -> Compat.setScreen(mc, new OverlayScreen(FeatureRegistry.get("armor")));
            case 200 -> shot(mc, "armor");
            case 220 -> Compat.setScreen(mc, new OverlayScreen(FeatureRegistry.get("macros")));
            case 260 -> shot(mc, "macros");
            case 280 -> Compat.setScreen(mc, new HudEditorScreen(null, null));
            case 310 -> shot(mc, "editor");
            case 315 -> Compat.setScreen(mc, new OverlayScreen(FeatureRegistry.get("potions")));
            case 322 -> shot(mc, "potions");
            case 324 -> Compat.setScreen(mc, new WorldMapScreen());
            case 328 -> shot(mc, "worldmap");
            case 330 -> {
                Compat.setScreen(mc, null);
                System.out.println("EMBER_SELFTEST_UI_OK");
            }
            case 340 -> {
                System.out.println("EMBER_SELFTEST_EXIT");
                Runtime.getRuntime().halt(0);
            }
            default -> {}
        }
    }

    private void tick(Minecraft mc) {
        // Count only once the loading screen is gone, like a real player opening the menu in game.
        if (SELFTEST && !Compat.loading(mc)) selftest(mc, ++selftestTicks);
        // Features that asked for ticks (only the enabled ones are in this list).
        List<Feature> ticking = FeatureRegistry.ticking();
        for (int i = 0, n = ticking.size(); i < n; i++) ticking.get(i).tick(mc);

        // HUD modules shown on a key; terrain recording for the minimap / world map
        for (var m : FeatureRegistry.hud()) if (m.look() != null) m.look().tickKey();
        boolean mapOn = HudFeatures.minimap.isEnabled() || QolFeatures.worldMap.isEnabled();
        if (mapOn) MapData.tick(mc, HudFeatures.minimap.caveInNether());
        while (worldMap.consumeClick()) {
            if (QolFeatures.worldMap.isEnabled() && Compat.screen(mc) == null && mc.player != null) Compat.setScreen(mc, new WorldMapScreen());
        }

        VisualFeatures.zoomHeld = zoom.isDown();
        Compat.tickZoom(mc);
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
