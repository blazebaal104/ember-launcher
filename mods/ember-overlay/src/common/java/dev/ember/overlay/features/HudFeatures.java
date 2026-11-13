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
import dev.ember.overlay.map.MapData;
import dev.ember.overlay.map.MapView;
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

/** HUD & information modules. Each has its own options plus the shared look/visibility ones it uses. */
public final class HudFeatures {
    private HudFeatures() {}

    private static final DateTimeFormatter H24 = DateTimeFormatter.ofPattern("HH:mm"), H24S = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final DateTimeFormatter H12 = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH), H12S = DateTimeFormatter.ofPattern("h:mm:ss a", Locale.ENGLISH);
    private static final long SESSION_START = System.currentTimeMillis();
    private static final String[] COMPASS = {"S", "SW", "W", "NW", "N", "NE", "E", "SE"};
    private static final String[] COMPASS_LONG = {"South", "South-west", "West", "North-west", "North", "North-east", "East", "South-east"};

    public static Stopwatch stopwatch;
    public static Minimap minimap;

    private static TextHud text(String id, String name, String desc, Function<Minecraft, String> f) {
        return register(new TextHud(id, name, desc, f));
    }

    public static void registerAll() {
        register(new Fps());
        register(new Cps());
        register(new Keystrokes());
        register(new Ping());
        register(new Coords());
        register(new Direction());
        text("biome", "Biome", "Shows the biome you're standing in.", mc -> Compat.biomeName(mc, mc.player.blockPosition()));
        register(new Armor());
        register(new Potions());
        register(stopwatch = new Stopwatch());
        register(new Clock());
        register(new Speed());
        register(new Memory());
        text("day", "Day counter", "Which in-game day it is.", mc -> "Day " + (Compat.dayTime(mc) / 24000L + 1));
        text("server", "Server address", "Shows the address of the server you're on (hidden in single-player).",
                mc -> mc.getCurrentServer() == null ? "" : mc.getCurrentServer().ip);
        register(new Held());
        text("arrows", "Arrow count", "How many arrows you have left, shown while holding a bow or crossbow.", mc -> {
            ItemStack s = mc.player.getMainHandItem();
            if (!(s.getItem() instanceof BowItem) && !(s.getItem() instanceof CrossbowItem)) return "";
            return "Arrows " + countInInventory(mc.player, new ItemStack(Items.ARROW));
        });
        text("light", "Light level", "Light level at your feet. Hostile mobs spawn at 0.", mc -> "Light " + Compat.lightAt(mc, mc.player.blockPosition()));
        text("chunk", "Chunk position", "Which chunk you're in, and where inside it.", mc -> {
            BlockPos p = mc.player.blockPosition();
            return "Chunk " + (p.getX() >> 4) + ", " + (p.getZ() >> 4) + " [" + (p.getX() & 15) + ", " + (p.getZ() & 15) + "]";
        });
        text("entities", "Entity count", "How many entities are loaded around you. Useful for finding lag.", mc -> mc.level.getEntityCount() + " entities");
        text("session", "Session time", "How long you've been playing this session.", mc -> {
            long m = (System.currentTimeMillis() - SESSION_START) / 60000;
            return "Playing " + (m / 60) + "h " + (m % 60) + "m";
        });
        text("target", "Looking at", "Name of the block under your crosshair.", mc -> {
            HitResult hit = mc.hitResult;
            if (!(hit instanceof BlockHitResult bh) || hit.getType() != HitResult.Type.BLOCK) return "";
            return mc.level.getBlockState(bh.getBlockPos()).getBlock().getName().getString();
        });
        text("food", "Hunger & saturation", "Exact hunger and the hidden saturation value.",
                mc -> "Food " + mc.player.getFoodData().getFoodLevel() + "  Sat " + String.format(Locale.ROOT, "%.1f", mc.player.getFoodData().getSaturationLevel()));
        register(minimap = new Minimap());
        register(new Radar());
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
        final Setting.Choice format, rate;
        final Setting.Bool colored;
        private long last;

        Fps() {
            super("fps", "FPS counter", "Shows your frames per second.", mc -> "");
            format = add(new Setting.Choice("format", "Format", 0, "120 FPS", "FPS: 120", "120"));
            colored = add(new Setting.Bool("colour_by_value", "Colour by speed", false).help("Green at 60+ FPS, yellow at 30+, red below."));
            rate = add(new Setting.Choice("rate", "Update", 1, "Fast", "Normal", "Slow").adv().help("How often the number changes."));
        }

        @Override
        public void tick(Minecraft mc) {
            long now = System.currentTimeMillis();
            if (now - last < (rate.v == 0 ? 100 : rate.v == 1 ? 500 : 1000)) return;
            last = now;
            int fps = mc.getFps();
            String s = switch (format.v) {
                case 1 -> "FPS: " + fps;
                case 2 -> String.valueOf(fps);
                default -> fps + " FPS";
            };
            cached = look.wrap(s);
            color = !colored.v ? look.textColor() : fps >= 60 ? HudStyle.GOOD : fps >= 30 ? HudStyle.WARN : HudStyle.DANGER;
        }
    }

    static final class Ping extends TextHud {
        final Setting.Bool colored, label;

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
            color = !colored.v ? look.textColor() : ms < 80 ? HudStyle.GOOD : ms < 150 ? HudStyle.WARN : HudStyle.DANGER;
        }
    }

    static final class Coords extends TextHud {
        final Setting.Choice layout, decimals;
        final Setting.Bool labels, facing, other, biome;

        Coords() {
            super("coords", "Coordinates", "Shows your X, Y and Z position.", mc -> "");
            layout = add(new Setting.Choice("layout", "Layout", 0, "One line", "Stacked"));
            labels = add(new Setting.Bool("labels", "Show X Y Z labels", true));
            facing = add(new Setting.Bool("facing", "Show facing direction", false));
            biome = add(new Setting.Bool("biome", "Show biome", false));
            decimals = add(new Setting.Choice("decimals", "Decimals", 0, "0", "1", "2").adv());
            other = add(new Setting.Bool("other_dimension", "Show Nether / Overworld position", false).adv()
                    .help("Where you'd be in the other dimension, for linking portals."));
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
            if (facing.v) sb.append(sep).append(COMPASS[Math.floorMod(Math.round(mc.player.getYRot() / 45f), 8)]);
            if (biome.v) sb.append("\n").append(Compat.biomeName(mc, mc.player.blockPosition()));
            if (other.v && mc.level != null) {
                String dim = mc.level.dimension().toString();
                if (!dim.contains("the_end")) {
                    boolean nether = dim.contains("the_nether");
                    double f = nether ? 8 : 0.125;
                    sb.append("\n").append(nether ? "Overworld " : "Nether ").append(n(x * f)).append(", ").append(n(z * f));
                }
            }
            cached = look.wrap(sb.toString());
            color = look.textColor();
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
            color = look.textColor();
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
            color = look.textColor();
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
            color = look.textColor();
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
                else if (s.getMaxStackSize() > 1) out = prefix + "x" + countInInventory(mc.player, s);
            }
            cached = out.isEmpty() ? "" : look.wrap(out);
            color = look.textColor();
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
            color = look.textColor();
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

        @Override public void finishSettings() { look = HudLook.attach(this, HudLook.LABEL); }
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
        final Setting.Bool mouse, jump, cps, fade;
        final Setting.Color pressed, pressedText;
        final Setting.Slider keySize, gap;
        HudLook look;
        private final float[] glow = new float[7];
        private long lastFrame;

        Keystrokes() {
            super("keystrokes", "Keystrokes", Category.HUD, "Shows W A S D, jump and your mouse buttons lighting up as you press them.");
            mouse = add(new Setting.Bool("mouse", "Show mouse buttons", true));
            jump = add(new Setting.Bool("jump", "Show jump bar", true));
            pressed = add(new Setting.Color("pressed", "Pressed colour", 0xFFE9EBF0));
            pressedText = add(new Setting.Color("pressed_text", "Pressed text colour", 0xFF1B1E24));
            cps = add(new Setting.Bool("cps", "Show CPS on mouse buttons", false).adv());
            fade = add(new Setting.Bool("fade", "Fade out after a press", true).adv());
            keySize = add(new Setting.Slider("key_size", "Key size", 14, 26, 1, 18, v -> v + " px").adv());
            gap = add(new Setting.Slider("gap", "Space between keys", 0, 5, 1, 2, v -> v + " px").adv());
        }

        @Override public void finishSettings() { look = HudLook.attach(this, HudLook.TEXT | HudLook.BACKGROUND | HudLook.SHADOW | HudLook.ROUNDED); }
        @Override public HudLook look() { return look; }

        private void key(Gfx g, Minecraft mc, int i, KeyMapping k, String label, int x, int y, int w, int h, float dt) {
            boolean down = k.isDown();
            float t = glow[i];
            if (down) t = 1;
            else t = fade.v ? Math.max(0, t - dt * 6f) : 0;
            glow[i] = t;
            int bg = Draw.mix(look.bg(), pressed.v, t);
            if ((bg >>> 24) != 0) {
                if (look.rounded()) Draw.round(g, x, y, x + w, y + h, 2, bg);
                else g.fill(x, y, x + w, y + h, bg);
            }
            if (label.isEmpty()) {
                g.fill(x + w / 2 - 6, y + h / 2, x + w / 2 + 6, y + h / 2 + 1, Draw.mix(look.textColor(), pressedText.v, t));
                return;
            }
            int fg = Draw.mix(look.textColor(), pressedText.v, t);
            g.text(label, x + (w - mc.font.width(label)) / 2, y + (h - 8) / 2, fg, look.shadow() && t < 0.5f);
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            long now = System.nanoTime();
            float dt = lastFrame == 0 ? 0 : Math.min(0.1f, (now - lastFrame) / 1e9f);
            lastFrame = now;
            var o = mc.options;
            int k = keySize.v, gp = gap.v, row = k + gp, full = k * 3 + gp * 2;
            key(g, mc, 0, o.keyUp, "W", x + row, y, k, k, dt);
            key(g, mc, 1, o.keyLeft, "A", x, y + row, k, k, dt);
            key(g, mc, 2, o.keyDown, "S", x + row, y + row, k, k, dt);
            key(g, mc, 3, o.keyRight, "D", x + row * 2, y + row, k, k, dt);
            int h = row * 2;
            if (mouse.v) {
                int half = (full - gp) / 2;
                if (cps.v) Cps.sample(mc);
                key(g, mc, 4, o.keyAttack, cps.v ? Cps.leftCps() + " CPS" : "LMB", x, y + h, half, k, dt);
                key(g, mc, 5, o.keyUse, cps.v ? Cps.rightCps() + " CPS" : "RMB", x + half + gp, y + h, full - half - gp, k, dt);
                h += row;
            }
            if (jump.v) {
                int jh = Math.max(8, k / 2);
                key(g, mc, 6, o.keyJump, "", x, y + h, full, jh, dt);
                h += jh + gp;
            }
            return h + HudStyle.GAP;
        }
    }

    static final class Armor extends Feature implements HudModule {
        private static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
        final Setting.Choice layout, durability;
        final Setting.Bool mainHand, offHand, onlyDamaged, bar;
        final Setting.Slider warnAt;
        final Setting.Color warnColor;
        HudLook look;

        Armor() {
            super("armor", "Armor status", Category.HUD, "Your armor and held items with how much durability they have left.");
            layout = add(new Setting.Choice("layout", "Layout", 0, "Vertical", "Horizontal"));
            durability = add(new Setting.Choice("durability", "Durability as", 0, "Number", "Percent", "Hidden"));
            bar = add(new Setting.Bool("bar", "Durability bar on items", true).help("Minecraft's green-to-red bar under each item."));
            mainHand = add(new Setting.Bool("main_hand", "Show held item", false));
            offHand = add(new Setting.Bool("off_hand", "Show off-hand item", true));
            warnAt = add(new Setting.Slider("warn_at", "Warn below", 5, 50, 5, 10, v -> v + "%").adv());
            warnColor = add(new Setting.Color("warn_color", "Warning colour", HudStyle.DANGER).adv());
            onlyDamaged = add(new Setting.Bool("only_damaged", "Only show damaged items' durability", false).adv());
        }

        @Override public void finishSettings() { look = HudLook.attach(this, HudLook.TEXT | HudLook.BACKGROUND | HudLook.SHADOW | HudLook.ROUNDED | HudLook.PADDING); }
        @Override public HudLook look() { return look; }

        private final List<ItemStack> items = new ArrayList<>();

        private String label(ItemStack s) {
            if (!s.isDamageableItem() || durability.v == 2) return "";
            int max = s.getMaxDamage(), left = max - s.getDamageValue();
            if (onlyDamaged.v && left == max) return "";
            return durability.v == 1 ? (left * 100 / Math.max(1, max)) + "%" : String.valueOf(left);
        }

        private int color(ItemStack s) {
            if (!s.isDamageableItem()) return look.textColor();
            int max = s.getMaxDamage(), left = max - s.getDamageValue();
            return left * 100 < warnAt.v * max ? warnColor.v : look.textColor();
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            items.clear();
            if (mainHand.v && !mc.player.getMainHandItem().isEmpty()) items.add(mc.player.getMainHandItem());
            for (EquipmentSlot slot : ARMOR) if (!mc.player.getItemBySlot(slot).isEmpty()) items.add(mc.player.getItemBySlot(slot));
            if (offHand.v && !mc.player.getOffhandItem().isEmpty()) items.add(mc.player.getOffhandItem());
            if (items.isEmpty()) return 0;
            boolean horizontal = layout.v == 1;
            int pad = look.hasBackground() ? look.padding() : 0;
            int w, h;
            if (horizontal) {
                int cell = 18;
                for (ItemStack s : items) cell = Math.max(cell, mc.font.width(label(s)) + 2);
                boolean anyText = items.stream().anyMatch(s -> !label(s).isEmpty());
                w = items.size() * cell + pad * 2;
                h = 16 + (anyText ? 10 : 0) + pad * 2;
                HudStyle.plate(g, look, x, y, x + w, y + h);
                for (int i = 0; i < items.size(); i++) {
                    ItemStack s = items.get(i);
                    int ix = x + pad + i * cell + (cell - 16) / 2, iy = y + pad;
                    g.item(s, ix, iy);
                    if (bar.v) g.itemDecorations(s, ix, iy);
                    String t = label(s);
                    if (!t.isEmpty()) g.text(t, ix + 8 - mc.font.width(t) / 2, iy + 17, color(s), look.shadow());
                }
            } else {
                int tw = 0;
                for (ItemStack s : items) tw = Math.max(tw, mc.font.width(label(s)));
                w = 16 + (tw > 0 ? tw + 4 : 0) + pad * 2;
                h = items.size() * 17 - 1 + pad * 2;
                HudStyle.plate(g, look, x, y, x + w, y + h);
                for (int i = 0; i < items.size(); i++) {
                    ItemStack s = items.get(i);
                    int ix = x + pad, iy = y + pad + i * 17;
                    g.item(s, ix, iy);
                    if (bar.v) g.itemDecorations(s, ix, iy);
                    String t = label(s);
                    if (!t.isEmpty()) g.text(t, ix + 20, iy + 4, color(s), look.shadow());
                }
            }
            return h + HudStyle.GAP;
        }
    }

    static final class Potions extends Feature implements HudModule {
        final Setting.Choice style;
        final Setting.Bool time, level, blink, badRed;
        final Setting.Color badColor;
        HudLook look;

        Potions() {
            super("potions", "Potion status", Category.HUD, "Your active effects and how long they have left.");
            style = add(new Setting.Choice("style", "Show as", 0, "Icon + text", "Icons only", "Text only"));
            time = add(new Setting.Bool("time", "Show time left", true));
            level = add(new Setting.Bool("level", "Show level", true));
            badRed = add(new Setting.Bool("bad_red", "Colour harmful effects", true).help("Poison, Wither, Slowness and other bad effects stand out."));
            badColor = add(new Setting.Color("bad_color", "Harmful colour", HudStyle.DANGER));
            badColor.showIf(() -> badRed.v);
            blink = add(new Setting.Bool("blink", "Blink when about to end", true).adv().help("Flashes in the last 10 seconds."));
        }

        @Override public void finishSettings() { look = HudLook.attach(this, HudLook.TEXT | HudLook.BACKGROUND | HudLook.SHADOW | HudLook.ROUNDED | HudLook.PADDING); }
        @Override public HudLook look() { return look; }

        private static String time(MobEffectInstance e) {
            int t = e.getDuration();
            return e.isInfiniteDuration() ? "∞" : String.format(Locale.ROOT, "%d:%02d", t / 1200, (t / 20) % 60);
        }

        private static String roman(int n) {
            return switch (n) {
                case 1 -> "I"; case 2 -> "II"; case 3 -> "III"; case 4 -> "IV"; case 5 -> "V";
                default -> String.valueOf(n);
            };
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            var effects = mc.player.getActiveEffects();
            if (effects.isEmpty()) return 0;
            boolean icons = style.v != 2, text = style.v != 1;
            int pad = look.hasBackground() ? look.padding() : 0;
            boolean blinkOff = (System.currentTimeMillis() / 300) % 2 == 0;
            if (!text) {
                // a row of icons with the time under each
                int cell = 22, w = effects.size() * cell + pad * 2 - 4, h = 18 + (time.v ? 10 : 0) + pad * 2;
                HudStyle.plate(g, look, x, y, x + w, y + h);
                int i = 0;
                for (MobEffectInstance e : effects) {
                    int ix = x + pad + i++ * cell;
                    if (blink.v && !e.isInfiniteDuration() && e.getDuration() < 200 && blinkOff) continue;
                    g.effectIcon(e.getEffect(), ix, y + pad);
                    if (time.v) {
                        String t = time(e);
                        g.text(t, ix + 9 - mc.font.width(t) / 2, y + pad + 19, color(e), look.shadow());
                    }
                }
                return h + HudStyle.GAP;
            }
            int lineH = icons ? 20 : 11, w = 0;
            List<String> lines = new ArrayList<>();
            for (MobEffectInstance e : effects) {
                String s = e.getEffect().value().getDisplayName().getString() + (level.v && e.getAmplifier() > 0 ? " " + roman(e.getAmplifier() + 1) : "");
                if (time.v) s = s + "  " + time(e);
                s = look.wrap(s);
                lines.add(s);
                w = Math.max(w, mc.font.width(s));
            }
            w += (icons ? 22 : 0) + pad * 2;
            int h = effects.size() * lineH - (icons ? 2 : 2) + pad * 2;
            HudStyle.plate(g, look, x, y, x + w, y + h);
            int i = 0;
            for (MobEffectInstance e : effects) {
                int ly = y + pad + i * lineH;
                String s = lines.get(i++);
                if (blink.v && !e.isInfiniteDuration() && e.getDuration() < 200 && blinkOff) continue;
                int tx = x + pad;
                if (icons) {
                    g.effectIcon(e.getEffect(), tx, ly);
                    tx += 22;
                }
                g.text(s, tx, ly + (icons ? 5 : 0), color(e), look.shadow());
            }
            return h + HudStyle.GAP;
        }

        private int color(MobEffectInstance e) {
            return badRed.v && !e.getEffect().value().isBeneficial() ? badColor.v : look.textColor();
        }
    }

    public static final class Stopwatch extends TextHud {
        private long started = -1, elapsed;
        final Setting.Bool tenths;

        Stopwatch() {
            super("stopwatch", "Stopwatch", "A stopwatch on your screen. Start and stop it with its key.", mc -> "");
            tenths = add(new Setting.Bool("tenths", "Show tenths of a second", true));
        }

        public void toggle() {
            if (started < 0) started = System.currentTimeMillis() - elapsed;
            else {
                elapsed = System.currentTimeMillis() - started;
                started = -1;
            }
        }

        public void reset() {
            started = -1;
            elapsed = 0;
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            long ms = started >= 0 ? System.currentTimeMillis() - started : elapsed;
            String s = tenths.v ? String.format(Locale.ROOT, "%02d:%02d.%d", ms / 60000, (ms / 1000) % 60, (ms / 100) % 10)
                    : String.format(Locale.ROOT, "%02d:%02d", ms / 60000, (ms / 1000) % 60);
            return HudStyle.label(g, mc, look.wrap(s), x, y, look);
        }
    }

    // ------------------------------------------------------------------ entity dots (radar + minimap)

    record Dot(double dx, double dz, int kind) {}

    static List<Dot> collect(Minecraft mc, int range, boolean players, boolean hostile, boolean passive) {
        List<Dot> out = new ArrayList<>();
        for (Entity e : mc.level.entitiesForRendering()) {
            if (e == mc.player || !(e instanceof LivingEntity)) continue;
            int kind = e instanceof Player ? 0 : e instanceof Enemy ? 1 : 2;
            if (kind == 0 ? !players : kind == 1 ? !hostile : !passive) continue;
            double dx = e.getX() - mc.player.getX(), dz = e.getZ() - mc.player.getZ();
            if (dx * dx + dz * dz > (double) range * range) continue;
            out.add(new Dot(dx, dz, kind));
        }
        return out;
    }

    /** Radar: nearby players and mobs as dots around you, turning with your view. */
    static final class Radar extends Feature implements HudModule {
        final Setting.Slider size, range;
        final Setting.Bool players, hostile, passive, rotate, autoZoom, rings, border;
        final Setting.Choice shape;
        final Setting.Color playerColor, hostileColor, passiveColor, youColor, borderColor;
        HudLook look;
        private volatile List<Dot> snapshot = List.of();
        private float shownRange = 32;
        private volatile float targetRange = 32;

        Radar() {
            super("radar", "Radar", Category.HUD, "Shows nearby players and mobs as dots around you, so nothing sneaks up on you.");
            size = add(new Setting.Slider("size", "Radar size", 48, 128, 8, 64, v -> v + " px"));
            range = add(new Setting.Slider("range", "Range", 16, 96, 8, 48, v -> v + " blocks"));
            autoZoom = add(new Setting.Bool("auto_zoom", "Auto zoom", true).help("Zooms in and out so the farthest mob in range is near the edge."));
            shape = add(new Setting.Choice("shape", "Shape", 1, "Square", "Circle"));
            players = add(new Setting.Bool("players", "Show players", true));
            hostile = add(new Setting.Bool("hostile", "Show hostile mobs", true));
            passive = add(new Setting.Bool("passive", "Show animals", true));
            playerColor = add(new Setting.Color("player_color", "Player colour", 0xFFFFFFFF));
            hostileColor = add(new Setting.Color("hostile_color", "Hostile colour", HudStyle.DANGER));
            passiveColor = add(new Setting.Color("passive_color", "Animal colour", HudStyle.ACCENT));
            youColor = add(new Setting.Color("you_color", "Your arrow colour", HudStyle.WARN).adv());
            rotate = add(new Setting.Bool("rotate", "Turn with your view", true).adv().help("Off: north is always up."));
            rings = add(new Setting.Bool("rings", "Distance rings", true).adv());
            border = add(new Setting.Bool("border", "Border", true).adv());
            borderColor = add(new Setting.Color("border_color", "Border colour", 0xFF343A48).adv());
            borderColor.showIf(() -> border.v);
        }

        @Override public void finishSettings() { look = HudLook.attach(this, HudLook.BACKGROUND | HudLook.ROUNDED); }
        @Override public HudLook look() { return look; }
        @Override public float[] defaultPos() { return new float[]{0.99f, 0.45f}; }
        @Override public boolean wantsTick() { return true; }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null || mc.level == null) return;
            List<Dot> dots = collect(mc, range.v, players.v, hostile.v, passive.v);
            double far = 0;
            for (Dot d : dots) far = Math.max(far, Math.sqrt(d.dx() * d.dx() + d.dz() * d.dz()));
            targetRange = autoZoom.v ? (float) Math.max(8, Math.min(range.v, far * 1.2 + 2)) : range.v;
            snapshot = dots;
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            shownRange += (targetRange - shownRange) * 0.08f;
            int s = size.v, r = s / 2, cx = x + r, cy = y + r;
            boolean circle = shape.v == 1;
            int bg = look.hasBackground() ? look.bg() : 0;
            if (border.v) {
                if (circle) Draw.circle(g, cx, cy, r + 1, borderColor.v);
                else Draw.round(g, x - 1, y - 1, x + s + 1, y + s + 1, look.rounded() ? 5 : 0, borderColor.v);
            }
            if (circle) Draw.circle(g, cx, cy, r, bg == 0 ? 0x30000000 : bg);
            else Draw.round(g, x, y, x + s, y + s, look.rounded() ? 4 : 0, bg == 0 ? 0x30000000 : bg);
            if (rings.v) {
                int c = 0x28FFFFFF;
                g.fill(cx, y + 2, cx + 1, y + s - 2, c);
                g.fill(x + 2, cy, x + s - 2, cy + 1, c);
            }
            double yaw = rotate.v ? Math.toRadians(mc.player.getYRot()) : Math.PI;
            double cos = Math.cos(yaw), sin = Math.sin(yaw), scale = (r - 3) / Math.max(1f, shownRange);
            for (Dot d : snapshot) {
                double rx = d.dx() * cos + d.dz() * sin, rz = d.dz() * cos - d.dx() * sin;
                double px = -rx * scale, pz = -rz * scale;
                if (circle ? px * px + pz * pz > (r - 2) * (r - 2) : Math.abs(px) > r - 2 || Math.abs(pz) > r - 2) continue;
                int ix = cx + (int) Math.round(px), iy = cy + (int) Math.round(pz);
                int color = d.kind() == 0 ? playerColor.v : d.kind() == 1 ? hostileColor.v : passiveColor.v;
                g.fill(ix - 1, iy - 1, ix + 2, iy + 2, 0x80000000);
                g.fill(ix - 1, iy - 1, ix + 1, iy + 1, color);
            }
            Draw.arrow(g, cx, cy, rotate.v ? 180 : mc.player.getYRot(), 3, youColor.v, 0x90000000);
            return s + HudStyle.GAP;
        }
    }

    /** Minimap: the terrain around you, like Xaero's minimap, with entity dots. */
    public static final class Minimap extends Feature implements HudModule {
        final Setting.Slider size;
        final Setting.Choice zoom, shape, coords;
        final Setting.Bool players, hostile, passive, north, border, cave, entities;
        final Setting.Color borderColor, arrowColor;
        HudLook look;
        private final MapView view = new MapView();
        private volatile List<Dot> snapshot = List.of();
        private static final double[] BPP = {2, 1, 0.5, 0.34};

        Minimap() {
            super("minimap", "Minimap", Category.HUD, "A small map of the terrain around you, with players and mobs. Explored areas are remembered for the world map.");
            size = add(new Setting.Slider("size", "Map size", 64, 160, 8, 96, v -> v + " px"));
            zoom = add(new Setting.Choice("zoom", "Zoom", 1, "Far", "Normal", "Close", "Closest"));
            shape = add(new Setting.Choice("shape", "Shape", 0, "Square", "Circle"));
            coords = add(new Setting.Choice("coords", "Coordinates below", 1, "Off", "X Z", "X Y Z"));
            entities = add(new Setting.Bool("entities", "Show players & mobs", true));
            players = add(new Setting.Bool("players", "Players", true).adv());
            hostile = add(new Setting.Bool("hostile", "Hostile mobs", true).adv());
            passive = add(new Setting.Bool("passive", "Animals", false).adv());
            players.showIf(() -> entities.v);
            hostile.showIf(() -> entities.v);
            passive.showIf(() -> entities.v);
            north = add(new Setting.Bool("north", "North marker", true));
            arrowColor = add(new Setting.Color("arrow_color", "Your arrow colour", 0xFFFFFFFF));
            border = add(new Setting.Bool("border", "Border", true).adv());
            borderColor = add(new Setting.Color("border_color", "Border colour", 0xFF343A48).adv());
            borderColor.showIf(() -> border.v);
            cave = add(new Setting.Bool("cave", "Cave view in the Nether", true).adv().help("Shows the floor around you instead of the bedrock roof."));
        }

        @Override public void finishSettings() { look = HudLook.attach(this, HudLook.TEXT | HudLook.SHADOW | HudLook.ROUNDED); }
        @Override public HudLook look() { return look; }
        @Override public float[] defaultPos() { return new float[]{0.99f, 0.01f}; }
        @Override public boolean wantsTick() { return true; }

        @Override
        public void tick(Minecraft mc) {
            if (mc.player == null || mc.level == null) return;
            snapshot = entities.v ? collect(mc, (int) (size.v * BPP[zoom.v] / 2), players.v, hostile.v, passive.v) : List.of();
        }

        public boolean caveInNether() {
            return cave.v;
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            int s = size.v, r = s / 2;
            boolean circle = shape.v == 1;
            double bpp = BPP[zoom.v];
            double px = mc.player.getX(), pz = mc.player.getZ();
            int cellPx = bpp < 1 ? (int) Math.round(1 / bpp) : 1;
            double bpc = bpp < 1 ? 1 : bpp;
            // align the grid to whole blocks so it doesn't shimmer while you walk
            double left = Math.floor(px - r * bpp), top = Math.floor(pz - r * bpp);
            view.build(left, top, s, s, cellPx, bpc, circle);
            if (border.v) {
                if (circle) Draw.circle(g, x + r, y + r, r + 1, borderColor.v);
                else Draw.round(g, x - 1, y - 1, x + s + 1, y + s + 1, look.rounded() ? 3 : 0, borderColor.v);
            }
            if (circle) Draw.circle(g, x + r, y + r, r, 0xFF101216);
            else g.fill(x, y, x + s, y + s, 0xFF101216);
            view.draw(g, x, y);
            int cx = x + r, cy = y + r;
            for (Dot d : snapshot) {
                int ix = cx + (int) Math.round(d.dx() / bpp), iy = cy + (int) Math.round(d.dz() / bpp);
                if (circle ? (ix - cx) * (ix - cx) + (iy - cy) * (iy - cy) > (r - 2) * (r - 2) : Math.abs(ix - cx) > r - 2 || Math.abs(iy - cy) > r - 2) continue;
                int color = d.kind() == 0 ? 0xFFFFFFFF : d.kind() == 1 ? HudStyle.DANGER : 0xFFE8B931;
                g.fill(ix - 1, iy - 1, ix + 2, iy + 2, 0xA0000000);
                g.fill(ix - 1, iy - 1, ix + 1, iy + 1, color);
            }
            Draw.arrow(g, cx, cy, mc.player.getYRot(), 4, arrowColor.v, 0xC0000000);
            if (north.v) {
                int ny = circle ? y + 1 : y + 2;
                Draw.round(g, cx - 4, ny - 1, cx + 5, ny + 9, 2, 0xA0101216);
                g.text("N", cx - 2, ny, 0xFFFFFFFF, false);
            }
            int h = s;
            if (coords.v != 0) {
                String t = coords.v == 1 ? mc.player.getBlockX() + ", " + mc.player.getBlockZ()
                        : mc.player.getBlockX() + ", " + mc.player.getBlockY() + ", " + mc.player.getBlockZ();
                g.text(t, x + (s - mc.font.width(t)) / 2, y + s + 3, look.textColor(), look.shadow());
                h += 12;
            }
            return h + HudStyle.GAP;
        }
    }
}
