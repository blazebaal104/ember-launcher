package dev.ember.overlay.compat;

import dev.ember.overlay.api.Gfx;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Base for the overlay's screens: lets shared code draw extras without version-specific render signatures. */
public abstract class EmberScreen extends Screen {
    private final GfxImpl gfx = new GfxImpl();

    protected EmberScreen(Component title) {
        super(title);
    }

    protected void drawExtra(Gfx g) {}

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float delta) {
        super.extractRenderState(g, mouseX, mouseY, delta);
        drawExtra(gfx.wrap(g));
    }
}
