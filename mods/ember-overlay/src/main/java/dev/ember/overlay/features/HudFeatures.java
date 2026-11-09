package dev.ember.overlay.features;

import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.hud.HudModule;
import dev.ember.overlay.hud.HudStyle;
import dev.ember.overlay.hud.TextHud;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.core.BlockPos;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.CrossbowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import org.lwjgl.glfw.GLFW;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import static dev.ember.overlay.core.FeatureRegistry.register;

/** HUD & information: 25 entries (24 implemented, world map planned). */
public final class HudFeatures {
    private HudFeatures() {}

    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("HH:mm");
    private static final long SESSION_START = System.currentTimeMillis();

    public static Stopwatch stopwatch;

    public static void registerAll() {
        register(new TextHud("fps", "FPS counter", "Frames per second.", true, mc -> mc.getFps() + " FPS"));
        register(new Cps());
        register(new Keystrokes());
        register(new TextHud("ping", "Ping", "Latency to the server (multiplayer only).", true, mc -> {
            if (mc.getConnection() == null || mc.isLocalServer()) return "";
            PlayerInfo info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
            return info == null ? "" : info.getLatency() + " ms";
        }));
        register(new TextHud("coords", "Coordinates", "Your X / Y / Z position.", true,
                mc -> String.format("%.0f / %.0f / %.0f", mc.player.getX(), mc.player.getY(), mc.player.getZ())));
        register(new TextHud("direction", "Direction", "Compass direction you are facing.", true,
                mc -> Compat.prettify(mc.player.getDirection().getName()) + " (" + Math.round(((mc.player.getYRot() % 360) + 360) % 360) + "°)"));
        register(new TextHud("biome", "Biome", "Biome at your feet.", false, mc -> Compat.biomeName(mc, mc.player.blockPosition())));
        register(new Armor());
        register(new Potions());
        register(stopwatch = new Stopwatch());
        register(new TextHud("clock", "Real-time clock", "Your computer's time.", false, mc -> LocalTime.now().format(CLOCK)));
        register(new Speed());
        register(new TextHud("memory", "Memory usage", "Java heap in use.", false, mc -> {
            Runtime rt = Runtime.getRuntime();
            long used = (rt.totalMemory() - rt.freeMemory()) >> 20;
            return "RAM " + used + " / " + (rt.maxMemory() >> 20) + " MB";
        }));
        register(new TextHud("day", "Day counter", "In-game day number.", false, mc -> "Day " + (mc.level.getDayTime() / 24000L + 1)));
        register(new TextHud("server", "Server address", "Which server you're on.", false,
                mc -> mc.getCurrentServer() == null ? "" : mc.getCurrentServer().ip));
        register(new TextHud("held", "Held item durability", "Durability or stack size of your main-hand item.", false, mc -> {
            ItemStack s = mc.player.getMainHandItem();
            if (s.isEmpty()) return "";
            if (s.isDamageableItem()) return s.getHoverName().getString() + " " + (s.getMaxDamage() - s.getDamageValue()) + "/" + s.getMaxDamage();
            return s.getCount() > 1 ? s.getHoverName().getString() + " x" + countInInventory(mc.player, s) : "";
        }));
        register(new TextHud("arrows", "Arrow count", "Arrows left while holding a bow or crossbow.", true, mc -> {
            ItemStack s = mc.player.getMainHandItem();
            if (!(s.getItem() instanceof BowItem) && !(s.getItem() instanceof CrossbowItem)) return "";
            return "Arrows " + countInInventory(mc.player, new ItemStack(Items.ARROW));
        }));
        register(new TextHud("light", "Light level", "Block light at your feet (mobs spawn at 0).", false,
                mc -> "Light " + mc.level.getBrightness(LightLayer.BLOCK, mc.player.blockPosition())));
        register(new TextHud("chunk", "Chunk position", "Chunk coordinates and position inside it.", false, mc -> {
            BlockPos p = mc.player.blockPosition();
            return "Chunk " + (p.getX() >> 4) + ", " + (p.getZ() >> 4) + " [" + (p.getX() & 15) + ", " + (p.getZ() & 15) + "]";
        }));
        register(new TextHud("entities", "Entity count", "Entities loaded around you.", false, mc -> mc.level.getEntityCount() + " entities"));
        register(new TextHud("session", "Session time", "How long you've been playing.", false, mc -> {
            long m = (System.currentTimeMillis() - SESSION_START) / 60000;
            return "Playing " + (m / 60) + "h " + (m % 60) + "m";
        }));
        register(new TextHud("target", "Looking at", "Name of the block under your crosshair.", false, mc -> {
            HitResult hit = mc.hitResult;
            if (!(hit instanceof BlockHitResult bh) || hit.getType() != HitResult.Type.BLOCK) return "";
            return mc.level.getBlockState(bh.getBlockPos()).getBlock().getName().getString();
        }));
        register(new TextHud("food", "Hunger & saturation", "Exact hunger and hidden saturation values.", false,
                mc -> "Food " + mc.player.getFoodData().getFoodLevel() + "  Sat " + String.format("%.1f", mc.player.getFoodData().getSaturationLevel())));
        register(new Radar());
        register(new Planned("worldmap", "World map", Category.HUD,
                "Full-screen explored-terrain map. Planned; until then Ember offers Xaero's World Map in Discover."));
    }

    static int countInInventory(Player p, ItemStack like) {
        int n = 0;
        for (int i = 0; i < p.getInventory().getContainerSize(); i++) {
            ItemStack s = p.getInventory().getItem(i);
            if (ItemStack.isSameItem(s, like)) n += s.getCount();
        }
        return n;
    }

    // ------------------------------------------------------------------ special modules

    /** Clicks per second, sampled per frame via GLFW (no input mixin needed). */
    static final class Cps extends Feature implements HudModule {
        private final long[] left = new long[64], right = new long[64];
        private int li, ri;
        private boolean wasL, wasR;

        Cps() {
            super("cps", "CPS counter", Category.HUD, "Left / right clicks per second.", false);
        }

        private static int count(long[] buf, long now) {
            int c = 0;
            for (long t : buf) if (now - t < 1000) c++;
            return c;
        }

        @Override
        public int render(GuiGraphics g, Minecraft mc, int x, int y) {
            long now = System.currentTimeMillis();
            boolean l = Compat.mouseDown(mc, GLFW.GLFW_MOUSE_BUTTON_LEFT), r = Compat.mouseDown(mc, GLFW.GLFW_MOUSE_BUTTON_RIGHT);
            if (l && !wasL) left[li++ & 63] = now;
            if (r && !wasR) right[ri++ & 63] = now;
            wasL = l;
            wasR = r;
            return HudStyle.label(g, mc, count(left, now) + " | " + count(right, now) + " CPS", x, y);
        }
    }

    static final class Keystrokes extends Feature implements HudModule {
        Keystrokes() {
            super("keystrokes", "Keystrokes", Category.HUD, "Shows W A S D, jump and mouse buttons as you press them.", false);
        }

        private static void key(GuiGraphics g, Minecraft mc, KeyMapping k, String label, int x, int y, int w) {
            boolean down = k.isDown();
            g.fill(x, y, x + w, y + 16, down ? 0xD0E7E9EE : HudStyle.BG);
            g.drawString(mc.font, label, x + (w - mc.font.width(label)) / 2, y + 4, down ? 0xFF191C22 : HudStyle.TEXT, false);
        }

        @Override
        public int render(GuiGraphics g, Minecraft mc, int x, int y) {
            var o = mc.options;
            key(g, mc, o.keyUp, "W", x + 18, y, 16);
            key(g, mc, o.keyLeft, "A", x, y + 18, 16);
            key(g, mc, o.keyDown, "S", x + 18, y + 18, 16);
            key(g, mc, o.keyRight, "D", x + 36, y + 18, 16);
            key(g, mc, o.keyAttack, "LMB", x, y + 36, 25);
            key(g, mc, o.keyUse, "RMB", x + 27, y + 36, 25);
            key(g, mc, o.keyJump, "Jump", x, y + 54, 52);
            return 72 + HudStyle.GAP;
        }
    }

    static final class Armor extends Feature implements HudModule {
        private static final EquipmentSlot[] SLOTS = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET, EquipmentSlot.OFFHAND};

        Armor() {
            super("armor", "Armor status", Category.HUD, "Armor and off-hand items with durability.", true);
        }

        @Override
        public int render(GuiGraphics g, Minecraft mc, int x, int y) {
            int dy = 0;
            for (EquipmentSlot slot : SLOTS) {
                ItemStack s = mc.player.getItemBySlot(slot);
                if (s.isEmpty()) continue;
                g.renderItem(s, x, y + dy);
                g.renderItemDecorations(mc.font, s, x, y + dy);
                if (s.isDamageableItem()) {
                    int left = s.getMaxDamage() - s.getDamageValue();
                    int color = left * 10 < s.getMaxDamage() ? HudStyle.DANGER : HudStyle.TEXT;
                    g.drawString(mc.font, String.valueOf(left), x + 19, y + dy + 4, color, true);
                }
                dy += 17;
            }
            return dy == 0 ? 0 : dy + HudStyle.GAP;
        }
    }

    static final class Potions extends Feature implements HudModule {
        Potions() {
            super("potions", "Potion status", Category.HUD, "Active effects with time left.", true);
        }

        @Override
        public int render(GuiGraphics g, Minecraft mc, int x, int y) {
            int h = 0;
            for (MobEffectInstance e : mc.player.getActiveEffects()) {
                String time = e.isInfiniteDuration() ? "∞" : String.format("%d:%02d", e.getDuration() / 1200, (e.getDuration() / 20) % 60);
                String lvl = e.getAmplifier() > 0 ? " " + (e.getAmplifier() + 1) : "";
                h += HudStyle.label(g, mc, e.getEffect().value().getDisplayName().getString() + lvl + "  " + time, x, y + h);
            }
            return h;
        }
    }

    public static final class Stopwatch extends TextHud {
        private long started = -1, elapsed;

        Stopwatch() {
            super("stopwatch", "Stopwatch", "Start/stop with its key (unbound by default).", false, mc -> "");
        }

        public void toggle() {
            if (started < 0) started = System.currentTimeMillis() - elapsed;
            else {
                elapsed = System.currentTimeMillis() - started;
                started = -1;
            }
        }

        @Override
        public int render(GuiGraphics g, Minecraft mc, int x, int y) {
            long ms = started >= 0 ? System.currentTimeMillis() - started : elapsed;
            return HudStyle.label(g, mc, String.format("%02d:%02d.%d", ms / 60000, (ms / 1000) % 60, (ms / 100) % 10), x, y);
        }
    }

    static final class Speed extends TextHud {
        private double lx, lz;
        private String text = "";

        Speed() {
            super("speed", "Speed", "Horizontal speed in blocks per second.", false, mc -> "");
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null) return;
            double dx = mc.player.getX() - lx, dz = mc.player.getZ() - lz;
            lx = mc.player.getX();
            lz = mc.player.getZ();
            text = String.format("%.2f m/s", Math.sqrt(dx * dx + dz * dz) * 20);
        }

        @Override
        public int render(GuiGraphics g, Minecraft mc, int x, int y) {
            return HudStyle.label(g, mc, text, x, y);
        }
    }

    /**
     * Mini-map, first version: an entity radar (players, hostile and passive mobs as dots
     * around you, rotated with your view). Terrain rendering is on the roadmap; it needs a
     * texture upload path that differs between 1.21.x and 26.x.
     */
    static final class Radar extends Feature implements HudModule {
        private static final int SIZE = 64, RANGE = 32;
        private record Dot(float x, float y, int color) {}

        private final List<Dot> dots = new ArrayList<>();
        private volatile List<Dot> snapshot = List.of();

        Radar() {
            super("minimap", "Mini-map (radar)", Category.HUD, "Nearby players and mobs around you, top right.", false);
        }

        @Override
        public boolean wantsTick() {
            return true;
        }

        @Override
        public boolean stacked() {
            return false;
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null || mc.level == null) return;
            dots.clear();
            double yaw = Math.toRadians(mc.player.getYRot());
            for (Entity e : mc.level.entitiesForRendering()) {
                if (e == mc.player || !(e instanceof LivingEntity)) continue;
                double dx = e.getX() - mc.player.getX(), dz = e.getZ() - mc.player.getZ();
                if (dx * dx + dz * dz > RANGE * RANGE) continue;
                // rotate so "up" on the radar is where you're looking
                double rx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
                double rz = dz * Math.cos(yaw) - dx * Math.sin(yaw);
                int color = e instanceof Player ? 0xFFFFFFFF : e instanceof Enemy ? HudStyle.DANGER : HudStyle.ACCENT;
                dots.add(new Dot((float) (-rx / RANGE), (float) (-rz / RANGE), color));
            }
            snapshot = List.copyOf(dots);
        }

        @Override
        public int render(GuiGraphics g, Minecraft mc, int x, int y) {
            int r = SIZE / 2, cx = mc.getWindow().getGuiScaledWidth() - r - 6, cy = r + 6;
            g.fill(cx - r, cy - r, cx + r, cy + r, HudStyle.BG);
            g.fill(cx - 1, cy - 1, cx + 2, cy + 2, HudStyle.WARN);
            for (Dot d : snapshot) {
                int px = cx + Math.round(d.x() * r), py = cy + Math.round(d.y() * r);
                g.fill(px - 1, py - 1, px + 1, py + 1, d.color());
            }
            return 0;
        }
    }
}
