#!/usr/bin/env python3
"""Generates src/legacy-<era>/java/dev/ember/overlay/compat/Compat.java for each 1.21.x era.

The 1.21.x line changed a few APIs between releases; each era flips the relevant switches:
  hud:   "old" = Fabric HudRenderCallback (≤1.21.5), "new" = HudElementRegistry (1.21.6+)
  keys:  "string" = category is a translation key (≤1.21.8), "category" = KeyMapping.Category (1.21.9+)
  ids:   "resloc" = ResourceLocation / key.location() (≤1.21.10), "ident" = Identifier / key.identifier() (1.21.11)
  leave: "old" = level.disconnect() + mc.disconnect() (≤1.21.5), "new" = disconnectWithProgressScreen() (1.21.6+)
  debug: True = DebugScreenOverlay.showDebugScreen() exists (≤1.21.8)
Run: python3 tools/gen_legacy_compat.py   (CI runs it before building)
"""
import os

ERAS = {
    "e1": dict(hud="old", keys="string", ids="resloc", leave="old", debug=True),
    "e2": dict(hud="new", keys="string", ids="resloc", leave="new", debug=True),
    "e3": dict(hud="new", keys="category", ids="resloc", leave="new", debug=False),
    "e4": dict(hud="new", keys="category", ids="ident", leave="new", debug=False),
}

def render(e):
    Id = "ResourceLocation" if e["ids"] == "resloc" else "Identifier"
    id_import = "net.minecraft.resources.ResourceLocation" if e["ids"] == "resloc" else "net.minecraft.resources.Identifier"
    loc = "location" if e["ids"] == "resloc" else "identifier"
    imports = [
        "com.mojang.blaze3d.platform.InputConstants",
        "dev.ember.overlay.api.Gfx",
        "dev.ember.overlay.api.Util",
        "dev.ember.overlay.api.VanillaElement",
        "net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper",
        "net.fabricmc.fabric.api.client.screen.v1.ScreenEvents",
        "net.fabricmc.fabric.api.client.screen.v1.Screens",
        "net.minecraft.client.KeyMapping",
        "net.minecraft.client.Minecraft",
        "net.minecraft.client.gui.components.AbstractWidget",
        "net.minecraft.client.gui.components.ChatComponent",
        "net.minecraft.client.gui.screens.ConnectScreen",
        "net.minecraft.client.gui.screens.Screen",
        "net.minecraft.client.gui.screens.TitleScreen",
        "net.minecraft.client.multiplayer.ServerData",
        "net.minecraft.client.multiplayer.resolver.ServerAddress",
        "net.minecraft.core.BlockPos",
        "net.minecraft.network.chat.Component",
        id_import,
        "java.util.function.BooleanSupplier",
        "java.util.function.Consumer",
    ]
    if e["hud"] == "old":
        imports.append("net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback")
    else:
        imports += ["net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry",
                    "net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements"]

    if e["keys"] == "string":
        key = f'''    public static KeyMapping key(String name, int key) {{
        return KeyBindingHelper.registerKeyBinding(
                new KeyMapping("key." + MOD_ID + "." + name, InputConstants.Type.KEYSYM, key, "key.categories." + MOD_ID));
    }}'''
    else:
        key = f'''    private static KeyMapping.Category category;

    public static KeyMapping key(String name, int key) {{
        if (category == null) category = KeyMapping.Category.register(id("main"));
        return KeyBindingHelper.registerKeyBinding(
                new KeyMapping("key." + MOD_ID + "." + name, InputConstants.Type.KEYSYM, key, category));
    }}'''

    if e["hud"] == "old":
        hud = '''    /** Vanilla HUD pieces can't be swapped without mixins before 1.21.6. */
    public static final boolean CAN_CHANGE_VANILLA_HUD = false;

    public static void addHud(Consumer<Gfx> draw) {
        HudRenderCallback.EVENT.register((g, delta) -> draw.accept(HUD_GFX.wrap(g)));
    }

    public static void overrideVanilla(VanillaElement which, BooleanSupplier hide, Consumer<Gfx> drawInstead) {
        // Not supported on this version; the features are shown as unavailable.
    }'''
    else:
        hud = f'''    public static final boolean CAN_CHANGE_VANILLA_HUD = true;

    public static void addHud(Consumer<Gfx> draw) {{
        HudElementRegistry.attachElementAfter(VanillaHudElements.CHAT, id("hud"), (g, delta) -> draw.accept(HUD_GFX.wrap(g)));
    }}

    public static void overrideVanilla(VanillaElement which, BooleanSupplier hide, Consumer<Gfx> drawInstead) {{
        {Id} target = switch (which) {{
            case CROSSHAIR -> VanillaHudElements.CROSSHAIR;
            case SCOREBOARD -> VanillaHudElements.SCOREBOARD;
            case BOSS_BAR -> VanillaHudElements.BOSS_BAR;
            case STATUS_EFFECTS -> VanillaHudElements.STATUS_EFFECTS;
            case TITLE -> VanillaHudElements.TITLE_AND_SUBTITLE;
        }};
        HudElementRegistry.replaceElement(target, orig -> (g, d) -> {{
            if (!hide.getAsBoolean()) orig.render(g, d);
            else if (drawInstead != null) drawInstead.accept(HUD_GFX.wrap(g));
        }});
    }}'''

    hidden = "mc.options.hideGui || mc.getDebugOverlay().showDebugScreen()" if e["debug"] else "mc.options.hideGui"
    leave = ("if (mc.level != null) {\n            mc.level.disconnect();\n            mc.disconnect();\n        }"
             if e["leave"] == "old" else "if (mc.level != null) mc.disconnectWithProgressScreen();")
    new_id = f"{Id}.fromNamespaceAndPath(MOD_ID, path)"

    body = f'''// GENERATED by tools/gen_legacy_compat.py — edit the generator, not this file.
package dev.ember.overlay.compat;

{chr(10).join("import " + i + ";" for i in sorted(imports))}

/**
 * Minecraft 1.21.x edition of the version adapter (era settings: {e}).
 * Same static API as the 26.x edition in src/modern.
 */
public final class Compat {{
    private Compat() {{}}

    public static final String MOD_ID = Util.MOD_ID;
    public static final int UNBOUND = -1;
    public static final int KEY_RSHIFT = InputConstants.KEY_RSHIFT;
    public static final int KEY_C = InputConstants.KEY_C;
    public static final int KEY_LALT = InputConstants.KEY_LALT;
    private static final GfxImpl HUD_GFX = new GfxImpl();

    public static {Id} id(String path) {{
        return {new_id};
    }}

{key}

{hud}

    public static void afterScreenDraw(Screen screen, Consumer<Gfx> draw) {{
        GfxImpl gfx = new GfxImpl();
        ScreenEvents.afterRender(screen).register((s, g, mx, my, delta) -> draw.accept(gfx.wrap(g)));
    }}

    public static void addWidget(Screen screen, AbstractWidget widget) {{
        Screens.getButtons(screen).add(widget);
    }}

    public static void tickZoom(Minecraft mc) {{
        LegacyZoom.tick(mc);
    }}

    public static Screen screen(Minecraft mc) {{
        return mc.screen;
    }}

    public static void setScreen(Minecraft mc, Screen screen) {{
        mc.setScreen(screen);
    }}

    public static ChatComponent chat(Minecraft mc) {{
        return mc.gui.getChat();
    }}

    public static void say(Minecraft mc, String text) {{
        chat(mc).addMessage(Component.literal(text));
    }}

    public static boolean hudHidden(Minecraft mc) {{
        return {hidden};
    }}

    public static boolean mouseDown(Minecraft mc, boolean left) {{
        return left ? mc.mouseHandler.isLeftPressed() : mc.mouseHandler.isRightPressed();
    }}

    public static String biomeName(Minecraft mc, BlockPos pos) {{
        if (mc.level == null) return "";
        return mc.level.getBiome(pos).unwrapKey().map(k -> Util.prettify(k.{loc}().getPath())).orElse("Unknown");
    }}

    public static long dayTime(Minecraft mc) {{
        return mc.level == null ? 0 : mc.level.getDayTime();
    }}

    public static int lightAt(Minecraft mc, BlockPos pos) {{
        return mc.level == null ? 0 : mc.level.getMaxLocalRawBrightness(pos);
    }}

    public static String dimension(Minecraft mc) {{
        return mc.level == null ? "" : Util.prettify(mc.level.dimension().{loc}().getPath());
    }}

    public static void switchServer(Minecraft mc, ServerData target) {{
        {leave}
        ConnectScreen.startConnecting(new TitleScreen(), mc, ServerAddress.parseString(target.ip), target, false, null);
    }}
}}
'''
    return body

here = os.path.dirname(os.path.abspath(__file__))
for era, e in ERAS.items():
    out = os.path.join(here, "..", "src", f"legacy-{era}", "java", "dev", "ember", "overlay", "compat")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "Compat.java"), "w") as f:
        f.write(render(e))
    print("wrote", era)
