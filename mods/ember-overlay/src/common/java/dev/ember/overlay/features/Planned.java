package dev.ember.overlay.features;

import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Feature;

/** A listed-but-not-yet-built feature. Shown greyed out so the roadmap is honest. */
public final class Planned extends Feature {
    public Planned(String id, String name, Category category, String description) {
        super(id, name, category, description);
    }

    @Override
    public boolean isAvailable() {
        return false;
    }
}
