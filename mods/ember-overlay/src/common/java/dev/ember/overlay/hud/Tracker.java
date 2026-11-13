package dev.ember.overlay.hud;

import dev.ember.overlay.api.Gfx;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.ItemStack;

/** Passes drawing through and records the area used, so modules needn't report their size. */
public final class Tracker implements Gfx {
    private Gfx g;
    int minX, minY, maxX, maxY;

    public Tracker begin(Gfx target) {
        g = target;
        minX = minY = Integer.MAX_VALUE;
        maxX = maxY = Integer.MIN_VALUE;
        return this;
    }

    public int width() {
        return maxX < minX ? 0 : maxX - Math.min(0, minX);
    }

    public int height() {
        return maxY < minY ? 0 : maxY - Math.min(0, minY);
    }

    private void grow(int x1, int y1, int x2, int y2) {
        if (x1 < minX) minX = x1;
        if (y1 < minY) minY = y1;
        if (x2 > maxX) maxX = x2;
        if (y2 > maxY) maxY = y2;
    }

    @Override public void fill(int x1, int y1, int x2, int y2, int argb) {
        g.fill(x1, y1, x2, y2, argb);
        if ((argb >>> 24) != 0) grow(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
    }

    @Override public void text(String text, int x, int y, int argb, boolean shadow) {
        g.text(text, x, y, argb, shadow);
        grow(x, y, x + Minecraft.getInstance().font.width(text), y + 8);
    }

    @Override public void item(ItemStack stack, int x, int y) {
        g.item(stack, x, y);
        grow(x, y, x + 16, y + 16);
    }

    @Override public void itemDecorations(ItemStack stack, int x, int y) {
        g.itemDecorations(stack, x, y);
    }

    @Override public void push(float x, float y, float scale) { g.push(x, y, scale); }
    @Override public void pop() { g.pop(); }
    @Override public void clip(int x1, int y1, int x2, int y2) { g.clip(x1, y1, x2, y2); }
    @Override public void unclip() { g.unclip(); }
}
