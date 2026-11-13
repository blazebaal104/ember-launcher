package dev.ember.overlay.features;

import dev.ember.overlay.api.Draw;
import dev.ember.overlay.api.Gfx;
import dev.ember.overlay.api.Util;
import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.Setting;
import dev.ember.overlay.hud.HudLook;
import dev.ember.overlay.hud.HudModule;
import dev.ember.overlay.hud.HudStyle;
import dev.ember.overlay.hud.TextHud;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
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
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

import static dev.ember.overlay.core.FeatureRegistry.register;

/** HUD & information modules. Each has its own options plus the shared look (colour, size...). */
public final class HudFeatures {
    private HudFeatures() {}

    private static final DateTimeFormatter H24 = DateTimeFormatter.ofPattern("HH:mm"), H24S = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final DateTimeFormatter H12 = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH), H12S = DateTimeFormatter.ofPattern("h:mm:ss a", Locale.ENGLISH);
    private static final long SESSION_START = System.currentTimeMillis();
    private static final String[] COMPASS = {"S", "SW", "W", "NW", "N", "NE", "E", "SE"};
    private static final String[] COMPASS_LONG = {"South", "South-west", "West", "North-west", "North", "North-east", "East", "South-east"};

    public static Stopwatch stopwatch;

    /** A text readout with its own settings, declared inline. */
    private static TextHud text(String id, String name, String desc, net.minecraft.world.level.ItemLike icon, Function<Minecraft, String> f) {
        return register(new TextHud(id, name, desc, f).icon(icon));
    }

    public static void registerAll() {
        register(new Fps().icon(Items.REDSTONE_TORCH));
        register(new Cps().icon(Items.STONE_BUTTON));
        register(new Keystrokes().icon(Items.LEVER));
        register(new Ping().icon(Items.BELL));
        register(new Coords().icon(Items.MAP));
        register(new Direction().icon(Items.COMPASS));
        text("biome", "Biome", "Shows the biome you're standing in.", Items.OAK_SAPLING, mc -> Compat.biomeName(mc, mc.player.blockPosition()));
        register(new Armor().icon(Items.DIAMOND_CHESTPLATE));
        register(new Potions().icon(Items.POTION));
        register(stopwatch = new Stopwatch().icon(Items.REPEATER));
        register(new Clock().icon(Items.CLOCK));
        register(new Speed().icon(Items.FEATHER));
        register(new Memory().icon(Items.COMPARATOR));
        text("day", "Day counter", "Which in-game day it is.", Items.SUNFLOWER, mc -> "Day " + (Compat.dayTime(mc) / 24000L + 1));
        text("server", "Server address", "Shows the address of the server you're on (hidden in single-player).", Items.BEACON,
                mc -> mc.getCurrentServer() == null ? "" : mc.getCurrentServer().ip);
        register(new Held().icon(Items.IRON_PICKAXE));
        text("arrows", "Arrow count", "How many arrows you have left, shown while holding a bow or crossbow.", Items.ARROW, mc -> {
            ItemStack s = mc.player.getMainHandItem();
            if (!(s.getItem() instanceof BowItem) && !(s.getItem() instanceof CrossbowItem)) return "";
            return "Arrows " + countInInventory(mc.player, new ItemStack(Items.ARROW));
        });
        text("light", "Light level", "Light level at your feet. Hostile mobs spawn at 0.", Items.TORCH,
                mc -> "Light " + Compat.lightAt(mc, mc.player.blockPosition()));
        text("chunk", "Chunk position", "Which chunk you're in, and where inside it.", Items.GRASS_BLOCK, mc -> {
            BlockPos p = mc.player.blockPosition();
            return "Chunk " + (p.getX() >> 4) + ", " + (p.getZ() >> 4) + " [" + (p.getX() & 15) + ", " + (p.getZ() & 15) + "]";
        });
        text("entities", "Entity count", "How many entities are loaded around you. Useful for finding lag.", Items.ZOMBIE_HEAD,
                mc -> mc.level.getEntityCount() + " entities");
        text("session", "Session time", "How long you've been playing this session.", Items.BOOK, mc -> {
            long m = (System.currentTimeMillis() - SESSION_START) / 60000;
            return "Playing " + (m / 60) + "h " + (m % 60) + "m";
        });
        text("target", "Looking at", "Name of the block under your crosshair.", Items.OBSERVER, mc -> {
            HitResult hit = mc.hitResult;
            if (!(hit instanceof BlockHitResult bh) || hit.getType() != HitResult.Type.BLOCK) return "";
            return mc.level.getBlockState(bh.getBlockPos()).getBlock().getName().getString();
        });
        text("food", "Hunger & saturation", "Exact hunger and the hidden saturation value.", Items.COOKED_BEEF,
                mc -> "Food " + mc.player.getFoodData().getFoodLevel() + "  Sat " + String.format(Locale.ROOT, "%.1f", mc.player.getFoodData().getSaturationLevel()));
        register(new Radar().icon(Items.FILLED_MAP));
        register(new Planned("worldmap", "World map", Category.HUD,
                "A full-screen map of the terrain you've explored. Coming in a later update; until then Ember offers Xaero's World Map in Discover.").icon(Items.CARTOGRAPHY_TABLE));
    }

    static int countInInventory(Player p, ItemStack like) {
        int n = 0;
        for (int i = 0; i < p.getInventory().getContainerSize(); i++) {
            ItemStack s = p.getInventory().getItem(i);
            if (ItemStack.isSameItem(s, like)) n += s.getCount();
        }
        return n;
    }

    // ------------------------------------------------------------------ text readouts with options

    static final class Fps extends TextHud {
        final Setting.Choice format;
        final Setting.Bool colored;

        Fps() {
            super("fps", "FPS counter", "Shows your frames per second.", mc -> "");
            format = add(new Setting.Choice("format", "Format", 0, "120 FPS", "FPS: 120", "120"));
            colored = add(new Setting.Bool("colour_by_value", "Colour by speed", false).help("Green at 60+ FPS, yellow at 30+, red below."));
        }

        @Override
        public void tick(Minecraft mc) {
            int fps = mc.getFps();
            String s = switch (format.v) {
                case 1 -> "FPS: " + fps;
                case 2 -> String.valueOf(fps);
                default -> fps + " FPS";
            };
            cached = look.wrap(s);
            color = !colored.v ? look.text.v : fps >= 60 ? HudStyle.GOOD : fps >= 30 ? HudStyle.WARN : HudStyle.DANGER;
        }
    }

    static final class Ping extends TextHud {
        final Setting.Bool colored;
        final Setting.Bool label;

        Ping() {
            super("ping", "Ping", "Your connection delay to the server. Only shown in multiplayer.", mc -> "");
            label = add(new Setting.Bool("label", "Show \"Ping\" label", false));
            colored = add(new Setting.Bool("colour_by_value", "Colour by delay", true).help("Green under 80 ms, yellow under 150 ms, red above."));
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null || mc.getConnection() == null || mc.isLocalServer()) {
                cached = "";
                return;
            }
            PlayerInfo info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
            if (info == null) {
                cached = "";
                return;
            }
            int ms = info.getLatency();
            cached = look.wrap((label.v ? "Ping " : "") + ms + " ms");
            color = !colored.v ? look.text.v : ms < 80 ? HudStyle.GOOD : ms < 150 ? HudStyle.WARN : HudStyle.DANGER;
        }
    }

    static final class Coords extends TextHud {
        final Setting.Choice layout, decimals;
        final Setting.Bool labels, facing, other;

        Coords() {
            super("coords", "Coordinates", "Shows your X, Y and Z position.", mc -> "");
            layout = add(new Setting.Choice("layout", "Layout", 0, "One line", "Stacked"));
            labels = add(new Setting.Bool("labels", "Show X Y Z labels", true));
            facing = add(new Setting.Bool("facing", "Show facing direction", false));
            decimals = add(new Setting.Choice("decimals", "Decimals", 0, "0", "1", "2").adv());
            other = add(new Setting.Bool("other_dimension", "Show Nether / Overworld position", false).adv()
                    .help("Adds where you'd be in the other dimension, for building portals."));
        }

        private String n(double v) {
            return switch (decimals.v) {
                case 1 -> String.format(Locale.ROOT, "%.1f", v);
                case 2 -> String.format(Locale.ROOT, "%.2f", v);
                default -> String.valueOf((int) Math.floor(v));
            };
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null) return;
            double x = mc.player.getX(), y = mc.player.getY(), z = mc.player.getZ();
            String sep = layout.v == 1 ? "\n" : "  ";
            StringBuilder sb = new StringBuilder();
            sb.append(labels.v ? "X " : "").append(n(x)).append(sep)
                    .append(labels.v ? "Y " : "").append(n(y)).append(sep)
                    .append(labels.v ? "Z " : "").append(n(z));
            if (facing.v) sb.append(layout.v == 1 ? "\n" : "  ").append(COMPASS[Math.floorMod(Math.round(mc.player.getYRot() / 45f), 8)]);
            if (other.v && mc.level != null) {
                String dim = mc.level.dimension().toString();
                boolean nether = dim.contains("the_nether");
                boolean end = dim.contains("the_end");
                if (!end) {
                    double f = nether ? 8 : 0.125;
                    sb.append("\n").append(nether ? "Overworld " : "Nether ").append(n(x * f)).append(", ").append(n(z * f));
                }
            }
            cached = look.wrap(sb.toString());
            color = look.text.v;
        }
    }

    static final class Direction extends TextHud {
        final Setting.Choice format;

        Direction() {
            super("direction", "Direction", "The compass direction you're facing.", mc -> "");
            format = add(new Setting.Choice("format", "Format", 0, "North (180°)", "North", "N", "180°"));
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null) return;
            float yaw = mc.player.getYRot();
            int deg = Math.round(((yaw % 360) + 360) % 360);
            int idx = Math.floorMod(Math.round(yaw / 45f), 8);
            String s = switch (format.v) {
                case 1 -> COMPASS_LONG[idx];
                case 2 -> COMPASS[idx];
                case 3 -> deg + "°";
                default -> Util.prettify(mc.player.getDirection().getName()) + " (" + deg + "°)";
            };
            cached = look.wrap(s);
            color = look.text.v;
        }
    }

    static final class Clock extends TextHud {
        final Setting.Choice format;
        final Setting.Bool seconds;

        Clock() {
            super("clock", "Real-time clock", "Your computer's time, so you know when to stop playing.", mc -> "");
            format = add(new Setting.Choice("format", "Format", 0, "24-hour", "12-hour"));
            seconds = add(new Setting.Bool("seconds", "Show seconds", false));
        }

        @Override
        public void tick(Minecraft mc) {
            DateTimeFormatter f = format.v == 0 ? (seconds.v ? H24S : H24) : (seconds.v ? H12S : H12);
            cached = look.wrap(LocalTime.now().format(f));
            color = look.text.v;
        }
    }

    static final class Memory extends TextHud {
        final Setting.Choice format;

        Memory() {
            super("memory", "Memory usage", "How much of Minecraft's memory is in use.", mc -> "");
            format = add(new Setting.Choice("format", "Format", 0, "MB used / max", "Percent"));
        }

        @Override
        public void tick(Minecraft mc) {
            Runtime rt = Runtime.getRuntime();
            long used = (rt.totalMemory() - rt.freeMemory()) >> 20, max = rt.maxMemory() >> 20;
            cached = look.wrap(format.v == 1 ? "RAM " + (used * 100 / Math.max(1, max)) + "%" : "RAM " + used + " / " + max + " MB");
            color = look.text.v;
        }
    }

    static final class Held extends TextHud {
        final Setting.Bool name;

        Held() {
            super("held", "Held item info", "Durability of your tool, or how many of the held block you have.", mc -> "");
            name = add(new Setting.Bool("name", "Show item name", true));
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null) return;
            ItemStack s = mc.player.getMainHandItem();
            String prefix = name.v ? s.getHoverName().getString() + " " : "";
            String out = "";
            if (!s.isEmpty()) {
                if (s.isDamageableItem()) out = prefix + (s.getMaxDamage() - s.getDamageValue()) + "/" + s.getMaxDamage();
                else if (s.getCount() > 1 || s.getMaxStackSize() > 1) out = prefix + "x" + countInInventory(mc.player, s);
            }
            cached = out.isEmpty() ? "" : look.wrap(out);
            color = look.text.v;
        }
    }

    static final class Speed extends TextHud {
        final Setting.Choice unit;
        final Setting.Bool vertical;
        private double lx, ly, lz;

        Speed() {
            super("speed", "Speed", "How fast you're moving.", mc -> "");
            unit = add(new Setting.Choice("unit", "Unit", 0, "blocks/s", "km/h"));
            vertical = add(new Setting.Bool("vertical", "Include falling / climbing", false).adv());
        }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null) return;
            double dx = mc.player.getX() - lx, dy = vertical.v ? mc.player.getY() - ly : 0, dz = mc.player.getZ() - lz;
            lx = mc.player.getX();
            ly = mc.player.getY();
            lz = mc.player.getZ();
            double bps = Math.sqrt(dx * dx + dy * dy + dz * dz) * 20;
            cached = look.wrap(unit.v == 1 ? String.format(Locale.ROOT, "%.1f km/h", bps * 3.6) : String.format(Locale.ROOT, "%.2f b/s", bps));
            color = look.text.v;
        }
    }

    // ------------------------------------------------------------------ drawn modules

    /** Clicks per second, sampled per frame from the mouse handler (no input mixin needed). */
    static final class Cps extends Feature implements HudModule {
        private static final long[] left = new long[64], right = new long[64];
        private static int li, ri;
        private static boolean wasL, wasR;
        final Setting.Bool showRight;
        HudLook look;

        Cps() {
            super("cps", "CPS counter", Category.HUD, "Shows how many times per second you click.");
            showRight = add(new Setting.Bool("right", "Show right clicks", true));
        }

        @Override public void finishSettings() { look = HudLook.attach(this); }
        @Override public HudLook look() { return look; }

        private static int count(long[] buf, long now) {
            int c = 0;
            for (long t : buf) if (now - t < 1000) c++;
            return c;
        }

        static void sample(Minecraft mc) {
            long now = System.currentTimeMillis();
            boolean l = Compat.mouseDown(mc, true), r = Compat.mouseDown(mc, false);
            if (l && !wasL) left[li++ & 63] = now;
            if (r && !wasR) right[ri++ & 63] = now;
            wasL = l;
            wasR = r;
        }

        static int leftCps() {
            return count(left, System.currentTimeMillis());
        }

        static int rightCps() {
            return count(right, System.currentTimeMillis());
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            sample(mc);
            String s = showRight.v ? leftCps() + " | " + rightCps() + " CPS" : leftCps() + " CPS";
            return HudStyle.label(g, mc, look.wrap(s), x, y, look);
        }
    }

    static final class Keystrokes extends Feature implements HudModule {
        final Setting.Bool mouse, jump, cps;
        final Setting.Color pressed;
        final Setting.Slider keySize;
        HudLook look;

        Keystrokes() {
            super("keystrokes", "Keystrokes", Category.HUD, "Shows W A S D, jump and your mouse buttons lighting up as you press them.");
            mouse = add(new Setting.Bool("mouse", "Show mouse buttons", true));
            jump = add(new Setting.Bool("jump", "Show jump bar", true));
            pressed = add(new Setting.Color("pressed", "Pressed colour", 0xFFE9EBF0));
            cps = add(new Setting.Bool("cps", "Show CPS on mouse buttons", false).adv());
            keySize = add(new Setting.Slider("key_size", "Key size", 14, 24, 1, 16, v -> v + " px").adv());
        }

        @Override public void finishSettings() { look = HudLook.attach(this); }
        @Override public HudLook look() { return look; }

        private void key(Gfx g, Minecraft mc, KeyMapping k, String label, int x, int y, int w, int h) {
            boolean down = k.isDown();
            int bg = down ? pressed.v : look.bg();
            if (bg != 0 || down) {
                if (look.rounded.v) Draw.round(g, x, y, x + w, y + h, 2, bg);
                else g.fill(x, y, x + w, y + h, bg);
            }
            int fg = down ? (Draw.luma(pressed.v) > 0.6f ? 0xFF15171C : 0xFFFFFFFF) : look.text.v;
            g.text(label, x + (w - mc.font.width(label)) / 2, y + (h - 8) / 2, fg, look.shadow.v && !down);
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            var o = mc.options;
            int k = keySize.v, gap = 2, row = k + gap, full = k * 3 + gap * 2;
            key(g, mc, o.keyUp, "W", x + row, y, k, k);
            key(g, mc, o.keyLeft, "A", x, y + row, k, k);
            key(g, mc, o.keyDown, "S", x + row, y + row, k, k);
            key(g, mc, o.keyRight, "D", x + row * 2, y + row, k, k);
            int h = row * 2;
            if (mouse.v) {
                int half = (full - gap) / 2;
                if (cps.v) Cps.sample(mc);
                key(g, mc, o.keyAttack, cps.v ? Cps.leftCps() + " CPS" : "LMB", x, y + h, half, k);
                key(g, mc, o.keyUse, cps.v ? Cps.rightCps() + " CPS" : "RMB", x + half + gap, y + h, full - half - gap, k);
                h += row;
            }
            if (jump.v) {
                key(g, mc, o.keyJump, "—", x, y + h, full, Math.max(8, k / 2));
                h += Math.max(8, k / 2) + gap;
            }
            return h + HudStyle.GAP;
        }
    }

    static final class Armor extends Feature implements HudModule {
        private static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
        final Setting.Choice layout, durability;
        final Setting.Bool mainHand, offHand, onlyDamaged;
        final Setting.Slider warnAt;
        HudLook look;

        Armor() {
            super("armor", "Armor status", Category.HUD, "Your armor and held items with how much durability they have left.");
            layout = add(new Setting.Choice("layout", "Layout", 0, "Vertical", "Horizontal"));
            durability = add(new Setting.Choice("durability", "Durability as", 0, "Number", "Percent", "Bar", "Hidden"));
            mainHand = add(new Setting.Bool("main_hand", "Show held item", false));
            offHand = add(new Setting.Bool("off_hand", "Show off-hand item", true));
            warnAt = add(new Setting.Slider("warn_at", "Turn red below", 5, 50, 5, 10, v -> v + "%").adv());
            onlyDamaged = add(new Setting.Bool("only_damaged", "Only show damaged items' durability", false).adv());
        }

        @Override public void finishSettings() { look = HudLook.attach(this); }
        @Override public HudLook look() { return look; }

        private int drawOne(Gfx g, Minecraft mc, ItemStack s, int x, int y, boolean horizontal) {
            if (s.isEmpty()) return 0;
            g.item(s, x, y);
            if (durability.v != 2) g.itemDecorations(s, x, y);
            if (!s.isDamageableItem() || durability.v == 3) return horizontal ? 18 : 17;
            int max = s.getMaxDamage(), left = max - s.getDamageValue();
            if (onlyDamaged.v && left == max) return horizontal ? 18 : 17;
            int pct = left * 100 / Math.max(1, max);
            int color = pct < warnAt.v ? HudStyle.DANGER : look.text.v;
            if (durability.v == 2) {
                int bx = horizontal ? x + 1 : x + 19, by = horizontal ? y + 17 : y + 7, bw = horizontal ? 14 : 24;
                g.fill(bx, by, bx + bw, by + 2, 0xC0101216);
                g.fill(bx, by, bx + Math.max(1, bw * pct / 100), by + 2, pct < warnAt.v ? HudStyle.DANGER : Draw.mix(HudStyle.DANGER, HudStyle.GOOD, pct / 100f));
                return horizontal ? 18 : (17);
            }
            String t = durability.v == 1 ? pct + "%" : String.valueOf(left);
            if (horizontal) {
                g.text(t, x + 8 - mc.font.width(t) / 2, y + 18, color, true);
                return Math.max(18, mc.font.width(t) + 2);
            }
            g.text(t, x + 19, y + 4, color, true);
            return 17;
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            boolean horizontal = layout.v == 1;
            int d = 0;
            if (mainHand.v) d += drawOne(g, mc, mc.player.getMainHandItem(), horizontal ? x + d : x, horizontal ? y : y + d, horizontal);
            for (EquipmentSlot slot : ARMOR) {
                ItemStack s = mc.player.getItemBySlot(slot);
                d += drawOne(g, mc, s, horizontal ? x + d : x, horizontal ? y : y + d, horizontal);
            }
            if (offHand.v) d += drawOne(g, mc, mc.player.getOffhandItem(), horizontal ? x + d : x, horizontal ? y : y + d, horizontal);
            if (d == 0) return 0;
            return (horizontal ? (durability.v == 3 || durability.v == 2 ? 20 : 28) : d) + HudStyle.GAP;
        }
    }

    static final class Potions extends Feature implements HudModule {
        final Setting.Bool time, level, blink;
        HudLook look;

        Potions() {
            super("potions", "Potion status", Category.HUD, "Your active effects and how long they have left.");
            time = add(new Setting.Bool("time", "Show time left", true));
            level = add(new Setting.Bool("level", "Show level", true));
            blink = add(new Setting.Bool("blink", "Blink when about to end", true).adv().help("Flashes in the last 10 seconds."));
        }

        @Override public void finishSettings() { look = HudLook.attach(this); }
        @Override public HudLook look() { return look; }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            int h = 0;
            for (MobEffectInstance e : mc.player.getActiveEffects()) {
                int ticks = e.getDuration();
                if (blink.v && !e.isInfiniteDuration() && ticks < 200 && (System.currentTimeMillis() / 300) % 2 == 0) {
                    h += HudStyle.label(g, mc, " ", x, y + h, look);
                    continue;
                }
                String t = e.isInfiniteDuration() ? "∞" : String.format(Locale.ROOT, "%d:%02d", ticks / 1200, (ticks / 20) % 60);
                String lvl = level.v && e.getAmplifier() > 0 ? " " + (e.getAmplifier() + 1) : "";
                String s = e.getEffect().value().getDisplayName().getString() + lvl + (time.v ? "  " + t : "");
                h += HudStyle.label(g, mc, look.wrap(s), x, y + h, look);
            }
            return h;
        }
    }

    public static final class Stopwatch extends TextHud {
        private long started = -1, elapsed;

        Stopwatch() {
            super("stopwatch", "Stopwatch", "A stopwatch on your screen. Start and stop it with its key.", mc -> "");
        }

        public void toggle() {
            if (started < 0) started = System.currentTimeMillis() - elapsed;
            else {
                elapsed = System.currentTimeMillis() - started;
                started = -1;
            }
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            long ms = started >= 0 ? System.currentTimeMillis() - started : elapsed;
            return HudStyle.label(g, mc, look.wrap(String.format(Locale.ROOT, "%02d:%02d.%d", ms / 60000, (ms / 1000) % 60, (ms / 100) % 10)), x, y, look);
        }
    }

    /** Mini-map (radar): nearby players and mobs as dots around you. */
    static final class Radar extends Feature implements HudModule {
        private record Dot(float x, float y, int color) {}

        final Setting.Slider size, range;
        final Setting.Bool players, hostile, passive, rotate;
        final Setting.Choice shape;
        HudLook look;
        private final List<Dot> dots = new ArrayList<>();
        private volatile List<Dot> snapshot = List.of();

        Radar() {
            super("minimap", "Mini-map (radar)", Category.HUD, "Shows nearby players and mobs as dots around you, so nothing sneaks up on you.");
            size = add(new Setting.Slider("size", "Map size", 48, 128, 8, 64, v -> v + " px"));
            range = add(new Setting.Slider("range", "Range", 16, 64, 8, 32, v -> v + " blocks"));
            shape = add(new Setting.Choice("shape", "Shape", 0, "Square", "Circle"));
            players = add(new Setting.Bool("players", "Show players", true));
            hostile = add(new Setting.Bool("hostile", "Show hostile mobs", true));
            passive = add(new Setting.Bool("passive", "Show animals", true));
            rotate = add(new Setting.Bool("rotate", "Turn with your view", true).adv().help("Off: north is always up."));
        }

        @Override public void finishSettings() { look = HudLook.attach(this); }
        @Override public HudLook look() { return look; }
        @Override public float[] defaultPos() { return new float[]{0.99f, 0.01f}; }
        @Override public boolean wantsTick() { return true; }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null || mc.level == null) return;
            dots.clear();
            int r = range.v;
            double yaw = rotate.v ? Math.toRadians(mc.player.getYRot()) : Math.PI;
            for (Entity e : mc.level.entitiesForRendering()) {
                if (e == mc.player || !(e instanceof LivingEntity)) continue;
                boolean isPlayer = e instanceof Player, isEnemy = e instanceof Enemy;
                if (isPlayer ? !players.v : isEnemy ? !hostile.v : !passive.v) continue;
                double dx = e.getX() - mc.player.getX(), dz = e.getZ() - mc.player.getZ();
                if (dx * dx + dz * dz > (double) r * r) continue;
                double rx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
                double rz = dz * Math.cos(yaw) - dx * Math.sin(yaw);
                int color = isPlayer ? 0xFFFFFFFF : isEnemy ? HudStyle.DANGER : HudStyle.ACCENT;
                dots.add(new Dot((float) (-rx / r), (float) (-rz / r), color));
            }
            snapshot = List.copyOf(dots);
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            int s = size.v, r = s / 2, cx = x + r, cy = y + r;
            int bg = look.background.v ? look.bg() : 0;
            if (shape.v == 1) {
                Draw.circle(g, cx, cy, r, bg == 0 ? 0x20000000 : bg);
            } else if (look.rounded.v) Draw.round(g, x, y, x + s, y + s, 4, bg == 0 ? 0x20000000 : bg);
            else g.fill(x, y, x + s, y + s, bg == 0 ? 0x20000000 : bg);
            g.fill(cx - 1, cy - 1, cx + 2, cy + 2, HudStyle.WARN);
            for (Dot d : snapshot) {
                if (shape.v == 1 && d.x() * d.x() + d.y() * d.y() > 1f) continue;
                int px = cx + Math.round(d.x() * (r - 2)), py = cy + Math.round(d.y() * (r - 2));
                g.fill(px - 1, py - 1, px + 1, py + 1, d.color());
            }
            if (!rotate.v) g.text("N", cx - 2, y + 2, look.text.v, true);
            return s + HudStyle.GAP;
        }
    }
}
