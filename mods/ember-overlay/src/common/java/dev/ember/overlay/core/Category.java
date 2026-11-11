package dev.ember.overlay.core;

public enum Category {
    HUD("HUD & information"),
    VISUAL("Visual tweaks"),
    QOL("Quality of life");

    public final String label;

    Category(String label) {
        this.label = label;
    }
}
