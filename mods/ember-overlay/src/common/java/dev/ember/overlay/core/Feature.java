package dev.ember.overlay.core;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.ItemLike;

import java.util.ArrayList;
import java.util.List;

/**
 * One toggleable tweak. Everything starts off: players switch on what they want.
 * Performance contract:
 *  - disabled features cost nothing: they are removed from every tick/render list;
 *  - {@link #tick} runs at 20 Hz, never per frame - expensive work goes there;
 *  - mixin hooks read a single static/volatile boolean before doing anything.
 */
public abstract class Feature {
    public final String id;
    public final String name;
    public final Category category;
    public final String description;
    public final List<Setting> settings = new ArrayList<>();
    private boolean enabled;
    private ItemLike iconItem = Items.PAPER;
    private ItemStack icon;
    /** Key that drives this feature, shown on its settings page. */
    public KeyMapping key;
    /** Name of an installed mod that already does this (see {@link ModScan}); null if none. */
    public String providedBy;

    // HUD layout (only used by positionable HUD modules). -1 = automatic.
    public float posX = -1, posY = -1;
    /** Where it was last drawn: screen position and unscaled size. */
    public int lastX, lastY, lastW, lastH;

    protected Feature(String id, String name, Category category, String description) {
        this.id = id;
        this.name = name;
        this.category = category;
        this.description = description;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public final void setEnabled(boolean value) {
        if (value == enabled || (value && !isAvailable())) return;
        enabled = value;
        if (value) onEnable();
        else onDisable();
        FeatureRegistry.rebuildActiveLists();
    }

    /** False for planned features that ship as placeholders (shown greyed out in the menu). */
    public boolean isAvailable() {
        return true;
    }

    /** Why the feature can't be used, shown on its card when {@link #isAvailable()} is false. */
    public String unavailableReason() {
        return "Coming soon";
    }

    protected void onEnable() {}
    protected void onDisable() {}

    /** Called every client tick while enabled. */
    public void tick(Minecraft mc) {}

    /** Whether this feature needs {@link #tick}. Keeps the tick list minimal. */
    public boolean wantsTick() {
        return false;
    }

    // ---------------------------------------------------------------- menu metadata

    @SuppressWarnings("unchecked")
    public <F extends Feature> F icon(ItemLike item) {
        iconItem = item;
        icon = null;
        return (F) this;
    }

    /** The card icon; null while the game is still loading (items aren't ready yet on 26.x). */
    public ItemStack icon() {
        if (icon == null) {
            try {
                icon = new ItemStack(iconItem);
            } catch (RuntimeException notReady) {
                return null;
            }
        }
        return icon;
    }

    /** Called once when registered, after the constructor has added the feature's own settings. */
    public void finishSettings() {}

    protected final <S extends Setting> S add(S s) {
        settings.add(s);
        return s;
    }

    public void resetSettings() {
        for (Setting s : settings) s.reset();
        posX = posY = -1;
    }
}
