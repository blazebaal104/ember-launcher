package dev.ember.overlay.ui;

import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Config;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.FeatureRegistry;
import dev.ember.overlay.hud.HudStyle;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.List;
import java.util.Locale;

/**
 * The in-game menu (Right Shift). Built only from vanilla widgets, so it inherits
 * keyboard navigation and needs no input overrides (whose signatures change between
 * versions). Opening it doesn't pause single-player, like Lunar/Feather.
 */
public final class OverlayScreen extends Screen {
    private static Category tab = Category.HUD;
    private static int page;
    private EditBox search;
    private String query = "";

    public OverlayScreen() {
        super(Component.literal("Ember"));
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    @Override
    protected void init() {
        int panelW = Math.min(520, width - 40), left = (width - panelW) / 2, top = 40;

        // Category tabs
        Category[] cats = Category.values();
        int tabW = (panelW - 8) / cats.length;
        for (int i = 0; i < cats.length; i++) {
            Category c = cats[i];
            Button b = Button.builder(Component.literal(c.label), btn -> {
                tab = c;
                page = 0;
                rebuildWidgets();
            }).bounds(left + i * (tabW + 4), top, tabW, 20).build();
            b.active = c != tab;
            addRenderableWidget(b);
        }

        search = new EditBox(font, left, top + 26, panelW, 18, Component.literal("Search"));
        search.setHint(Component.literal("Search all " + FeatureRegistry.count() + " features"));
        search.setValue(query);
        search.setResponder(s -> {
            query = s;
            page = 0;
            rebuildWidgets();
            setFocused(search);
        });
        addRenderableWidget(search);

        List<Feature> list = query.isBlank() ? FeatureRegistry.byCategory(tab) : matching(query);
        int colW = (panelW - 6) / 2, rowH = 24, gridTop = top + 52;
        int rows = Math.max(3, (height - gridTop - 50) / rowH);
        int perPage = rows * 2, pages = Math.max(1, (list.size() + perPage - 1) / perPage);
        page = Math.min(page, pages - 1);

        for (int i = page * perPage, n = Math.min(list.size(), (page + 1) * perPage); i < n; i++) {
            Feature f = list.get(i);
            int slot = i - page * perPage, x = left + (slot % 2) * (colW + 6), y = gridTop + (slot / 2) * rowH;
            Button b = Button.builder(label(f), btn -> {
                f.setEnabled(!f.isEnabled());
                btn.setMessage(label(f));
            }).bounds(x, y, colW, 20).tooltip(Tooltip.create(Component.literal(f.description))).build();
            b.active = f.isAvailable();
            addRenderableWidget(b);
        }

        int by = height - 30;
        if (pages > 1) {
            addRenderableWidget(Button.builder(Component.literal("Previous"), b -> { page--; rebuildWidgets(); }).bounds(left, by, 70, 20).build()).active = page > 0;
            addRenderableWidget(Button.builder(Component.literal("Next"), b -> { page++; rebuildWidgets(); }).bounds(left + 76, by, 70, 20).build()).active = page < pages - 1;
        }
        addRenderableWidget(Button.builder(Component.literal("Servers"), b -> minecraft.setScreen(new ServerSwitcherScreen(this))).bounds(left + panelW - 236, by, 76, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Screenshots"), b -> minecraft.setScreen(new ScreenshotScreen(this))).bounds(left + panelW - 156, by, 76, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Done"), b -> onClose()).bounds(left + panelW - 76, by, 76, 20).build());
    }

    private static List<Feature> matching(String q) {
        String needle = q.toLowerCase(Locale.ROOT);
        return java.util.stream.StreamSupport.stream(FeatureRegistry.all().spliterator(), false)
                .filter(f -> f.name.toLowerCase(Locale.ROOT).contains(needle) || f.description.toLowerCase(Locale.ROOT).contains(needle))
                .toList();
    }

    private static Component label(Feature f) {
        if (!f.isAvailable()) return Component.literal(f.name + " (planned)");
        return Component.literal(f.name + ": " + (f.isEnabled() ? "On" : "Off"));
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float delta) {
        super.render(g, mouseX, mouseY, delta);
        g.drawString(font, "Ember", (width - Math.min(520, width - 40)) / 2, 24, HudStyle.ACCENT, false);
    }

    @Override
    public void onClose() {
        Config.save();
        super.onClose();
    }
}
