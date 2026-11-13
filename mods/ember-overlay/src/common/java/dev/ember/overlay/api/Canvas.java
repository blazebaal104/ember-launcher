package dev.ember.overlay.api;

/**
 * A small image we paint pixel by pixel and draw as one textured quad (a Minecraft dynamic
 * texture). Used for the minimap, the world map tiles and the menu icons: one quad per frame
 * instead of thousands of fills.
 */
public interface Canvas {
    int width();

    int height();

    /** Set one pixel (ARGB). Call {@link #upload()} after a batch of changes. */
    void set(int x, int y, int argb);

    /** Make all pixels transparent. */
    void clear();

    /** Send the pixels to the GPU. */
    void upload();

    /** Free the texture. */
    void close();
}
