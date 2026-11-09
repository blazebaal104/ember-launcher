package dev.ember.overlay.features;

import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.compat.Compat.VanillaElement;
import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.hud.HudModule;
import dev.ember.overlay.hud.HudStyle;
import dev.ember.overlay.mixin.OptionInstanceAccessor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

import java.util.concurrent.ThreadLocalRandom;

import static dev.ember.overlay.core.FeatureRegistry.register;

/**
 * Visual tweaks: 17 entries (13 implemented, 4 planned).
 * Mixins read the static flags below; a disabled feature is one boolean check.
 */
public final class VisualFeatures {
    private VisualFeatures() {}

    // Flags read by mixins (see dev.ember.overlay.mixin).
    public static volatile boolean zoomHeld;
    public static volatile boolean minimalBob;
    public static volatile boolean hideHand;
    public static volatile float particleKeepRatio = 1f;

    private static float zoomFactor = 1f;
    public static Feature zoom, crosshair;

    public static void registerAll() {
        register(new Fullbright());
        zoom = register(new Simple("zoom", "Zoom", "Hold C to zoom in 4x. Mouse moves slower while zoomed.", true));
        crosshair = register(new Simple("crosshair", "Custom crosshair", "A thin plus with a centre dot, in Ember copper.", false));
        register(new Simple("minimal_bob", "Minimal view bobbing", "Keeps the camera steady while walking; your hand still bobs.", false) {
            @Override protected void onEnable() { minimalBob = true; }
            @Override protected void onDisable() { minimalBob = false; }
        });
        register(new Simple("particles", "Particle limiter", "Drops 60% of new particles. Helps a lot in big fights and farms.", false) {
            @Override protected void onEnable() { particleKeepRatio = 0.4f; }
            @Override protected void onDisable() { particleKeepRatio = 1f; }
        });
        register(new Simple("hide_hand", "Hide hand", "Removes your hand and held item from view (great for screenshots).", false) {
            @Override protected void onEnable() { hideHand = true; }
            @Override protected void onDisable() { hideHand = false; }
        });
        register(new Simple("cinematic_key", "Cinematic camera key", "Bind a key to toggle the smooth cinematic camera.", true));
        Feature scoreboard = register(new Simple("hide_scoreboard", "Hide scoreboard", "Hides the sidebar scoreboard on servers.", false));
        Feature bossbar = register(new Simple("hide_bossbar", "Hide boss bars", "Hides boss and event bars at the top.", false));
        Feature effects = register(new Simple("hide_vanilla_effects", "Hide vanilla effect icons", "Use with Potion status to avoid duplicates.", false));
        Feature titles = register(new Simple("hide_titles", "Hide title messages", "Hides big title/subtitle text servers flash on screen.", false));
        register(new LowHealth());
        register(new DurabilityWarning());
        register(new Planned("clear_water", "Clear water", Category.VISUAL, "Removes underwater fog. Planned: the fog system was rewritten in 1.21.6."));
        register(new Planned("item_physics", "Item physics", Category.VISUAL, "Dropped items lie flat and tumble. Planned."));
        register(new Planned("block_outline", "Block outline colour", Category.VISUAL, "Thicker, coloured block selection outline. Planned."));
        register(new Planned("low_fire", "Low fire", Category.VISUAL, "Lowers the burning overlay so you can see. Planned."));

        // Hide/replace vanilla HUD pieces without mixins.
        Compat.wrapVanilla(VanillaElement.SCOREBOARD, orig -> (g, d) -> { if (!scoreboard.isEnabled()) orig.extractRenderState(g, d); });
        Compat.wrapVanilla(VanillaElement.BOSS_BAR, orig -> (g, d) -> { if (!bossbar.isEnabled()) orig.extractRenderState(g, d); });
        Compat.wrapVanilla(VanillaElement.STATUS_EFFECTS, orig -> (g, d) -> { if (!effects.isEnabled()) orig.extractRenderState(g, d); });
        Compat.wrapVanilla(VanillaElement.TITLE, orig -> (g, d) -> { if (!titles.isEnabled()) orig.extractRenderState(g, d); });
        Compat.wrapVanilla(VanillaElement.CROSSHAIR, orig -> (g, d) -> {
            Minecraft mc = Minecraft.getInstance();
            if (!crosshair.isEnabled() || !mc.options.getCameraType().isFirstPerson()) orig.extractRenderState(g, d);
            else drawCrosshair(g, mc);
        });
    }

    /** Called from GameRendererMixin#getFov every frame; cheap when not zooming. */
    public static float applyZoom(float fov) {
        float target = zoom.isEnabled() && zoomHeld ? 0.25f : 1f;
        if (target == 1f && zoomFactor == 1f) return fov;
        zoomFactor += (target - zoomFactor) * 0.35f;
        if (Math.abs(zoomFactor - target) < 0.005f) zoomFactor = target;
        return fov * zoomFactor;
    }

    public static boolean isZooming() {
        return zoomFactor < 0.99f;
    }

    private static void drawCrosshair(GuiGraphicsExtractor g, Minecraft mc) {
        int cx = mc.getWindow().getGuiScaledWidth() / 2, cy = mc.getWindow().getGuiScaledHeight() / 2;
        int c = HudStyle.ACCENT;
        g.fill(cx - 5, cy, cx - 2, cy + 1, c);
        g.fill(cx + 2, cy, cx + 5, cy + 1, c);
        g.fill(cx, cy - 5, cx + 1, cy - 2, c);
        g.fill(cx, cy + 2, cx + 1, cy + 5, c);
        g.fill(cx, cy, cx + 1, cy + 1, 0xFFFFFFFF);
    }

    public static boolean dropParticle() {
        float keep = particleKeepRatio;
        return keep < 1f && ThreadLocalRandom.current().nextFloat() > keep;
    }

    // ------------------------------------------------------------------ feature classes

    static class Simple extends Feature {
        Simple(String id, String name, String description, boolean def) {
            super(id, name, Category.VISUAL, description, def);
        }
    }

    /** Pushes gamma past the slider limit. Restores your value when turned off. */
    static final class Fullbright extends Feature {
        private Double previous;

        Fullbright() {
            super("fullbright", "Fullbright", Category.VISUAL, "See in caves and at night without torches.", false);
        }

        @SuppressWarnings("unchecked")
        private static void setGamma(Minecraft mc, double v) {
            ((OptionInstanceAccessor) (Object) mc.options.gamma()).ember$setValue(v);
        }

        @Override
        protected void onEnable() {
            Minecraft mc = Minecraft.getInstance();
            previous = mc.options.gamma().get();
            setGamma(mc, 16.0);
        }

        @Override
        protected void onDisable() {
            Minecraft mc = Minecraft.getInstance();
            setGamma(mc, previous == null ? 0.5 : previous);
        }

        @Override
        public boolean wantsTick() {
            return true;
        }

        /** The video settings screen can reset gamma; re-assert it (one comparison per tick). */
        @Override
        public void tick(Minecraft mc) {
            if (mc.options.gamma().get() < 16.0) setGamma(mc, 16.0);
        }
    }

    static final class LowHealth extends Feature implements HudModule {
        LowHealth() {
            super("low_health", "Low health warning", Category.VISUAL, "Red pulse at the screen edges below 30% health.", true);
        }

        @Override
        public boolean stacked() {
            return false;
        }

        @Override
        public int render(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
            float hp = mc.player.getHealth() / mc.player.getMaxHealth();
            if (hp >= 0.3f || mc.player.isCreative() || mc.player.isSpectator()) return 0;
            int a = (int) (40 + 40 * Math.sin(System.currentTimeMillis() / 180.0));
            int c = (a << 24) | 0xE5484D;
            int w = mc.getWindow().getGuiScaledWidth(), h = mc.getWindow().getGuiScaledHeight();
            g.fill(0, 0, w, 4, c);
            g.fill(0, h - 4, w, h, c);
            g.fill(0, 0, 4, h, c);
            g.fill(w - 4, 0, w, h, c);
            return 0;
        }
    }

    static final class DurabilityWarning extends Feature implements HudModule {
        private static final EquipmentSlot[] SLOTS = {EquipmentSlot.MAINHAND, EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};

        DurabilityWarning() {
            super("durability_warning", "Durability warning", Category.VISUAL, "Warns when a tool or armour piece is about to break.", true);
        }

        @Override
        public boolean stacked() {
            return false;
        }

        @Override
        public int render(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
            for (EquipmentSlot slot : SLOTS) {
                ItemStack s = mc.player.getItemBySlot(slot);
                if (!s.isDamageableItem() || (s.getMaxDamage() - s.getDamageValue()) * 20 > s.getMaxDamage()) continue;
                String text = s.getHoverName().getString() + " is about to break";
                int w = mc.getWindow().getGuiScaledWidth();
                g.text(mc.font, text, (w - mc.font.width(text)) / 2, 24, HudStyle.WARN, true);
                return 0;
            }
            return 0;
        }
    }
}
