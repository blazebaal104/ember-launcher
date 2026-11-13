package dev.ember.overlay.compat;

import dev.ember.overlay.api.Gfx;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.ItemStack;

/** {@link Gfx} over 1.21.x's GuiGraphics. Reused per frame (no allocation). */
public final class GfxImpl implements Gfx {
    private GuiGraphics g;

    public GfxImpl wrap(GuiGraphics g) {
        this.g = g;
        return this;
    }

    @Override public void fill(int x1, int y1, int x2, int y2, int argb) { g.fill(x1, y1, x2, y2, argb); }
    @Override public void text(String text, int x, int y, int argb, boolean shadow) { g.drawString(Minecraft.getInstance().font, text, x, y, argb, shadow); }
    @Override public void item(ItemStack stack, int x, int y) { g.renderItem(stack, x, y); }
    @Override public void itemDecorations(ItemStack stack, int x, int y) { g.renderItemDecorations(Minecraft.getInstance().font, stack, x, y); }
    @Override public void push(float x, float y, float scale) { Compat.pushScale(g, x, y, scale); }
    @Override public void pop() { Compat.popScale(g); }
    @Override public void clip(int x1, int y1, int x2, int y2) { g.enableScissor(x1, y1, x2, y2); }
    @Override public void unclip() { g.disableScissor(); }
    @Override public void effectIcon(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> effect, int x, int y) { Compat.effectIcon(g, effect, x, y); }
}
