package dev.ember.overlay.api;

import net.minecraft.world.item.ItemStack;

/**
 * The few drawing calls the overlay needs. Each Minecraft version family implements this over
 * its own GUI class (GuiGraphics in 1.21.x, GuiGraphicsExtractor in 26.x), so everything else
 * is shared.
 */
public interface Gfx {
    void fill(int x1, int y1, int x2, int y2, int argb);

    void text(String text, int x, int y, int argb, boolean shadow);

    void item(ItemStack stack, int x, int y);

    void itemDecorations(ItemStack stack, int x, int y);
}
