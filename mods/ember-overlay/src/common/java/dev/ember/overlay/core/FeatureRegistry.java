package dev.ember.overlay.core;

import dev.ember.overlay.hud.HudModule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Holds every feature and the pre-filtered "active" lists the hot paths iterate.
 * Lists are rebuilt only when something is toggled, so ticking and rendering never
 * filter or allocate.
 */
public final class FeatureRegistry {
    private static final Map<String, Feature> FEATURES = new LinkedHashMap<>();
    private static volatile List<Feature> ticking = List.of();
    private static volatile List<HudModule> hud = List.of();

    private FeatureRegistry() {}

    public static <T extends Feature> T register(T feature) {
        if (FEATURES.put(feature.id, feature) != null) throw new IllegalStateException("duplicate feature " + feature.id);
        return feature;
    }

    public static Iterable<Feature> all() {
        return Collections.unmodifiableCollection(FEATURES.values());
    }

    public static List<Feature> byCategory(Category c) {
        List<Feature> out = new ArrayList<>();
        for (Feature f : FEATURES.values()) if (f.category == c) out.add(f);
        return out;
    }

    public static int count() {
        return FEATURES.size();
    }

    public static List<Feature> ticking() {
        return ticking;
    }

    public static List<HudModule> hud() {
        return hud;
    }

    public static void rebuildActiveLists() {
        List<Feature> t = new ArrayList<>();
        List<HudModule> h = new ArrayList<>();
        for (Feature f : FEATURES.values()) {
            if (!f.isEnabled() || !f.isAvailable()) continue;
            if (f.wantsTick()) t.add(f);
            if (f instanceof HudModule m) h.add(m);
        }
        ticking = List.copyOf(t);
        hud = List.copyOf(h);
    }
}
