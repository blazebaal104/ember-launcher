package dev.ember.overlay.core;

import net.minecraft.client.Minecraft;

/**
 * One toggleable tweak. Performance contract:
 *  - disabled features cost nothing: they are removed from every tick/render list;
 *  - {@link #tick} runs at 20 Hz, never per frame - expensive work goes there;
 *  - mixin hooks read a single static/volatile boolean before doing anything.
 */
public abstract class Feature {
    public final String id;
    public final String name;
    public final Category category;
    public final String description;
    private boolean enabled;

    protected Feature(String id, String name, Category category, String description, boolean enabledByDefault) {
        this.id = id;
        this.name = name;
        this.category = category;
        this.description = description;
        this.enabled = enabledByDefault;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public final void setEnabled(boolean value) {
        if (value == enabled) return;
        enabled = value;
        if (value) onEnable();
        else onDisable();
        FeatureRegistry.rebuildActiveLists();
    }

    /** False for planned features that ship as placeholders (shown greyed out in the menu). */
    public boolean isAvailable() {
        return true;
    }

    protected void onEnable() {}
    protected void onDisable() {}

    /** Called every client tick while enabled. */
    public void tick(Minecraft mc) {}

    /** Whether this feature needs {@link #tick}. Keeps the tick list minimal. */
    public boolean wantsTick() {
        return false;
    }
}
