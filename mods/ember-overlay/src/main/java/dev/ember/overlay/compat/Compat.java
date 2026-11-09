package dev.ember.overlay.compat;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;

/**
 * EVERY Minecraft/Fabric API call that has changed between 1.21.x releases lives here.
 * Porting the overlay to another version should mean editing this file (and checking
 * mixin targets), nothing else.
 *
 * Written for 1.21.11 with official Mojang names. Known churn points:
 *  - 1.21.6: HudElementRegistry replaced HudRenderCallback; GUI colours need alpha.
 *  - 1.21.9: KeyMapping categories became KeyMapping.Category objects; Window handle accessor renamed.
 *  - 1.21.11: ResourceLocation was renamed Identifier in Mojang's names.
 *  - 26.1: Java 25, unobfuscated jars (no mappings in Loom).
 */
public final class Compat {
    private Compat() {}

    public static final String MOD_ID = "ember-overlay";

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(MOD_ID, path);
    }

    private static KeyMapping.Category category;

    public static KeyMapping key(String name, int glfwKey) {
        if (category == null) category = KeyMapping.Category.register(id("main"));
        return KeyBindingHelper.registerKeyBinding(
                new KeyMapping("key." + MOD_ID + "." + name, InputConstants.Type.KEYSYM, glfwKey, category));
    }

    /** Draw after the chat layer so we sit above vanilla HUD but below screens. */
    public static void addHudLayer(String path, HudElement element) {
        HudElementRegistry.attachElementAfter(VanillaHudElements.CHAT, id(path), element);
    }

    /** Wrap a vanilla HUD element so a feature can hide or replace it. */
    public static void wrapVanilla(VanillaElement which, java.util.function.Function<HudElement, HudElement> wrapper) {
        Identifier target = switch (which) {
            case CROSSHAIR -> VanillaHudElements.CROSSHAIR;
            case SCOREBOARD -> VanillaHudElements.SCOREBOARD;
            case BOSS_BAR -> VanillaHudElements.BOSS_BAR;
            case STATUS_EFFECTS -> VanillaHudElements.STATUS_EFFECTS;
            case TITLE -> VanillaHudElements.TITLE_AND_SUBTITLE;
        };
        HudElementRegistry.replaceElement(target, wrapper);
    }

    public enum VanillaElement { CROSSHAIR, SCOREBOARD, BOSS_BAR, STATUS_EFFECTS, TITLE }

    public static boolean mouseDown(Minecraft mc, int button) {
        return GLFW.glfwGetMouseButton(mc.getWindow().handle(), button) == GLFW.GLFW_PRESS;
    }

    public static String biomeName(Minecraft mc, BlockPos pos) {
        if (mc.level == null) return "";
        return mc.level.getBiome(pos).unwrapKey()
                .map(k -> prettify(k.identifier().getPath()))
                .orElse("Unknown");
    }

    /** Leave the current world/server, then join another one. */
    public static void switchServer(Minecraft mc, ServerData target) {
        if (mc.level != null) mc.disconnectWithProgressScreen();
        Screen parent = new TitleScreen();
        ConnectScreen.startConnecting(parent, mc, ServerAddress.parseString(target.ip), target, false, null);
    }

    public static String prettify(String path) {
        StringBuilder sb = new StringBuilder();
        for (String part : path.split("_")) {
            if (part.isEmpty()) continue;
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return sb.toString();
    }
}
