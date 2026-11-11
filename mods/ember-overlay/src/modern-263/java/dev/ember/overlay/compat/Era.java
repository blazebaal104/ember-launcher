package dev.ember.overlay.compat;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.client.gui.screens.Screen;

/** Minecraft 26.3: SDL3 input: keyboard keys are KEYBOARD. */
final class Era {
    private Era() {}

    static final InputConstants.Type KEY_TYPE = InputConstants.Type.KEYBOARD;

    static Screen screen(Minecraft mc) {
        return mc.gui.screen();
    }

    static void setScreen(Minecraft mc, Screen screen) {
        mc.gui.setScreen(screen);
    }

    static ChatComponent chat(Minecraft mc) {
        return mc.gui.hud.getChat();
    }

    static boolean hudHidden(Minecraft mc) {
        return mc.gui.hud.isHidden();
    }
}
