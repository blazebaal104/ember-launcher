package dev.ember.overlay.ui;

import dev.ember.overlay.api.Util;
import dev.ember.overlay.compat.Compat;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/** Newest screenshots of THIS instance (the folder is per instance), with open/delete. */
public final class ScreenshotScreen extends Screen {
    private final Screen parent;
    private int page;

    public ScreenshotScreen(Screen parent) {
        super(Component.literal("Screenshots"));
        this.parent = parent;
    }

    private Path dir() {
        return minecraft.gameDirectory.toPath().resolve("screenshots");
    }

    private List<Path> files() {
        try (Stream<Path> s = Files.list(dir())) {
            return s.filter(p -> p.toString().endsWith(".png"))
                    .sorted(Comparator.comparingLong((Path p) -> p.toFile().lastModified()).reversed())
                    .toList();
        } catch (IOException e) {
            return List.of();
        }
    }

    @Override
    protected void init() {
        List<Path> all = files();
        int w = Math.min(360, width - 40), x = (width - w) / 2, y = 40;
        int per = Math.max(1, (height - 110) / 24);
        int pages = Math.max(1, (all.size() + per - 1) / per);
        page = Math.min(page, pages - 1);
        for (int i = page * per, row = 0; i < Math.min(all.size(), (page + 1) * per); i++, row++) {
            Path p = all.get(i);
            addRenderableWidget(Button.builder(Component.literal(p.getFileName().toString()), b -> Util.openPath(p))
                    .bounds(x, y + row * 24, w - 64, 20).build());
            addRenderableWidget(Button.builder(Component.literal("Delete"), b -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                }
                rebuildWidgets();
            }).bounds(x + w - 60, y + row * 24, 60, 20).build());
        }
        int by = height - 30;
        addRenderableWidget(Button.builder(Component.literal("Previous"), b -> { page--; rebuildWidgets(); }).bounds(x, by, 70, 20).build()).active = page > 0;
        addRenderableWidget(Button.builder(Component.literal("Next"), b -> { page++; rebuildWidgets(); }).bounds(x + 74, by, 70, 20).build()).active = page < pages - 1;
        addRenderableWidget(Button.builder(Component.literal("Open folder"), b -> Util.openPath(dir())).bounds(x + w - 150, by, 80, 20).build());
        addRenderableWidget(Button.builder(Component.literal("Back"), b -> onClose()).bounds(x + w - 66, by, 66, 20).build());
    }

    @Override
    public void onClose() {
        Compat.setScreen(minecraft, parent);
    }
}
