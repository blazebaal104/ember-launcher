package dev.ember.overlay.features;

import dev.ember.overlay.api.Draw;
import dev.ember.overlay.api.Gfx;
import dev.ember.overlay.api.VanillaElement;
import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.Setting;
import dev.ember.overlay.hud.HudLook;
import dev.ember.overlay.hud.HudModule;
import dev.ember.overlay.hud.HudStyle;
import dev.ember.overlay.mixin.OptionInstanceAccessor;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;

import java.util.concurrent.ThreadLocalRandom;

import static dev.ember.overlay.core.FeatureRegistry.register;

/** Visual tweaks. Mixins read the static flags below; a disabled feature is one boolean check. */
public final class VisualFeatures {
    private VisualFeatures() {}

    // Flags read by mixins (see dev.ember.overlay.mixin).
    public static volatile boolean zoomHeld;
    public static volatile boolean minimalBob;
    public static volatile boolean hideHand;
    public static volatile float particleKeepRatio = 1f;

    private static float zoomFactor = 1f;
    public static Zoom zoom;
    public static Crosshair crosshair;

    public static void registerAll() {
        register(new Fullbright().icon(Items.GLOWSTONE));
        zoom = register(new Zoom().icon(Items.SPYGLASS));
        crosshair = register(new Crosshair().icon(Items.TARGET));
        register(new Simple("minimal_bob", "Minimal view bobbing", "Keeps the camera steady while you walk. Your hand still bobs, so movement doesn't feel stiff.") {
            @Override protected void onEnable() { minimalBob = true; }
            @Override protected void onDisable() { minimalBob = false; }
        }.icon(Items.SADDLE));
        register(new Particles().icon(Items.BLAZE_POWDER));
        register(new Simple("hide_hand", "Hide hand", "Removes your hand and held item from view. Great for screenshots and building.") {
            @Override protected void onEnable() { hideHand = true; }
            @Override protected void onDisable() { hideHand = false; }
        }.icon(Items.ITEM_FRAME));
        register(new Simple("cinematic_key", "Cinematic camera key", "Lets you turn the smooth cinematic camera on and off with a key. Set the key in Controls.").icon(Items.PHANTOM_MEMBRANE));
        Feature scoreboard = register(new HudHide("hide_scoreboard", "Hide scoreboard", "Hides the sidebar scoreboard on servers.").icon(Items.OAK_SIGN));
        Feature bossbar = register(new HudHide("hide_bossbar", "Hide boss bars", "Hides boss and event bars at the top of the screen.").icon(Items.DRAGON_HEAD));
        Feature effects = register(new HudHide("hide_vanilla_effects", "Hide vanilla effect icons", "Hides Minecraft's effect icons in the top right. Use it together with Potion status.").icon(Items.BREWING_STAND));
        Feature titles = register(new HudHide("hide_titles", "Hide title messages", "Hides the big title text some servers flash on your screen.").icon(Items.NAME_TAG));
        register(new LowHealth().icon(Items.GLISTERING_MELON_SLICE));
        register(new DurabilityWarning().icon(Items.ANVIL));
        register(new Planned("clear_water", "Clear water", Category.VISUAL, "Removes underwater fog so you can see further. Coming in a later update.").icon(Items.WATER_BUCKET));
        register(new Planned("item_physics", "Item physics", Category.VISUAL, "Dropped items lie flat and tumble instead of spinning. Coming in a later update.").icon(Items.DIAMOND));
        register(new Planned("block_outline", "Block outline", Category.VISUAL, "Thicker, coloured outline on the block you're looking at. Coming in a later update.").icon(Items.GLASS));
        register(new Planned("low_fire", "Low fire", Category.VISUAL, "Lowers the burning effect so it doesn't cover your view. Coming in a later update.").icon(Items.FLINT_AND_STEEL));

        // Hide/replace vanilla HUD pieces without mixins.
        Compat.overrideVanilla(VanillaElement.SCOREBOARD, scoreboard::isEnabled, null);
        Compat.overrideVanilla(VanillaElement.BOSS_BAR, bossbar::isEnabled, null);
        Compat.overrideVanilla(VanillaElement.STATUS_EFFECTS, effects::isEnabled, null);
        Compat.overrideVanilla(VanillaElement.TITLE, titles::isEnabled, null);
        Compat.overrideVanilla(VanillaElement.CROSSHAIR,
                () -> crosshair.isEnabled() && Minecraft.getInstance().options.getCameraType().isFirstPerson(),
                g -> {
                    Minecraft mc = Minecraft.getInstance();
                    crosshair.draw(g, mc, mc.getWindow().getGuiScaledWidth() / 2, mc.getWindow().getGuiScaledHeight() / 2, true);
                });
    }

    /** Called from the camera FOV hook every frame; cheap when not zooming. */
    public static float applyZoom(float fov) {
        return fov * stepZoom();
    }

    /** Advance the zoom one step and return the FOV multiplier (1 = not zoomed). */
    public static float stepZoom() {
        float target = zoom.isEnabled() && zoomHeld ? 1f / zoom.amount.v : 1f;
        if (target == 1f && zoomFactor == 1f) return 1f;
        if (!zoom.smooth.v) zoomFactor = target;
        else {
            zoomFactor += (target - zoomFactor) * 0.35f;
            if (Math.abs(zoomFactor - target) < 0.005f) zoomFactor = target;
        }
        zoom.cinematic(Minecraft.getInstance(), zoomFactor < 0.99f);
        return zoomFactor;
    }

    public static boolean isZooming() {
        return zoomFactor < 0.99f;
    }

    /** Mouse speed multiplier while zoomed (1 = unchanged). */
    public static double zoomSensitivity() {
        return zoom.slowMouse.v ? Math.max(0.15, Math.sqrt(zoomFactor)) : 1;
    }

    public static boolean dropParticle() {
        float keep = particleKeepRatio;
        return keep < 1f && ThreadLocalRandom.current().nextFloat() > keep;
    }

    // ------------------------------------------------------------------ feature classes

    static class Simple extends Feature {
        Simple(String id, String name, String description) {
            super(id, name, Category.VISUAL, description);
        }
    }

    /** Hides a vanilla HUD piece; only on versions whose HUD can be changed without mixins. */
    static final class HudHide extends Simple {
        HudHide(String id, String name, String description) {
            super(id, name, description);
        }

        @Override
        public boolean isAvailable() {
            return Compat.CAN_CHANGE_VANILLA_HUD;
        }

        @Override
        public String unavailableReason() {
            return "Needs 1.21.6+";
        }
    }

    public static final class Zoom extends Simple {
        public final Setting.Slider amount;
        public final Setting.Bool smooth, slowMouse, cinematicWhileZoomed;
        private boolean cinematicSet;

        Zoom() {
            super("zoom", "Zoom", "Hold the zoom key (C) to look far away, like a spyglass.");
            amount = add(new Setting.Slider("amount", "Zoom amount", 2, 10, 1, 4, v -> v + "x"));
            smooth = add(new Setting.Bool("smooth", "Smooth zoom", true).help("Glides in and out instead of snapping."));
            slowMouse = add(new Setting.Bool("slow_mouse", "Slower mouse while zoomed", true).adv().help("Makes aiming easier when zoomed in far."));
            cinematicWhileZoomed = add(new Setting.Bool("cinematic", "Cinematic camera while zoomed", false).adv());
        }

        void cinematic(Minecraft mc, boolean zooming) {
            boolean want = zooming && cinematicWhileZoomed.v;
            if (want && !cinematicSet && !mc.options.smoothCamera) {
                mc.options.smoothCamera = true;
                cinematicSet = true;
            } else if (!want && cinematicSet) {
                mc.options.smoothCamera = false;
                cinematicSet = false;
            }
        }
    }

    public static final class Crosshair extends Simple {
        public final Setting.Choice style;
        public final Setting.Color color, targetColor;
        public final Setting.Slider length, gap, thickness;
        public final Setting.Bool outline, dot, onTarget, expand;

        Crosshair() {
            super("crosshair", "Custom crosshair", "Replace Minecraft's crosshair with your own: pick the shape, colour and size.");
            style = add(new Setting.Choice("style", "Style", 0, "Plus", "Dot", "Circle", "X", "T"));
            color = add(new Setting.Color("color", "Colour", HudStyle.ACCENT));
            length = add(new Setting.Slider("length", "Length", 1, 10, 1, 4, v -> v + " px"));
            gap = add(new Setting.Slider("gap", "Gap", 0, 6, 1, 2, v -> v + " px"));
            thickness = add(new Setting.Slider("thickness", "Thickness", 1, 3, 1, 1, v -> v + " px"));
            dot = add(new Setting.Bool("dot", "Centre dot", true));
            outline = add(new Setting.Bool("outline", "Dark outline", false).help("Keeps it visible on bright blocks and snow."));
            onTarget = add(new Setting.Bool("on_target", "Change colour when aiming at a mob", false).adv());
            targetColor = add(new Setting.Color("target_color", "Colour on mobs", HudStyle.DANGER).adv());
            targetColor.showIf(() -> onTarget.v);
            expand = add(new Setting.Bool("expand", "Spread while moving", false).adv().help("The gap widens while you walk, like in shooters."));
        }

        @Override
        public boolean isAvailable() {
            return Compat.CAN_CHANGE_VANILLA_HUD;
        }

        @Override
        public String unavailableReason() {
            return "Needs 1.21.6+";
        }

        private static void rect(Gfx g, int x1, int y1, int x2, int y2, int c, boolean outline) {
            if (outline) g.fill(x1 - 1, y1 - 1, x2 + 1, y2 + 1, 0xC0000000);
            g.fill(x1, y1, x2, y2, c);
        }

        /** Draw centred on (cx, cy). {@code live} uses the game state (target colour, movement). */
        public void draw(Gfx g, Minecraft mc, int cx, int cy, boolean live) {
            int c = color.v;
            int gp = gap.v, len = length.v, t = thickness.v, h = t / 2;
            if (live && mc.player != null) {
                if (onTarget.v) {
                    HitResult hit = mc.hitResult;
                    if (hit instanceof EntityHitResult eh && hit.getType() == HitResult.Type.ENTITY && eh.getEntity() instanceof LivingEntity) c = targetColor.v;
                }
                if (expand.v) {
                    var v = mc.player.getDeltaMovement();
                    if (v.x * v.x + v.z * v.z > 0.003) gp += 2;
                }
            }
            boolean o = outline.v;
            switch (style.v) {
                case 1 -> rect(g, cx - h - 1, cy - h - 1, cx - h + t + 1, cy - h + t + 1, c, o);
                case 2 -> {
                    int r = gp + len;
                    for (int a = 0; a < 360; a += 10) {
                        double rad = Math.toRadians(a);
                        int px = cx + (int) Math.round(Math.cos(rad) * r), py = cy + (int) Math.round(Math.sin(rad) * r);
                        rect(g, px, py, px + t, py + t, c, o);
                    }
                }
                case 3 -> {
                    for (int i = gp; i < gp + len + 1; i++) {
                        rect(g, cx + i, cy + i, cx + i + t, cy + i + t, c, o);
                        rect(g, cx - i, cy + i, cx - i + t, cy + i + t, c, o);
                        rect(g, cx + i, cy - i, cx + i + t, cy - i + t, c, o);
                        rect(g, cx - i, cy - i, cx - i + t, cy - i + t, c, o);
                    }
                }
                default -> {
                    rect(g, cx - gp - len, cy - h, cx - gp, cy - h + t, c, o);
                    rect(g, cx + gp + 1, cy - h, cx + gp + 1 + len, cy - h + t, c, o);
                    rect(g, cx - h, cy + gp + 1, cx - h + t, cy + gp + 1 + len, c, o);
                    if (style.v != 4) rect(g, cx - h, cy - gp - len, cx - h + t, cy - gp, c, o);
                }
            }
            if (dot.v && style.v != 1) rect(g, cx - h, cy - h, cx - h + t, cy - h + t, c, o);
        }
    }

    static final class Particles extends Simple {
        final Setting.Slider keep;

        Particles() {
            super("particles", "Particle limiter", "Shows fewer particles. Helps a lot with FPS in big fights, farms and explosions.");
            keep = add(new Setting.Slider("keep", "Particles kept", 0, 90, 10, 40, v -> v + "%").onChange(() -> {
                if (isEnabled()) particleKeepRatio = this.keepRatio();
            }));
        }

        float keepRatio() {
            return keep.v / 100f;
        }

        @Override protected void onEnable() { particleKeepRatio = keepRatio(); }
        @Override protected void onDisable() { particleKeepRatio = 1f; }
    }

    /** Pushes gamma past the slider limit. Restores your value when turned off. */
    static final class Fullbright extends Feature {
        private Double previous;
        final Setting.Slider strength;

        Fullbright() {
            super("fullbright", "Fullbright", Category.VISUAL, "See in caves and at night without torches.");
            strength = add(new Setting.Slider("strength", "Brightness", 2, 16, 1, 16, v -> v * 100 + "%"));
        }

        @SuppressWarnings("unchecked")
        private static void setGamma(Minecraft mc, double v) {
            ((OptionInstanceAccessor) (Object) mc.options.gamma()).ember$setValue(v);
        }

        @Override
        protected void onEnable() {
            Minecraft mc = Minecraft.getInstance();
            previous = mc.options.gamma().get();
            setGamma(mc, strength.v);
        }

        @Override
        protected void onDisable() {
            setGamma(Minecraft.getInstance(), previous == null ? 0.5 : previous);
        }

        @Override
        public boolean wantsTick() {
            return true;
        }

        /** The video settings screen can reset gamma; re-assert it (one comparison per tick). */
        @Override
        public void tick(Minecraft mc) {
            if (mc.options.gamma().get() != strength.v) setGamma(mc, strength.v);
        }
    }

    static final class LowHealth extends Feature implements HudModule {
        final Setting.Slider threshold, thickness;
        final Setting.Color color;
        final Setting.Bool pulse;

        LowHealth() {
            super("low_health", "Low health warning", Category.VISUAL, "The edges of your screen glow red when your health is low.");
            threshold = add(new Setting.Slider("threshold", "Warn below", 10, 60, 5, 30, v -> v + "% health"));
            color = add(new Setting.Color("color", "Colour", HudStyle.DANGER));
            pulse = add(new Setting.Bool("pulse", "Pulse", true).adv());
            thickness = add(new Setting.Slider("thickness", "Glow size", 2, 16, 1, 6, v -> v + " px").adv());
        }

        @Override
        public boolean positionable() {
            return false;
        }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            float hp = mc.player.getHealth() / mc.player.getMaxHealth();
            if (hp * 100 >= threshold.v || mc.player.isCreative() || mc.player.isSpectator()) return 0;
            float a = pulse.v ? (float) (0.45 + 0.35 * Math.sin(System.currentTimeMillis() / 180.0)) : 0.6f;
            int w = mc.getWindow().getGuiScaledWidth(), h = mc.getWindow().getGuiScaledHeight(), t = thickness.v;
            for (int i = 0; i < t; i++) {
                int c = Draw.alpha(color.v, a * (1f - i / (float) t));
                g.fill(i, i, w - i, i + 1, c);
                g.fill(i, h - i - 1, w - i, h - i, c);
                g.fill(i, i + 1, i + 1, h - i - 1, c);
                g.fill(w - i - 1, i + 1, w - i, h - i - 1, c);
            }
            return 0;
        }
    }

    static final class DurabilityWarning extends Feature implements HudModule {
        private static final EquipmentSlot[] SLOTS = {EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND, EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
        final Setting.Slider threshold;
        HudLook look;

        DurabilityWarning() {
            super("durability_warning", "Durability warning", Category.VISUAL, "Warns you when a tool or armor piece is about to break.");
            threshold = add(new Setting.Slider("threshold", "Warn below", 1, 25, 1, 5, v -> v + "%"));
        }

        @Override public void finishSettings() { look = HudLook.attach(this, HudStyle.WARN); }
        @Override public HudLook look() { return look; }
        @Override public float[] defaultPos() { return new float[]{0.5f, 0.12f}; }

        @Override
        public int render(Gfx g, Minecraft mc, int x, int y) {
            for (EquipmentSlot slot : SLOTS) {
                ItemStack s = mc.player.getItemBySlot(slot);
                if (!s.isDamageableItem() || (s.getMaxDamage() - s.getDamageValue()) * 100 > s.getMaxDamage() * threshold.v) continue;
                return HudStyle.label(g, mc, look.wrap("⚠ " + s.getHoverName().getString() + " is about to break"), x, y, look);
            }
            return 0;
        }
    }
}
