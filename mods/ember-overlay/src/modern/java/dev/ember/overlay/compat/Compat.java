package dev.ember.overlay.compat;

import com.mojang.blaze3d.platform.InputConstants;
import dev.ember.overlay.api.Gfx;
import dev.ember.overlay.api.Util;
import dev.ember.overlay.api.VanillaElement;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.gui.components.AbstractWidget;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/**
 * EVERY Minecraft/Fabric call that changes between versions lives here (26.x edition;
 * the 1.21.x editions live in src/legacy-*). All editions expose the same static API.
 *
 * Verified against Minecraft 26.3 (javap of the real client jar, see .github/introspect)
 * and Fabric API 0.165.2+26.3 sources. Notable 26.x changes handled here:
 *  - GuiGraphics → GuiGraphicsExtractor, render(...) → extractRenderState(...)
 *  - Screens live on mc.gui (screen()/setScreen()), chat & hidden-HUD on mc.gui.hud
 *  - GLFW was replaced by SDL3: key codes come from InputConstants, mouse state from MouseHandler
 *  - KeyBindingHelper → KeyMappingHelper; STATUS_EFFECTS HUD layer → MOB_EFFECTS
 */
public final class Compat {
    private Compat() {}

    public static final String MOD_ID = Util.MOD_ID;
    /** Vanilla HUD pieces can be hidden/replaced (Fabric's HUD element registry). */
    public static final boolean CAN_CHANGE_VANILLA_HUD = true;
    public static final int UNBOUND = -1;
    public static final int KEY_RSHIFT = InputConstants.KEY_RSHIFT;
    public static final int KEY_C = InputConstants.KEY_C;
    public static final int KEY_LALT = InputConstants.KEY_LALT;

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(MOD_ID, path);
    }

    private static KeyMapping.Category category;

    public static KeyMapping key(String name, int key) {
        if (category == null) category = KeyMapping.Category.register(id("main"));
        return KeyMappingHelper.registerKeyMapping(
                new KeyMapping("key." + MOD_ID + "." + name, Era.KEY_TYPE, key, category));
    }

    private static final GfxImpl HUD_GFX = new GfxImpl();

    /** Draw after chat so we sit above the vanilla HUD but below screens. */
    public static void addHud(Consumer<Gfx> draw) {
        HudElementRegistry.attachElementAfter(VanillaHudElements.CHAT, id("hud"), (g, delta) -> draw.accept(HUD_GFX.wrap(g)));
    }

    public static void overrideVanilla(VanillaElement which, BooleanSupplier hide, Consumer<Gfx> drawInstead) {
        Identifier target = switch (which) {
            case CROSSHAIR -> VanillaHudElements.CROSSHAIR;
            case SCOREBOARD -> VanillaHudElements.SCOREBOARD;
            case BOSS_BAR -> VanillaHudElements.BOSS_BAR;
            case STATUS_EFFECTS -> VanillaHudElements.MOB_EFFECTS;
            case TITLE -> VanillaHudElements.TITLE_AND_SUBTITLE;
        };
        HudElementRegistry.replaceElement(target, orig -> (g, d) -> {
            if (!hide.getAsBoolean()) orig.extractRenderState(g, d);
            else if (drawInstead != null) drawInstead.accept(HUD_GFX.wrap(g));
        });
    }

    /** Draw on top of a screen after it renders. */
    public static void afterScreenDraw(Screen screen, Consumer<Gfx> draw) {
        GfxImpl gfx = new GfxImpl();
        ScreenEvents.afterExtract(screen).register((s, g, mx, my, delta) -> draw.accept(gfx.wrap(g)));
    }

    public static void addWidget(Screen screen, AbstractWidget widget) {
        Screens.getWidgets(screen).add(widget);
    }

    /** Zoom is applied by CameraMixin on this version. */
    public static void tickZoom(Minecraft mc) {}

    // ---------------------------------------------------------------- screens, chat, HUD state

    public static Screen screen(Minecraft mc) {
        return Era.screen(mc);
    }

    public static void setScreen(Minecraft mc, Screen screen) {
        Era.setScreen(mc, screen);
    }

    public static ChatComponent chat(Minecraft mc) {
        return Era.chat(mc);
    }

    public static void say(Minecraft mc, String text) {
        chat(mc).addClientSystemMessage(Component.literal(text));
    }

    /** F1 pressed, or the debug screen is open: don't draw over it. */
    public static boolean hudHidden(Minecraft mc) {
        return Era.hudHidden(mc) || mc.getDebugOverlay().showDebugScreen();
    }

    public static boolean mouseDown(Minecraft mc, boolean left) {
        return left ? mc.mouseHandler.isLeftPressed() : mc.mouseHandler.isRightPressed();
    }

    // ---------------------------------------------------------------- world info

    public static String biomeName(Minecraft mc, BlockPos pos) {
        if (mc.level == null) return "";
        return mc.level.getBiome(pos).unwrapKey()
                .map(k -> prettify(k.identifier().getPath()))
                .orElse("Unknown");
    }

    public static long dayTime(Minecraft mc) {
        return mc.level == null ? 0 : mc.level.getOverworldClockTime();
    }

    public static int lightAt(Minecraft mc, BlockPos pos) {
        return mc.level == null ? 0 : mc.level.getMaxLocalRawBrightness(pos);
    }

    public static String dimension(Minecraft mc) {
        return mc.level == null ? "" : prettify(mc.level.dimension().identifier().getPath());
    }

    // ---------------------------------------------------------------- actions

    /** Leave the current world/server, then join another one. */
    public static void switchServer(Minecraft mc, ServerData target) {
        if (mc.level != null) mc.disconnectWithProgressScreen();
        ConnectScreen.startConnecting(new TitleScreen(), mc, ServerAddress.parseString(target.ip), target, false, null);
    }

    private static String prettify(String s) {
        return Util.prettify(s);
    }
}
