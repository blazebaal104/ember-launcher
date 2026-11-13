package dev.ember.overlay.ui;

import dev.ember.overlay.api.Draw;
import dev.ember.overlay.api.Gfx;
import dev.ember.overlay.compat.Compat;
import dev.ember.overlay.compat.EmberScreen;
import dev.ember.overlay.core.Category;
import dev.ember.overlay.core.Config;
import dev.ember.overlay.core.Feature;
import dev.ember.overlay.core.FeatureRegistry;
import dev.ember.overlay.core.Setting;
import dev.ember.overlay.features.VisualFeatures;
import dev.ember.overlay.hud.HudModule;
import dev.ember.overlay.hud.Tracker;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The in-game menu (Right Shift): a glass panel in the launcher's colours with a card per
 * feature. The bottom of a card turns the feature on or off; the rest opens its settings page
 * (simple options first, advanced ones folded away, a live preview for HUD modules).
 *
 * Everything is drawn with plain fills and text, and clicks arrive as (x, y, button) from
 * {@link EmberScreen}, so the same code runs on every supported Minecraft version. Opening it
 * doesn't pause single-player, like Lunar and Feather.
 */
public final class OverlayScreen extends EmberScreen {
    private enum Filter {
        ALL("All features", null), ON("Enabled", null), HUD("HUD", Category.HUD), VISUAL("Visual", Category.VISUAL),
        QOL("Utility", Category.QOL), OWNED("In your mods", null);

        final String label;
        final Category category;

        Filter(String label, Category category) {
            this.label = label;
            this.category = category;
        }
    }

    private static Filter filter = Filter.ALL;
    private static String query = "";

    private final Ui ui = new Ui();
    private final Tracker previewTracker = new Tracker();
    private final Map<Setting.Text, EditBox> fields = new IdentityHashMap<>();
    private EditBox search;
    private Feature open;
    private boolean showAdvanced;
    private float scroll, scrollTarget, scrollMax, dScroll, dScrollTarget, dScrollMax;
    private float fade = 1;
    private int previewW, previewH;
    private long previewTick;

    // layout of the current frame
    private int px, py, pw, ph, sideW, cx, cy, cw, ch;

    public OverlayScreen() {
        super(Component.literal("Ember"));
        Theme.load();
    }

    /** Opens straight onto a feature's settings page. */
    public OverlayScreen(Feature feature) {
        this();
        open = feature;
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    // ------------------------------------------------------------------ widgets (text fields)

    @Override
    protected void init() {
        layout();
        fields.clear();
        search = new EditBox(font, 0, 0, 100, 10, Component.literal("Search"));
        search.setBordered(false);
        search.setMaxLength(40);
        search.setTextColor(Theme.TEXT);
        search.setHint(Component.literal("Search " + FeatureRegistry.count() + " features"));
        search.setValue(query);
        search.setResponder(s -> {
            query = s;
            scrollTarget = 0;
        });
        search.visible = open == null;
        addRenderableWidget(search);
        if (open != null) {
            for (Setting s : open.settings) {
                if (!(s instanceof Setting.Text t)) continue;
                EditBox box = new EditBox(font, 0, 0, 100, 10, Component.literal(t.label));
                box.setBordered(false);
                box.setMaxLength(120);
                box.setTextColor(Theme.TEXT);
                box.setHint(Component.literal(t.hint));
                box.setValue(t.v);
                box.setResponder(t::set);
                box.visible = false;
                fields.put(t, box);
                addRenderableWidget(box);
            }
        }
    }

    private void openDetails(Feature f) {
        open = f;
        dScroll = dScrollTarget = 0;
        showAdvanced = false;
        previewW = previewH = 0;
        rebuildWidgets();
    }

    private void closeDetails() {
        open = null;
        rebuildWidgets();
    }

    private void closeMenu() {
        Config.save();
        Compat.setScreen(minecraft, null);
    }

    @Override
    public void onClose() {
        if (open != null) closeDetails(); // Esc on a settings page goes back to the grid
        else closeMenu();
    }

    @Override
    public void removed() {
        Config.save();
        super.removed();
    }

    // ------------------------------------------------------------------ input

    @Override
    protected boolean onMousePress(double x, double y, int button) {
        if (button != 0) return false;
        if (!isOverField(x, y)) {
            setFocused(null);
            if (search != null) search.setFocused(false);
            for (EditBox b : fields.values()) b.setFocused(false);
        }
        return ui.press(x, y);
    }

    private boolean isOverField(double x, double y) {
        if (search != null && search.visible && search.isMouseOver(x, y)) return true;
        for (EditBox b : fields.values()) if (b.visible && b.isMouseOver(x, y)) return true;
        return false;
    }

    @Override
    protected void onMouseRelease(double x, double y, int button) {
        ui.release();
    }

    @Override
    public boolean mouseScrolled(double x, double y, double horizontal, double vertical) {
        if (open != null) dScrollTarget = clamp(dScrollTarget - (float) vertical * 28, 0, dScrollMax);
        else scrollTarget = clamp(scrollTarget - (float) vertical * 34, 0, scrollMax);
        return true;
    }

    private static float clamp(float v, float lo, float hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    // ------------------------------------------------------------------ drawing helpers

    private int c(int argb) {
        return Draw.alpha(argb, fade);
    }

    private void text(Gfx g, String s, int x, int y, int color) {
        if (fade < 0.05f || s.isEmpty()) return;
        g.text(s, x, y, c(color), false);
    }

    private void textScaled(Gfx g, String s, int x, int y, float scale, int color) {
        if (fade < 0.05f) return;
        g.push(x, y, scale);
        g.text(s, 0, 0, c(color), false);
        g.pop();
    }

    private void textCentered(Gfx g, String s, int cx, int y, int color) {
        text(g, s, cx - font.width(s) / 2, y, color);
    }

    private String trim(String s, int w) {
        if (font.width(s) <= w) return s;
        while (!s.isEmpty() && font.width(s + "…") > w) s = s.substring(0, s.length() - 1);
        return s + "…";
    }

    private List<String> wrap(String s, int w) {
        List<String> out = new ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (String word : s.split(" ")) {
            String tryLine = line.isEmpty() ? word : line + " " + word;
            if (font.width(tryLine) > w && !line.isEmpty()) {
                out.add(line.toString());
                line = new StringBuilder(word);
            } else line = new StringBuilder(tryLine);
        }
        if (!line.isEmpty()) out.add(line.toString());
        return out;
    }

    private void item(Gfx g, Feature f, int x, int y, float scale) {
        if (fade < 0.6f) return;
        g.push(x, y, scale);
        g.item(f.icon(), 0, 0);
        g.pop();
    }

    /** Rounded button; returns true when hovered. */
    private boolean button(Gfx g, String label, int x, int y, int w, int h, boolean primary, Runnable action) {
        boolean hov = ui.hover(x, y, x + w, y + h);
        int bg = primary ? (hov ? Draw.lighten(Theme.ACCENT, 0.12f) : Theme.ACCENT) : (hov ? Theme.LINE : Draw.withAlpha(Theme.RAISED, 220));
        Draw.round(g, x, y, x + w, y + h, 3, c(bg));
        textCentered(g, label, x + w / 2, y + (h - 8) / 2, primary ? Theme.ON_ACCENT : (hov ? Theme.TEXT : Draw.mix(Theme.MUTED, Theme.TEXT, 0.5f)));
        ui.click(x, y, x + w, y + h, action);
        return hov;
    }

    private void toggleSwitch(Gfx g, String key, int x, int y, boolean on, boolean enabled) {
        float t = Ui.easeOut(ui.anim(key, on, 7f));
        int track = Draw.mix(Draw.withAlpha(Theme.LINE, 255), Theme.ACCENT, t);
        if (!enabled) track = Draw.withAlpha(Theme.LINE, 120);
        Draw.round(g, x, y, x + 22, y + 12, 6, c(track));
        int kx = x + 2 + Math.round(t * 10);
        Draw.round(g, kx, y + 2, kx + 8, y + 10, 4, c(enabled ? 0xFFFFFFFF : Theme.MUTED));
    }

    // ------------------------------------------------------------------ frame

    private void layout() {
        pw = Math.min(width - 16, 520);
        ph = Math.min(height - 16, 330);
        px = (width - pw) / 2;
        py = (height - ph) / 2;
        sideW = pw >= 400 ? 104 : 84;
        cx = px + sideW + 10;
        cy = py + 36;
        cw = pw - sideW - 20;
        ch = ph - 36 - 10;
    }

    @Override
    protected void drawBackdrop(Gfx g, int mouseX, int mouseY) {
        ui.begin(mouseX, mouseY);
        float t = Ui.easeOut(ui.anim("open", true, 5f));
        fade = t;
        layout();
        int slide = Math.round((1 - t) * 10);
        py += slide;
        cy += slide;

        drawPanel(g);
        drawTopBar(g);
        drawSidebar(g);
        if (open != null) drawDetails(g);
        else drawGrid(g);
        ui.end();
    }

    private void drawPanel(Gfx g) {
        int a = Theme.panelAlpha();
        Draw.round(g, px - 3, py - 2, px + pw + 3, py + ph + 4, 8, c(0x38000000));
        Draw.round(g, px, py, px + pw, py + ph, 7, c(Draw.withAlpha(Theme.LINE, 220)));
        Draw.round(g, px + 1, py + 1, px + pw - 1, py + ph - 1, 6, c(Draw.withAlpha(Theme.BASE, a)));
        // a soft accent glow along the top, like the launcher's backdrop
        Draw.vgradient(g, px + 6, py + 1, px + pw - 6, py + 46, c(Draw.withAlpha(Theme.ACCENT, 30)), c(Draw.withAlpha(Theme.ACCENT, 0)));
        g.fill(px + 8, py + 1, px + pw - 8, py + 2, c(0x22FFFFFF)); // glass edge highlight
        g.fill(px + 1, py + 28, px + pw - 1, py + 29, c(Draw.withAlpha(Theme.LINE, 170)));
        g.fill(px + sideW, py + 29, px + sideW + 1, py + ph - 1, c(Draw.withAlpha(Theme.LINE, 140)));
        Draw.round(g, px + 1, py + 29, px + sideW, py + ph - 1, 0, c(Draw.withAlpha(Theme.INK, 60)));
    }

    private void drawTopBar(Gfx g) {
        // logo
        Draw.round(g, px + 9, py + 7, px + 23, py + 21, 4, c(Theme.ACCENT));
        textCentered(g, "§lE", px + 16, py + 10, Theme.ON_ACCENT);
        text(g, "§lEmber", px + 28, py + 10, Theme.TEXT);

        String[] full = {"Mods", "HUD Layout", "Servers", "Screenshots"};
        String[] small = {"Mods", "HUD", "Servers", "Shots"};
        int start = px + 72, end = px + pw - 32, total = 0;
        for (String s : full) total += font.width(s) + 18;
        String[] labels = total <= end - start ? full : small;
        Runnable[] actions = {
                () -> {
                    if (open != null) closeDetails();
                },
                () -> Compat.setScreen(minecraft, new HudEditorScreen(this, null)),
                () -> Compat.setScreen(minecraft, new ServerSwitcherScreen(this)),
                () -> Compat.setScreen(minecraft, new ScreenshotScreen(this)),
        };
        int x = start;
        for (int i = 0; i < labels.length; i++) {
            int w = font.width(labels[i]) + 14;
            boolean active = i == 0;
            boolean hov = ui.hover(x, py + 7, x + w, py + 21);
            int bg = active ? Theme.ACCENT : hov ? Theme.LINE : Draw.withAlpha(Theme.RAISED, 200);
            Draw.round(g, x, py + 7, x + w, py + 21, 4, c(bg));
            textCentered(g, labels[i], x + w / 2, py + 10, active ? Theme.ON_ACCENT : hov ? Theme.TEXT : Theme.MUTED);
            ui.click(x, py + 7, x + w, py + 21, actions[i]);
            x += w + 4;
        }

        // close
        int bx = px + pw - 24, by = py + 6;
        boolean hov = ui.hover(bx, by, bx + 16, by + 16);
        Draw.round(g, bx, by, bx + 16, by + 16, 4, c(hov ? Theme.RED : Draw.withAlpha(Theme.RAISED, 200)));
        int xc = hov ? 0xFFFFFFFF : Theme.MUTED;
        for (int i = 0; i < 7; i++) {
            g.fill(bx + 4 + i, by + 4 + i, bx + 5 + i, by + 5 + i, c(xc));
            g.fill(bx + 10 - i, by + 4 + i, bx + 11 - i, by + 5 + i, c(xc));
        }
        ui.click(bx, by, bx + 16, by + 16, this::closeMenu);
    }

    private int count(Filter f) {
        int n = 0;
        for (Feature x : FeatureRegistry.all()) if (matches(x, f, "")) n++;
        return n;
    }

    private void drawSidebar(Gfx g) {
        int x = px + 6, w = sideW - 12, y = py + 36;
        textScaled(g, "BROWSE", x + 4, y, 0.75f, Theme.MUTED);
        y += 10;
        boolean anyOwned = count(Filter.OWNED) > 0;
        for (Filter f : Filter.values()) {
            if (f == Filter.OWNED && !anyOwned) continue;
            boolean active = filter == f && open == null;
            boolean hov = ui.hover(x, y, x + w, y + 16);
            if (active) {
                Draw.round(g, x, y, x + w, y + 16, 3, c(Draw.withAlpha(Theme.ACCENT, 48)));
                Draw.round(g, x, y + 3, x + 2, y + 13, 1, c(Theme.ACCENT));
            } else if (hov) Draw.round(g, x, y, x + w, y + 16, 3, c(Draw.withAlpha(Theme.RAISED, 200)));
            String label = trim(f.label, w - 26);
            text(g, label, x + 7, y + 4, active || hov ? Theme.TEXT : Draw.mix(Theme.MUTED, Theme.TEXT, 0.35f));
            String n = String.valueOf(count(f));
            text(g, n, x + w - 5 - font.width(n), y + 4, active ? Theme.ACCENT : Theme.MUTED);
            ui.click(x, y, x + w, y + 16, () -> {
                filter = f;
                scrollTarget = scroll = 0;
                if (open != null) closeDetails();
            });
            y += 18;
        }

        int by = py + ph - 26;
        button(g, "Edit HUD layout", x, by, w, 18, true, () -> Compat.setScreen(minecraft, new HudEditorScreen(this, null)));
        int on = count(Filter.ON);
        if (on > 0) {
            String s = "Turn all off";
            int sx = x + (w - font.width(s)) / 2, sy = by - 14;
            boolean hov = ui.hover(sx - 2, sy - 2, sx + font.width(s) + 2, sy + 10);
            text(g, s, sx, sy, hov ? Theme.RED : Theme.MUTED);
            ui.click(sx - 2, sy - 2, sx + font.width(s) + 2, sy + 10, () -> {
                for (Feature f : FeatureRegistry.all()) f.setEnabled(false);
            });
        }
    }

    // ------------------------------------------------------------------ grid of cards

    private static boolean matches(Feature f, Filter filter, String q) {
        boolean ok = switch (filter) {
            case ALL -> true;
            case ON -> f.isEnabled();
            case OWNED -> f.providedBy != null;
            default -> f.category == filter.category;
        };
        if (!ok) return false;
        if (q.isBlank()) return true;
        String needle = q.toLowerCase(Locale.ROOT).trim();
        return f.name.toLowerCase(Locale.ROOT).contains(needle) || f.description.toLowerCase(Locale.ROOT).contains(needle)
                || f.category.label.toLowerCase(Locale.ROOT).contains(needle);
    }

    private void drawGrid(Gfx g) {
        List<Feature> list = new ArrayList<>();
        for (Feature f : FeatureRegistry.all()) if (matches(f, filter, query)) list.add(f);

        // header
        textScaled(g, "§l" + (query.isBlank() ? filter.label : "Results"), cx, cy + 1, 1.25f, Theme.TEXT);
        int on = 0;
        for (Feature f : list) if (f.isEnabled()) on++;
        String sub = list.size() + (list.size() == 1 ? " feature" : " features") + (on > 0 ? " · " + on + " on" : "")
                + (filter.category != null ? " · " + filter.category.blurb : "");
        int sw = Math.min(150, cw / 2 - 6);
        text(g, trim(sub, cw - sw - 10), cx, cy + 16, Theme.MUTED);

        // search box
        int sx = cx + cw - sw, sy = cy;
        boolean focused = search.isFocused();
        Draw.round(g, sx, sy, sx + sw, sy + 18, 4, c(focused ? Theme.ACCENT : Draw.withAlpha(Theme.LINE, 220)));
        Draw.round(g, sx + 1, sy + 1, sx + sw - 1, sy + 17, 3, c(Draw.withAlpha(Theme.SURFACE, 240)));
        Draw.circle(g, sx + 9, sy + 8, 4, c(Theme.MUTED));
        Draw.circle(g, sx + 9, sy + 8, 3, c(Theme.SURFACE));
        g.fill(sx + 11, sy + 11, sx + 13, sy + 13, c(Theme.MUTED));
        g.fill(sx + 12, sy + 12, sx + 14, sy + 14, c(Theme.MUTED));
        search.setX(sx + 18);
        search.setY(sy + 5);
        search.setWidth(sw - 22);
        search.visible = fade > 0.5f;
        ui.click(sx, sy, sx + sw, sy + 18, () -> {
            setFocused(search);
            search.setFocused(true);
        });

        // cards
        int gy = cy + 30, gh = ch - 30, gw = cw - 6, gap = 6, minW = 96, cardH = 78;
        int cols = Math.max(2, (gw + gap) / (minW + gap));
        int cardW = (gw - gap * (cols - 1)) / cols;
        int rows = (list.size() + cols - 1) / cols;
        scrollMax = Math.max(0, rows * (cardH + gap) - gap - gh);
        scrollTarget = clamp(scrollTarget, 0, scrollMax);
        scroll += (scrollTarget - scroll) * Math.min(1, ui.dt * 14);
        int off = Math.round(scroll);

        if (list.isEmpty()) {
            textCentered(g, query.isBlank() ? "Nothing here yet" : "No feature matches \"" + query + "\"", cx + cw / 2, gy + gh / 2 - 10, Theme.MUTED);
            if (filter == Filter.ON) textCentered(g, "Turn features on from All features.", cx + cw / 2, gy + gh / 2 + 4, Theme.MUTED);
        }

        g.clip(cx - 2, gy - 2, cx + gw + 2, gy + gh);
        ui.clip(cx - 2, gy - 2, cx + gw + 2, gy + gh);
        for (int i = 0; i < list.size(); i++) {
            int x = cx + (i % cols) * (cardW + gap), y = gy + (i / cols) * (cardH + gap) - off;
            if (y + cardH < gy - 2 || y > gy + gh) continue;
            card(g, list.get(i), x, y, cardW, cardH);
        }
        g.unclip();
        ui.unclip();

        if (scrollMax > 0) scrollbar(g, cx + cw - 3, gy, gh, scroll, scrollMax, v -> scrollTarget = scroll = v);
    }

    private void scrollbar(Gfx g, int x, int y, int h, float pos, float max, java.util.function.Consumer<Float> set) {
        Draw.round(g, x, y, x + 3, y + h, 1, c(Draw.withAlpha(Theme.LINE, 120)));
        int thumb = Math.max(16, Math.round(h * h / (h + max)));
        int ty = y + Math.round((h - thumb) * (pos / max));
        boolean hov = ui.hover(x - 3, y, x + 6, y + h);
        Draw.round(g, x, ty, x + 3, ty + thumb, 1, c(hov || ui.dragging() ? Theme.ACCENT : Theme.MUTED));
        ui.drag(x - 3, y, x + 6, y + h, (mx, my) -> set.accept(clamp((float) ((my - y - thumb / 2.0) / Math.max(1, h - thumb)) * max, 0, max)));
    }

    private void card(Gfx g, Feature f, int x, int y, int w, int h) {
        boolean avail = f.isAvailable(), on = f.isEnabled();
        int barY = y + h - 18;
        boolean hovBody = ui.hover(x, y, x + w, barY - 1);
        boolean hovBar = avail && ui.hover(x + 4, barY, x + w - 4, y + h - 4);
        float hv = ui.anim("card:" + f.id, hovBody || hovBar, 9f);
        float onT = Ui.easeOut(ui.anim("on:" + f.id, on, 7f));

        int border = Draw.mix(Draw.withAlpha(Theme.LINE, 200), Theme.ACCENT, Math.max(onT * 0.85f, hovBody ? hv * 0.5f : 0));
        Draw.round(g, x, y, x + w, y + h, 5, c(border));
        int bg = Draw.mix(Draw.withAlpha(Theme.SURFACE, 215), Draw.withAlpha(Theme.RAISED, 235), hv);
        Draw.round(g, x + 1, y + 1, x + w - 1, y + h - 1, 4, c(bg));
        if (onT > 0.01f) Draw.vgradient(g, x + 3, y + 1, x + w - 3, y + 20, c(Draw.withAlpha(Theme.ACCENT, Math.round(34 * onT))), c(Draw.withAlpha(Theme.ACCENT, 0)));

        // icon (lifts slightly on hover)
        int lift = Math.round(hv * 2);
        if (!avail) Draw.round(g, x + w / 2 - 13, y + 7 - lift, x + w / 2 + 13, y + 33 - lift, 4, c(0x30000000));
        item(g, f, x + w / 2 - 12, y + 8 - lift, 1.5f);
        if (!avail && fade > 0.6f) Draw.round(g, x + w / 2 - 13, y + 7 - lift, x + w / 2 + 13, y + 33 - lift, 4, c(Draw.withAlpha(Theme.SURFACE, 150)));

        textCentered(g, trim(f.name, w - 8), x + w / 2, y + 38, avail ? Theme.TEXT : Theme.MUTED);
        String hint;
        int hintColor = Theme.MUTED;
        if (hovBody) {
            hint = "Open settings ›";
            hintColor = Theme.ACCENT;
        } else if (f.providedBy != null) {
            hint = "In " + f.providedBy;
            hintColor = Theme.GOLD;
        } else {
            int n = f.settings.size();
            hint = n == 0 ? f.category.label : n + (n == 1 ? " option" : " options");
        }
        textCentered(g, trim(hint, w - 8), x + w / 2, y + 49, hintColor);

        // "you already have it" badge
        if (f.providedBy != null) {
            Draw.round(g, x + 4, y + 4, x + 12, y + 12, 4, c(Theme.GOLD));
            textScaled(g, "§l!", x + 7, y + 5, 0.75f, 0xFF15171C);
        }

        // toggle bar
        int bx1 = x + 4, bx2 = x + w - 4, by2 = y + h - 4;
        String label;
        int barBg, barFg;
        if (!avail) {
            label = f.unavailableReason().toUpperCase(Locale.ROOT);
            barBg = Draw.withAlpha(Theme.INK, 160);
            barFg = Theme.MUTED;
        } else {
            label = on ? "ENABLED" : "DISABLED";
            int off = hovBar ? Theme.LINE : Draw.withAlpha(Theme.RAISED, 255);
            int onC = hovBar ? Draw.lighten(Theme.ACCENT, 0.12f) : Theme.ACCENT;
            barBg = Draw.mix(off, onC, onT);
            barFg = Draw.mix(hovBar ? Theme.TEXT : Theme.MUTED, Theme.ON_ACCENT, onT);
        }
        Draw.round(g, bx1, barY, bx2, by2, 3, c(barBg));
        g.push(x + w / 2f - font.width(label) * 0.75f / 2f, barY + 4, 0.75f);
        if (fade > 0.05f) g.text("§l" + label, 0, 0, c(barFg), false);
        g.pop();

        ui.click(x, y, x + w, barY - 1, () -> openDetails(f));
        if (avail) ui.click(bx1, barY, bx2, by2, () -> f.setEnabled(!f.isEnabled()));
        else ui.click(bx1, barY, bx2, by2, () -> openDetails(f));
    }

    // ------------------------------------------------------------------ settings page

    private void drawDetails(Gfx g) {
        Feature f = open;
        float t = Ui.easeOut(ui.anim("page:" + f.id, true, 6f));
        int dx = Math.round((1 - t) * 14);
        int x = cx + dx, w = cw;

        // header
        button(g, "‹  Back", x, cy, 44, 15, false, this::closeDetails);
        item(g, f, x, cy + 22, 2f);
        textScaled(g, "§l" + trim(f.name, (int) ((w - 120) / 1.5f)), x + 40, cy + 24, 1.5f, Theme.TEXT);
        String meta = f.category.label + (f.settings.isEmpty() ? "" : " · " + f.settings.size() + (f.settings.size() == 1 ? " option" : " options"));
        text(g, meta, x + 40, cy + 41, Theme.MUTED);

        int swx = x + w - 26, swy = cy + 27;
        if (f.isAvailable()) {
            boolean on = f.isEnabled();
            String state = on ? "On" : "Off";
            text(g, state, swx - 6 - font.width(state), swy + 2, on ? Theme.ACCENT : Theme.MUTED);
            toggleSwitch(g, "sw:" + f.id, swx, swy, on, true);
            ui.click(swx - 30, swy - 4, swx + 24, swy + 16, () -> f.setEnabled(!f.isEnabled()));
        } else {
            String r = f.unavailableReason();
            int rw = font.width(r) + 12;
            Draw.round(g, x + w - rw, swy - 1, x + w, swy + 13, 3, c(Draw.withAlpha(Theme.INK, 180)));
            text(g, r, x + w - rw + 6, swy + 2, Theme.MUTED);
        }
        g.fill(x, cy + 56, x + w, cy + 57, c(Draw.withAlpha(Theme.LINE, 160)));

        // scrolling body
        int top = cy + 61, bottom = cy + ch, bw = w - 8;
        dScroll += (dScrollTarget - dScroll) * Math.min(1, ui.dt * 14);
        int y = top - Math.round(dScroll);
        g.clip(x - 2, top - 1, x + w + 2, bottom);
        ui.clip(x - 2, top - 1, x + w + 2, bottom);
        for (EditBox b : fields.values()) b.visible = false;

        for (String line : wrap(f.description, bw)) {
            text(g, line, x, y, Draw.mix(Theme.TEXT, Theme.MUTED, 0.25f));
            y += 10;
        }
        y += 6;

        if (f.providedBy != null) {
            y = notice(g, x, y, bw, Theme.GOLD, "You already have " + f.providedBy,
                    "It does the same thing, so you probably don't need both. Turn this on only if you'd rather use Ember's version.");
        }
        if (!f.isAvailable()) {
            y = notice(g, x, y, bw, Theme.MUTED, f.unavailableReason(), f.unavailableReason().startsWith("Needs")
                    ? "This version of Minecraft doesn't let mods change this part of the screen."
                    : "It's on the way. It will appear here, already working, after an Ember update.");
        }
        if (f.key != null) {
            String k = f.key.getTranslatedKeyMessage().getString();
            y = notice(g, x, y, bw, Theme.ACCENT, "Key: " + k, "Change it in Options › Controls › Key Binds, under Ember.");
        }

        y = preview(g, f, x, y, bw);

        // simple settings
        List<Setting> simple = new ArrayList<>(), advanced = new ArrayList<>();
        for (Setting s : f.settings) {
            if (!s.visible.getAsBoolean()) continue;
            (s.advanced ? advanced : simple).add(s);
        }
        if (!f.settings.isEmpty()) {
            textScaled(g, "SETTINGS", x, y, 0.75f, Theme.MUTED);
            y += 9;
        }
        if (simple.isEmpty() && advanced.isEmpty()) {
            text(g, f.isAvailable() ? "Nothing to set up: just turn it on." : "", x, y + 2, Theme.MUTED);
            y += 16;
        }
        for (Setting s : simple) y = row(g, f, s, x, y, bw, top, bottom);

        if (!advanced.isEmpty()) {
            y += 4;
            boolean hov = ui.hover(x, y, x + bw, y + 18);
            Draw.round(g, x, y, x + bw, y + 18, 3, c(hov ? Draw.withAlpha(Theme.RAISED, 230) : Draw.withAlpha(Theme.SURFACE, 200)));
            text(g, (showAdvanced ? "▾  " : "▸  ") + "Advanced settings", x + 7, y + 5, hov ? Theme.TEXT : Draw.mix(Theme.MUTED, Theme.TEXT, 0.4f));
            String n = advanced.size() + (showAdvanced ? "" : " more");
            text(g, n, x + bw - 7 - font.width(n), y + 5, Theme.MUTED);
            ui.click(x, y, x + bw, y + 18, () -> showAdvanced = !showAdvanced);
            y += 22;
            if (showAdvanced) for (Setting s : advanced) y = row(g, f, s, x, y, bw, top, bottom);
        }

        // actions
        y += 6;
        int ax = x;
        if (!f.settings.isEmpty()) {
            button(g, "Reset to defaults", ax, y, font.width("Reset to defaults") + 16, 16, false, () -> {
                f.resetSettings();
                rebuildWidgets();
            });
            ax += font.width("Reset to defaults") + 22;
        }
        if (f instanceof HudModule m && m.positionable()) {
            button(g, "Move on screen", ax, y, font.width("Move on screen") + 16, 16, false,
                    () -> Compat.setScreen(minecraft, new HudEditorScreen(this, f)));
        }
        y += 22;

        g.unclip();
        ui.unclip();
        int content = y + Math.round(dScroll) - top;
        dScrollMax = Math.max(0, content - (bottom - top));
        dScrollTarget = clamp(dScrollTarget, 0, dScrollMax);
        if (dScrollMax > 0) scrollbar(g, x + w - 3, top, bottom - top, dScroll, dScrollMax, v -> dScrollTarget = dScroll = v);
    }

    private int notice(Gfx g, int x, int y, int w, int color, String title, String body) {
        List<String> lines = wrap(body, w - 16);
        int h = 8 + 10 + lines.size() * 10 + 4;
        Draw.round(g, x, y, x + w, y + h, 4, c(Draw.withAlpha(color, 28)));
        Draw.round(g, x, y + 3, x + 2, y + h - 3, 1, c(color));
        text(g, "§l" + title, x + 9, y + 6, color);
        int ly = y + 17;
        for (String l : lines) {
            text(g, l, x + 9, ly, Draw.mix(Theme.TEXT, Theme.MUTED, 0.3f));
            ly += 10;
        }
        return y + h + 6;
    }

    private int preview(Gfx g, Feature f, int x, int y, int w) {
        boolean crosshair = f == VisualFeatures.crosshair && f.isAvailable();
        boolean hud = f instanceof HudModule m && m.positionable() && minecraft.player != null;
        if (!crosshair && !hud) return y;
        int h = crosshair ? 60 : Math.max(46, Math.min(140, previewH + 22));
        Draw.round(g, x, y, x + w, y + h, 4, c(Draw.withAlpha(Theme.LINE, 200)));
        Draw.vgradient(g, x + 1, y + 1, x + w - 1, y + h - 1, c(0xFF5B87B8), c(0xFF3E5B3A)); // sky to grass, like in game
        g.fill(x + 1, y + 1, x + w - 1, y + h - 1, c(0x50000000));
        textScaled(g, "PREVIEW", x + 6, y + 5, 0.75f, 0xC0FFFFFF);
        if (crosshair) {
            VisualFeatures.crosshair.draw(g, minecraft, x + w / 2, y + h / 2 + 3, false);
            return y + h + 8;
        }
        HudModule m = (HudModule) f;
        long now = System.currentTimeMillis();
        if (!f.isEnabled() && f.wantsTick() && now - previewTick > 50) {
            previewTick = now;
            f.tick(minecraft);
        }
        float s = m.look() == null ? 1f : m.look().scale();
        int pw0 = Math.round(previewW * s), ph0 = Math.round(previewH * s);
        float ox = x + (w - pw0) / 2f, oy = y + 14 + (h - 14 - ph0) / 2f;
        g.push(ox, oy, s);
        m.render(previewTracker.begin(g), minecraft, 0, 0);
        g.pop();
        previewW = previewTracker.width();
        previewH = previewTracker.height();
        if (previewW == 0) textCentered(g, "Nothing to show right now", x + w / 2, y + h / 2, 0xC0FFFFFF);
        return y + h + 8;
    }

    // ------------------------------------------------------------------ one setting row

    private int row(Gfx g, Feature f, Setting s, int x, int y, int w, int top, int bottom) {
        int ctrlW = Math.min(156, w / 2);
        if (s instanceof Setting.Color) ctrlW = Math.min(w / 2 + 20, 13 * 11 + 2);
        List<String> help = s.help.isEmpty() ? List.of() : wrap(s.help, w - ctrlW - 22);
        int h = Math.max(22, 7 + 10 + help.size() * 10 + 4);
        boolean hov = ui.hover(x, y, x + w, y + h);
        if (hov) Draw.round(g, x - 3, y, x + w + 3, y + h, 3, c(Draw.withAlpha(Theme.RAISED, 140)));
        text(g, s.label, x + 2, y + 7, Theme.TEXT);
        int hy = y + 18;
        for (String l : help) {
            text(g, l, x + 2, hy, Theme.MUTED);
            hy += 10;
        }
        int rx = x + w - ctrlW, mid = y + 11;

        if (s instanceof Setting.Bool b) {
            toggleSwitch(g, "set:" + f.id + ":" + s.key, x + w - 23, mid - 6, b.v, true);
            ui.click(x, y, x + w, y + h, () -> b.set(!b.v));
        } else if (s instanceof Setting.Slider sl) {
            String val = sl.text();
            int vw = Math.max(36, font.width(val) + 4);
            text(g, val, x + w - font.width(val), mid - 4, Theme.TEXT);
            int tx1 = rx, tx2 = x + w - vw - 6;
            float fr = sl.fraction();
            Draw.round(g, tx1, mid - 2, tx2, mid + 2, 2, c(Draw.withAlpha(Theme.LINE, 255)));
            int kx = tx1 + Math.round(fr * (tx2 - tx1));
            Draw.round(g, tx1, mid - 2, Math.max(tx1 + 2, kx), mid + 2, 2, c(Theme.ACCENT));
            boolean hk = ui.hover(tx1 - 4, y, tx2 + 4, y + h);
            Draw.circle(g, kx, mid, hk ? 5 : 4, c(0xFFFFFFFF));
            ui.drag(tx1 - 4, y, tx2 + 4, y + h, (mx, my) -> sl.setFraction((float) ((mx - tx1) / Math.max(1, tx2 - tx1))));
        } else if (s instanceof Setting.Color col) {
            int per = Math.max(1, (ctrlW + 2) / 11), n = Setting.Color.SWATCHES.length;
            int rowsN = (n + per - 1) / per;
            int sy = mid - (rowsN * 11 - 2) / 2;
            for (int i = 0; i < n; i++) {
                int sc = Setting.Color.SWATCHES[i];
                int sx = x + w - per * 11 + 2 + (i % per) * 11, yy = sy + (i / per) * 11;
                boolean sel = (col.v & 0xFFFFFF) == (sc & 0xFFFFFF);
                boolean sh = ui.hover(sx - 1, yy - 1, sx + 10, yy + 10);
                if (sel || sh) Draw.round(g, sx - 1, yy - 1, sx + 10, yy + 10, 3, c(sel ? 0xFFFFFFFF : Theme.MUTED));
                Draw.round(g, sx, yy, sx + 9, yy + 9, 2, c(sc));
                ui.click(sx - 1, yy - 1, sx + 10, yy + 10, () -> col.set(sc));
            }
            h = Math.max(h, rowsN * 11 + 10);
        } else if (s instanceof Setting.Choice ch) {
            int total = 0;
            for (String o : ch.options) total += font.width(o) + 10;
            if (total <= ctrlW) {
                int sx = x + w - total;
                Draw.round(g, sx - 2, mid - 8, x + w + 2, mid + 8, 4, c(Draw.withAlpha(Theme.INK, 170)));
                for (int i = 0; i < ch.options.length; i++) {
                    int ow = font.width(ch.options[i]) + 10;
                    boolean sel = ch.v == i, oh = ui.hover(sx, mid - 7, sx + ow, mid + 7);
                    if (sel) Draw.round(g, sx, mid - 6, sx + ow, mid + 6, 3, c(Theme.ACCENT));
                    else if (oh) Draw.round(g, sx, mid - 6, sx + ow, mid + 6, 3, c(Draw.withAlpha(Theme.RAISED, 255)));
                    textCentered(g, ch.options[i], sx + ow / 2, mid - 4, sel ? Theme.ON_ACCENT : oh ? Theme.TEXT : Theme.MUTED);
                    int idx = i;
                    ui.click(sx, mid - 7, sx + ow, mid + 7, () -> ch.set(idx));
                    sx += ow;
                }
            } else {
                Draw.round(g, rx, mid - 8, x + w, mid + 8, 4, c(Draw.withAlpha(Theme.INK, 170)));
                boolean lh = ui.hover(rx, mid - 8, rx + 16, mid + 8), rh = ui.hover(x + w - 16, mid - 8, x + w, mid + 8);
                text(g, "‹", rx + 6, mid - 4, lh ? Theme.ACCENT : Theme.MUTED);
                text(g, "›", x + w - 10, mid - 4, rh ? Theme.ACCENT : Theme.MUTED);
                textCentered(g, trim(ch.text(), ctrlW - 34), rx + ctrlW / 2, mid - 4, Theme.TEXT);
                ui.click(rx, mid - 8, rx + ctrlW / 2, mid + 8, () -> ch.set(ch.v - 1));
                ui.click(rx + ctrlW / 2, mid - 8, x + w, mid + 8, () -> ch.set(ch.v + 1));
            }
        } else if (s instanceof Setting.Text tx) {
            EditBox box = fields.get(tx);
            boolean foc = box != null && box.isFocused();
            Draw.round(g, rx, mid - 8, x + w, mid + 8, 4, c(foc ? Theme.ACCENT : Draw.withAlpha(Theme.LINE, 230)));
            Draw.round(g, rx + 1, mid - 7, x + w - 1, mid + 7, 3, c(Draw.withAlpha(Theme.SURFACE, 245)));
            if (box != null) {
                box.setX(rx + 5);
                box.setY(mid - 4);
                box.setWidth(ctrlW - 10);
                box.visible = mid - 8 >= top && mid + 8 <= bottom && fade > 0.5f;
                ui.click(rx, mid - 8, x + w, mid + 8, () -> {
                    setFocused(box);
                    box.setFocused(true);
                });
            }
        }
        return y + h + 2;
    }
}
