#!/usr/bin/env python3
"""Generates src/legacy-<era>/java/dev/ember/overlay/compat/Compat.java for each 1.21.x era.

The 1.21.x line changed a few APIs between releases; each era flips the relevant switches:
  hud:   "old" = Fabric HudRenderCallback (≤1.21.5), "new" = HudElementRegistry (1.21.6+)
  keys:  "string" = category is a translation key (≤1.21.8), "category" = KeyMapping.Category (1.21.9+)
  ids:   "resloc" = ResourceLocation / key.location() (≤1.21.10), "ident" = Identifier / key.identifier() (1.21.11)
  leave: "old" = level.disconnect() + mc.disconnect() (≤1.21.5), "new" = disconnectWithProgressScreen() (1.21.6+)
  debug: True = DebugScreenOverlay.showDebugScreen() exists (≤1.21.8)
  pose:  "stack" = PoseStack pushPose/popPose (≤1.21.5), "matrix" = Matrix3x2fStack (1.21.6+)
  input: "old" = mouseClicked(double, double, int) (≤1.21.8), "new" = MouseButtonEvent (1.21.9+)
  sprite: how effect icons are drawn: "atlas" = MobEffectTextureManager (1.21.1),
          "rendertype" = blitSprite(RenderType::guiTextured, atlas sprite, ...) (1.21.2-1.21.5),
          "pipeline" = blitSprite(RenderPipelines.GUI_TEXTURED, ...) (1.21.6+)
Also writes EmberScreen.java (the overlay's screen base class) for each era.
Run: python3 tools/gen_legacy_compat.py   (CI runs it before building)
"""
import os

ERAS = {
    "e0": dict(hud="old", keys="string", ids="resloc", leave="old", debug=True, pose="stack", input="old", sprite="atlas"),
    "e1": dict(hud="old", keys="string", ids="resloc", leave="old", debug=True, pose="stack", input="old", sprite="rendertype"),
    "e2": dict(hud="new", keys="string", ids="resloc", leave="new", debug=True, pose="matrix", input="old", sprite="pipeline"),
    "e3": dict(hud="new", keys="category", ids="resloc", leave="new", debug=False, pose="matrix", input="new", sprite="pipeline"),
    "e4": dict(hud="new", keys="category", ids="ident", leave="new", debug=False, pose="matrix", input="new", sprite="pipeline"),
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
        "net.minecraft.client.gui.GuiGraphics",
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
    if e["sprite"] == "atlas":
        sprite = '''    public static void effectIcon(GuiGraphics g, net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> effect, int x, int y) {
        g.blit(x, y, 0, 18, 18, Minecraft.getInstance().getMobEffectTextures().get(effect));
    }'''
    elif e["sprite"] == "rendertype":
        sprite = '''    public static void effectIcon(GuiGraphics g, net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> effect, int x, int y) {
        g.blitSprite(net.minecraft.client.renderer.RenderType::guiTextured, Minecraft.getInstance().getMobEffectTextures().get(effect), x, y, 18, 18);
    }'''
    else:
        sprite = '''    public static void effectIcon(GuiGraphics g, net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> effect, int x, int y) {
        g.blitSprite(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, net.minecraft.client.gui.Gui.getMobEffectSprite(effect), x, y, 18, 18);
    }'''
    if e["pose"] == "stack":
        pose = '''    public static void pushScale(GuiGraphics g, float x, float y, float s) {
        g.pose().pushPose();
        g.pose().translate(x, y, 0);
        g.pose().scale(s, s, 1);
    }

    public static void popScale(GuiGraphics g) {
        g.pose().popPose();
    }'''
    else:
        pose = '''    public static void pushScale(GuiGraphics g, float x, float y, float s) {
        g.pose().pushMatrix();
        g.pose().translate(x, y);
        g.pose().scale(s, s);
    }

    public static void popScale(GuiGraphics g) {
        g.pose().popMatrix();
    }'''

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
    /** CI screenshots by reading the OpenGL front buffer. */
    public static final boolean GL_SCREENSHOTS = true;
    public static final int KEY_RSHIFT = InputConstants.KEY_RSHIFT;
    public static final int KEY_C = InputConstants.KEY_C;
    public static final int KEY_LALT = InputConstants.KEY_LALT;
    public static final int KEY_M = InputConstants.KEY_M;
    private static final GfxImpl HUD_GFX = new GfxImpl();

    public static {Id} id(String path) {{
        return {new_id};
    }}

{key}

{hud}

{pose}

{sprite}

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

    /** True while the loading screen (resource reload) is showing. */
    public static boolean loading(Minecraft mc) {{
        return mc.getOverlay() != null;
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

def screen(e):
    if e["input"] == "old":
        imp = "import com.mojang.blaze3d.platform.InputConstants;\n"
        inp = '''    @Override
    public boolean mouseClicked(double x, double y, int button) {
        if (super.mouseClicked(x, y, button)) return true;
        return onMousePress(x, y, button);
    }

    @Override
    public boolean mouseReleased(double x, double y, int button) {
        onMouseRelease(x, y, button);
        return super.mouseReleased(x, y, button);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (onKey(InputConstants.getKey(keyCode, scanCode))) return true;
        return super.keyPressed(keyCode, scanCode, modifiers);
    }'''
    else:
        imp = "import com.mojang.blaze3d.platform.InputConstants;\nimport net.minecraft.client.input.KeyEvent;\nimport net.minecraft.client.input.MouseButtonEvent;\n"
        inp = '''    @Override
    public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
        if (super.mouseClicked(e, doubleClick)) return true;
        return onMousePress(e.x(), e.y(), e.button());
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent e) {
        onMouseRelease(e.x(), e.y(), e.button());
        return super.mouseReleased(e);
    }

    @Override
    public boolean keyPressed(KeyEvent e) {
        if (onKey(InputConstants.getKey(e))) return true;
        return super.keyPressed(e);
    }'''
    return f'''// GENERATED by tools/gen_legacy_compat.py — edit the generator, not this file.
package dev.ember.overlay.compat;

import dev.ember.overlay.api.Gfx;
import net.minecraft.client.gui.GuiGraphics;
{imp}import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * Base for the overlay's screens (1.21.x edition). Shared code draws through {{@link Gfx}} and
 * gets clicks as plain (x, y, button), so it never touches version-specific signatures.
 */
public abstract class EmberScreen extends Screen {{
    private final GfxImpl back = new GfxImpl(), front = new GfxImpl();

    protected EmberScreen(Component title) {{
        super(title);
    }}

    /** Drawn after the blurred background, under the vanilla widgets (text fields). */
    protected void drawBackdrop(Gfx g, int mouseX, int mouseY) {{}}

    /** Drawn over everything (tooltips). */
    protected void drawExtra(Gfx g, int mouseX, int mouseY) {{}}

    /** False to skip the vanilla blur/dim (the HUD editor shows the game as it is). */
    protected boolean vanillaBackground() {{
        return true;
    }}

    /** A click that no vanilla widget took. Return true if handled. */
    protected boolean onMousePress(double x, double y, int button) {{
        return false;
    }}

    protected void onMouseRelease(double x, double y, int button) {{}}

    /** A key press (before vanilla handles it). Return true to swallow it (key capture). */
    protected boolean onKey(InputConstants.Key key) {{
        return false;
    }}

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float delta) {{
        if (vanillaBackground()) super.renderBackground(g, mouseX, mouseY, delta);
        drawBackdrop(back.wrap(g), mouseX, mouseY);
    }}

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float delta) {{
        super.render(g, mouseX, mouseY, delta);
        drawExtra(front.wrap(g), mouseX, mouseY);
    }}

{inp}
}}
'''

here = os.path.dirname(os.path.abspath(__file__))
for era, e in ERAS.items():
    out = os.path.join(here, "..", "src", f"legacy-{era}", "java", "dev", "ember", "overlay", "compat")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "Compat.java"), "w") as f:
        f.write(render(e))
    with open(os.path.join(out, "EmberScreen.java"), "w") as f:
        f.write(screen(e))
    print("wrote", era)
