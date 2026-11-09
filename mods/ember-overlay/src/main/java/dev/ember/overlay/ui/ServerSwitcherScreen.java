package dev.ember.overlay.ui;

import dev.ember.overlay.compat.Compat;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;
import net.minecraft.network.chat.Component;

/** Lists the servers from the multiplayer menu; one click leaves this world and joins. */
public final class ServerSwitcherScreen extends Screen {
    private final Screen parent;

    public ServerSwitcherScreen(Screen parent) {
        super(Component.literal("Switch server"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        ServerList list = new ServerList(minecraft);
        list.load();
        int w = Math.min(300, width - 40), x = (width - w) / 2, y = 40;
        int max = Math.max(1, (height - 100) / 24);
        for (int i = 0; i < Math.min(list.size(), max); i++) {
            ServerData s = list.get(i);
            boolean current = minecraft.getCurrentServer() != null && minecraft.getCurrentServer().ip.equals(s.ip);
            Button b = Button.builder(Component.literal(s.name + (current ? " (connected)" : "")), btn -> Compat.switchServer(minecraft, s))
                    .bounds(x, y + i * 24, w, 20).build();
            b.active = !current;
            addRenderableWidget(b);
        }
        if (list.size() == 0) {
            addRenderableWidget(Button.builder(Component.literal("No saved servers - add some in Multiplayer"), b -> {}).bounds(x, y, w, 20).build()).active = false;
        }
        addRenderableWidget(Button.builder(Component.literal("Back"), b -> onClose()).bounds(x, height - 30, w, 20).build());
    }

    @Override
    public void onClose() {
        Compat.setScreen(minecraft, parent);
    }
}
