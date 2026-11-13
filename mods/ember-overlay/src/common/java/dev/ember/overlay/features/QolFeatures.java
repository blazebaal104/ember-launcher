package dev.ember.overlay.features;

import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.Setting;
import dev.ember.overlay.mixin.AbstractContainerScreenAccessor;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import static dev.ember.overlay.core.FeatureRegistry.register;

/** Utility: handy tools and shortcuts. */
public final class QolFeatures {
    private QolFeatures() {}

    public static Feature serverSwitcher, snapLook, screenshots, memoryCleaner, copyCoords;
    public static Macros macros;
    public static ChatFilter chatFilter;
    public static ServerData lastServer;
    public static WorldMap worldMap;

    public record Death(int x, int y, int z, String dimension) {}

    /** Where you last died (for the world map). */
    public static volatile Death lastDeath;

    public static void registerAll() {
        macros = register(new Macros());
        serverSwitcher = register(new Simple("server_switcher", "Quick server switcher", "Press a key to jump to any server in your list without going back to the title screen."));
        register(new Freelook());
        worldMap = register(new WorldMap());
        snapLook = register(new Simple("snap_look", "Snap look", "Turn around 180° instantly with one key."));
        chatFilter = register(new ChatFilter());
        register(new InventorySearch());
        screenshots = register(new Simple("screenshot_manager", "Screenshot manager", "Browse and open this instance's screenshots without leaving the game."));
        memoryCleaner = register(new Simple("memory_cleaner", "Memory cleaner", "A key that frees unused memory. Helps after long sessions; it won't add FPS."));
        register(new ToggleKey("toggle_sprint", "Toggle sprint", "Tap sprint once to keep sprinting, instead of holding it."));
        register(new ToggleKey("toggle_sneak", "Toggle sneak", "Tap sneak once to keep sneaking, instead of holding it."));
        register(new DeathCoords());
        register(new AutoReconnect());
        copyCoords = register(new Simple("copy_coords", "Copy coordinates", "A key that copies your X Y Z, ready to paste in chat or Discord."));
        register(new Simple("server_memory", "Remember last server", "Remembers the server you were on, so the Reconnect button works after a kick.") {
            @Override public boolean wantsTick() { return true; }
            @Override public void tick(Minecraft mc) { if (mc.getCurrentServer() != null) lastServer = mc.getCurrentServer(); }
        });
    }

    static class Simple extends Feature {
        Simple(String id, String name, String description) {
            super(id, name, Category.QOL, description);
        }
    }

    // ------------------------------------------------------------------ helpers used by key handlers

    public static void sendMacro(Minecraft mc, int index) {
        if (!macros.isEnabled() || mc.player == null || index >= macros.slots.length) return;
        String text = macros.slots[index].v.trim();
        if (text.isEmpty()) return;
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
        Compat.say(mc, ("[Ember] Freed " + freed + " MB"));
    }

    public static void copyCoordinates(Minecraft mc) {
        if (!copyCoords.isEnabled() || mc.player == null) return;
        String c = String.format(Locale.ROOT, "%d %d %d", mc.player.getBlockX(), mc.player.getBlockY(), mc.player.getBlockZ());
        mc.keyboardHandler.setClipboard(c);
        Compat.say(mc, ("[Ember] Copied " + c));
    }

    /** Called from the chat mixin. */
    public static boolean shouldHide(Component message) {
        if (!chatFilter.isEnabled()) return false;
        String text = message.getString();
        for (Pattern p : chatFilter.compiled) if (p.matcher(text).find()) return true;
        return false;
    }

    // ------------------------------------------------------------------ feature classes

    public static final class Macros extends Simple {
        public final Setting.Text[] slots = new Setting.Text[3];

        Macros() {
            super("macros", "Chat macros", "Three keys that send a message or command for you. Set the keys in Controls.");
            String[] defs = {"/home", "gg", "/spawn"};
            for (int i = 0; i < slots.length; i++) {
                slots[i] = add(new Setting.Text("macro" + (i + 1), "Macro " + (i + 1), defs[i], "Message, or /command"));
            }
        }
    }

    public static final class ChatFilter extends Simple {
        final Setting.Text[] rules = new Setting.Text[4];
        volatile List<Pattern> compiled = List.of();

        ChatFilter() {
            super("chat_filter", "Chat filter", "Hides chat messages that contain words you choose, like ads or spam.");
            String[] defs = {"discord.gg/", "free rank", "", ""};
            for (int i = 0; i < rules.length; i++) {
                rules[i] = add(new Setting.Text("rule" + (i + 1), "Hide messages with", defs[i], "word or phrase").onChange(this::compile));
            }
            compile();
        }

        void compile() {
            List<Pattern> out = new ArrayList<>();
            for (Setting.Text r : rules) {
                if (r == null || r.v.isBlank()) continue;
                out.add(Pattern.compile(Pattern.quote(r.v.trim()), Pattern.CASE_INSENSITIVE));
            }
            compiled = List.copyOf(out);
        }
    }

    /** Full-screen map of explored terrain (see map.WorldMapScreen). */
    public static final class WorldMap extends Simple {
        final Setting.Choice zoom;
        final Setting.Bool death, cursor;

        WorldMap() {
            super("worldmap", "World map", "A full-screen map of everything you've explored, like Xaero's World Map. Press its key to open it. It also records terrain while you play, even with the minimap off.");
            zoom = add(new Setting.Choice("zoom", "Opens zoomed", 2, "Closest", "Close", "Normal", "Far", "Farthest"));
            death = add(new Setting.Bool("death", "Show where you died", true).help("Needs Death coordinates on."));
            cursor = add(new Setting.Bool("cursor", "Coordinates under the cursor", true));
        }

        public int startZoom() {
            return new int[]{1, 2, 3, 5, 7}[zoom.v];
        }

        public boolean showDeath() {
            return death.v;
        }

        public boolean showCursor() {
            return cursor.v;
        }

        public net.minecraft.client.KeyMapping openKey() {
            return key;
        }
    }

    /** Hold (or tap) a key to look around in third person while you keep moving straight. */
    public static final class Freelook extends Feature {
        public static volatile boolean active;
        public static float yaw, pitch;
        private static CameraType previous;
        private static boolean wasHeld;
        public static Freelook instance;
        final Setting.Choice mode;
        final Setting.Bool invert;

        Freelook() {
            super("freelook", "Free look", Category.QOL, "Hold the free look key (Left Alt) to look around you without changing where you walk.");
            mode = add(new Setting.Choice("mode", "Key mode", 0, "Hold", "Toggle"));
            invert = add(new Setting.Bool("invert", "Invert up / down", false).adv());
            instance = this;
        }

        public static void update(Minecraft mc, boolean held) {
            if (mc.player == null) return;
            boolean want;
            if (instance.mode.v == 1) {
                if (held && !wasHeld) want = !active;
                else want = active;
            } else want = held;
            wasHeld = held;
            want &= instance.isEnabled();
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
            pitch = Mth.clamp(pitch + (float) dx * (instance.invert.v ? -0.15f : 0.15f), -90f, 90f);
        }
    }

    static final class ToggleKey extends Simple {
        private boolean on;

        ToggleKey(String id, String name, String description) {
            super(id, name, description);
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

    static final class DeathCoords extends Simple {
        private boolean wasDead;
        final Setting.Bool copy;

        DeathCoords() {
            super("death_coords", "Death coordinates", "Tells you in chat where you died (only you see it), so you can get your stuff back.");
            copy = add(new Setting.Bool("copy", "Also copy them", false).help("Puts the coordinates on your clipboard."));
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
                String c = String.format(Locale.ROOT, "%d %d %d", mc.player.getBlockX(), mc.player.getBlockY(), mc.player.getBlockZ());
                Compat.say(mc, "[Ember] You died at " + c + " in " + Compat.dimension(mc));
                if (copy.v) mc.keyboardHandler.setClipboard(c);
                lastDeath = new Death(mc.player.getBlockX(), mc.player.getBlockY(), mc.player.getBlockZ(), mc.level.dimension().toString());
            }
            wasDead = dead;
        }
    }

    /** Adds a Reconnect button to the disconnect screen. */
    static final class AutoReconnect extends Simple {
        AutoReconnect() {
            super("reconnect", "Reconnect button", "Adds a button to rejoin the server after a disconnect or kick. Works with Remember last server.");
            ScreenEvents.AFTER_INIT.register((mc, screen, w, h) -> {
                if (!isEnabled() || !(screen instanceof DisconnectedScreen) || lastServer == null) return;
                ServerData target = lastServer;
                Compat.addWidget(screen, Button.builder(Component.literal("Reconnect to " + target.name),
                        b -> Compat.switchServer(mc, target)).bounds(w / 2 - 100, h - 30, 200, 20).build());
            });
        }
    }

    /** Search box above container screens; non-matching slots are dimmed. */
    static final class InventorySearch extends Simple {
        private static String query = "";

        InventorySearch() {
            super("inventory_search", "Inventory search", "A search box on chests and your inventory. Items that don't match fade out.");
            ScreenEvents.AFTER_INIT.register((mc, screen, w, h) -> {
                if (!isEnabled() || !(screen instanceof AbstractContainerScreen<?> cs) || screen instanceof CreativeModeInventoryScreen) return;
                var acc = (AbstractContainerScreenAccessor) cs;
                EditBox box = new EditBox(mc.font, acc.ember$left(), Math.max(2, acc.ember$top() - 16), 120, 14, Component.literal("Search"));
                box.setHint(Component.literal("Search items"));
                box.setValue(query);
                box.setResponder(s -> query = s.toLowerCase(Locale.ROOT));
                Compat.addWidget(screen, box);
                Compat.afterScreenDraw(screen, g -> {
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
