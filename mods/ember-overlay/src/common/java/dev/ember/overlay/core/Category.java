package dev.ember.overlay.core;

public enum Category {
    HUD("HUD", "Information on your screen"),
    VISUAL("Visual", "How the game looks"),
    QOL("Utility", "Handy tools and shortcuts");

    public final String label;
    public final String blurb;

    Category(String label, String blurb) {
        this.label = label;
        this.blurb = blurb;
    }
}
