package dev.ember.overlay.compat;

import dev.ember.overlay.api.Gfx;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.item.ItemStack;

/** {@link Gfx} over 26.x's GuiGraphicsExtractor. Reused per frame (no allocation). */
public final class GfxImpl implements Gfx {
    private GuiGraphicsExtractor g;

    public GfxImpl wrap(GuiGraphicsExtractor g) {
        this.g = g;
        return this;
    }

    @Override public void fill(int x1, int y1, int x2, int y2, int argb) { g.fill(x1, y1, x2, y2, argb); }
    @Override public void text(String text, int x, int y, int argb, boolean shadow) { g.text(Minecraft.getInstance().font, text, x, y, argb, shadow); }
    @Override public void item(ItemStack stack, int x, int y) { g.item(stack, x, y); }
    @Override public void itemDecorations(ItemStack stack, int x, int y) { g.itemDecorations(Minecraft.getInstance().font, stack, x, y); }
    @Override public void push(float x, float y, float scale) {
        g.pose().pushMatrix();
        g.pose().translate(x, y);
        g.pose().scale(scale, scale);
    }
    @Override public void pop() { g.pose().popMatrix(); }
    @Override public void clip(int x1, int y1, int x2, int y2) { g.enableScissor(x1, y1, x2, y2); }
    @Override public void unclip() { g.disableScissor(); }
    @Override public void effectIcon(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> effect, int x, int y) {
        g.blitSprite(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, Era.effectSprite(effect), x, y, 18, 18);
    }
}
