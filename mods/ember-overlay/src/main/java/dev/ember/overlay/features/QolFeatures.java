package dev.ember.overlay.features;

import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Config;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.mixin.AbstractContainerScreenAccessor;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.inventory.Slot;

import java.util.Locale;
import java.util.regex.Pattern;

import static dev.ember.overlay.core.FeatureRegistry.register;

/** Quality of life: 14 entries, all implemented. */
public final class QolFeatures {
    private QolFeatures() {}

    public static Feature macros, serverSwitcher, snapLook, screenshots, memoryCleaner, copyCoords, chatFilter;
    public static ServerData lastServer;

    public static void registerAll() {
        macros = register(new Simple("macros", "Chat macros", "Three keys that send your saved messages or commands (edit them in config/ember-overlay.json).", true));
        serverSwitcher = register(new Simple("server_switcher", "Quick server switcher", "Press a key to jump to any server in your list.", true));
        register(new Freelook());
        snapLook = register(new Simple("snap_look", "Snap look", "Turn 180° instantly with one key.", false));
        chatFilter = register(new Simple("chat_filter", "Chat filter", "Hides messages matching your filter list (config/ember-overlay.json).", false));
        register(new InventorySearch());
        screenshots = register(new Simple("screenshot_manager", "Screenshot manager", "Browse and open this instance's screenshots in-game.", true));
        memoryCleaner = register(new Simple("memory_cleaner", "Memory cleaner", "Asks Java to free unused memory now. Helps after long sessions; it won't add FPS.", true));
        register(new ToggleKey("toggle_sprint", "Toggle sprint", "Tap sprint once to keep sprinting.", true));
        register(new ToggleKey("toggle_sneak", "Toggle sneak", "Tap sneak once to keep sneaking.", false));
        register(new DeathCoords());
        register(new AutoReconnect());
        copyCoords = register(new Simple("copy_coords", "Copy coordinates", "Key that copies your X Y Z to the clipboard.", true));
        register(new Simple("server_memory", "Remember last server", "Tracks your last server so reconnect works after a kick.", true) {
            @Override public boolean wantsTick() { return true; }
            @Override public void tick(Minecraft mc) { if (mc.getCurrentServer() != null) lastServer = mc.getCurrentServer(); }
        });
    }

    static class Simple extends Feature {
        Simple(String id, String name, String description, boolean def) {
            super(id, name, Category.QOL, description, def);
        }
    }

    // ------------------------------------------------------------------ helpers used by key handlers

    public static void sendMacro(Minecraft mc, int index) {
        if (!macros.isEnabled() || mc.player == null || index >= Config.macros.size()) return;
        String text = Config.macros.get(index);
        if (text.isBlank()) return;
        if (text.startsWith("/")) mc.player.connection.sendCommand(text.substring(1));
        else mc.player.connection.sendChat(text);
    }

    public static void snap(Minecraft mc) {
        if (snapLook.isEnabled() && mc.player != null) mc.player.setYRot(mc.player.getYRot() + 180f);
    }

    public static void freeMemory(Minecraft mc) {
        if (!memoryCleaner.isEnabled() || mc.player == null) return;
        Runtime rt = Runtime.getRuntime();
        long before = rt.totalMemory() - rt.freeMemory();
        System.gc();
        long freed = Math.max(0, before - (rt.totalMemory() - rt.freeMemory())) >> 20;
        mc.gui.getChat().addMessage(Component.literal("[Ember] Freed " + freed + " MB"));
    }

    public static void copyCoordinates(Minecraft mc) {
        if (!copyCoords.isEnabled() || mc.player == null) return;
        String c = String.format(Locale.ROOT, "%d %d %d", mc.player.getBlockX(), mc.player.getBlockY(), mc.player.getBlockZ());
        mc.keyboardHandler.setClipboard(c);
        mc.gui.getChat().addMessage(Component.literal("[Ember] Copied " + c));
    }

    /** Called from ChatComponentMixin. */
    public static boolean shouldHide(Component message) {
        if (!chatFilter.isEnabled()) return false;
        String text = message.getString();
        for (Pattern p : Config.chatFilters()) if (p.matcher(text).find()) return true;
        return false;
    }

    // ------------------------------------------------------------------ feature classes

    /** Hold a key to look around in third person while you keep moving straight. */
    public static final class Freelook extends Feature {
        public static volatile boolean active;
        public static float yaw, pitch;
        private static CameraType previous;
        public static Freelook instance;

        Freelook() {
            super("freelook", "Free look", "Hold Left Alt to look around without changing direction.", true);
            instance = this;
        }

        public static void update(Minecraft mc, boolean held) {
            if (mc.player == null) return;
            boolean want = held && instance.isEnabled();
            if (want && !active) {
                yaw = mc.player.getYRot();
                pitch = mc.player.getXRot();
                previous = mc.options.getCameraType();
                mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
                active = true;
            } else if (!want && active) {
                active = false;
                if (previous != null) mc.options.setCameraType(previous);
            }
        }

        /** Same sensitivity maths as Entity#turn. */
        public static void turn(double dy, double dx) {
            yaw += (float) dy * 0.15f;
            pitch = Mth.clamp(pitch + (float) dx * 0.15f, -90f, 90f);
        }
    }

    static final class ToggleKey extends Feature {
        private boolean on;

        ToggleKey(String id, String name, String description, boolean def) {
            super(id, name, Category.QOL, description, def);
        }

        @Override
        public boolean wantsTick() {
            return true;
        }

        @Override
        protected void onDisable() {
            on = false;
        }

        @Override
        public void tick(Minecraft mc) {
            var key = id.equals("toggle_sprint") ? mc.options.keySprint : mc.options.keyShift;
            while (key.consumeClick()) on = !on;
            if (on) key.setDown(true);
        }
    }

    static final class DeathCoords extends Feature {
        private boolean wasDead;

        DeathCoords() {
            super("death_coords", "Death coordinates", "Posts where you died in your chat (only you see it).", true);
        }

        @Override
        public boolean wantsTick() {
            return true;
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null) return;
            boolean dead = mc.player.isDeadOrDying();
            if (dead && !wasDead) {
                mc.gui.getChat().addMessage(Component.literal(String.format(Locale.ROOT, "[Ember] You died at %d %d %d in %s",
                        mc.player.getBlockX(), mc.player.getBlockY(), mc.player.getBlockZ(), mc.level.dimension().identifier().getPath())));
            }
            wasDead = dead;
        }
    }

    /** Adds a Reconnect button to the disconnect screen. */
    static final class AutoReconnect extends Feature {
        AutoReconnect() {
            super("reconnect", "Reconnect button", "One click to rejoin after a disconnect or kick.", true);
            ScreenEvents.AFTER_INIT.register((mc, screen, w, h) -> {
                if (!isEnabled() || !(screen instanceof DisconnectedScreen) || lastServer == null) return;
                ServerData target = lastServer;
                Screens.getButtons(screen).add(Button.builder(Component.literal("Reconnect to " + target.name),
                        b -> dev.ember.overlay.compat.Compat.switchServer(mc, target)).bounds(w / 2 - 100, h - 30, 200, 20).build());
            });
        }
    }

    /** Search box above container screens; non-matching slots are dimmed. */
    static final class InventorySearch extends Feature {
        private static String query = "";

        InventorySearch() {
            super("inventory_search", "Inventory search", "Type to highlight matching items in chests and your inventory.", true);
            ScreenEvents.AFTER_INIT.register((mc, screen, w, h) -> {
                if (!isEnabled() || !(screen instanceof AbstractContainerScreen<?> cs) || screen instanceof CreativeModeInventoryScreen) return;
                var acc = (AbstractContainerScreenAccessor) cs;
                EditBox box = new EditBox(mc.font, acc.ember$left(), Math.max(2, acc.ember$top() - 16), 120, 14, Component.literal("Search"));
                box.setHint(Component.literal("Search items"));
                box.setValue(query);
                box.setResponder(s -> query = s.toLowerCase(Locale.ROOT));
                Screens.getButtons(screen).add(box);
                ScreenEvents.afterRender(screen).register((s, g, mx, my, delta) -> {
                    if (query.isEmpty()) return;
                    for (Slot slot : cs.getMenu().slots) {
                        if (!slot.hasItem()) continue;
                        if (slot.getItem().getHoverName().getString().toLowerCase(Locale.ROOT).contains(query)) continue;
                        int x = acc.ember$left() + slot.x, y = acc.ember$top() + slot.y;
                        g.fill(x, y, x + 16, y + 16, 0xB0191C22);
                    }
                });
            });
        }
    }
}
