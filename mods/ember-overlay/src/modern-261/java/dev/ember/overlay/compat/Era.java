package dev.ember.overlay.compat;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.client.gui.screens.Screen;

/** Minecraft 26.1: screens on Minecraft itself, keyboard keys are KEYSYM. */
final class Era {
    private Era() {}

    static final InputConstants.Type KEY_TYPE = InputConstants.Type.KEYSYM;

    static Screen screen(Minecraft mc) {
        return mc.screen;
    }

    static void setScreen(Minecraft mc, Screen screen) {
        mc.setScreen(screen);
    }

    static ChatComponent chat(Minecraft mc) {
        return mc.gui.getChat();
    }

    static boolean hudHidden(Minecraft mc) {
        return mc.options.hideGui;
    }
}
