package dev.ember.overlay.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.ember.overlay.features.VisualFeatures;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Zoom, minimal view bobbing, hide hand. Each hook is a single flag check when the
 * feature is off. Targets verified against 1.21.x names; with "defaultRequire": 0 a
 * missing target disables the feature instead of crashing the game.
 */
@Mixin(GameRenderer.class)
abstract class GameRendererMixin {
    @ModifyReturnValue(method = "getFov", at = @At("RETURN"))
    private float ember$zoom(float fov) {
        return VisualFeatures.applyZoom(fov);
    }

    // Only the camera's bob inside renderLevel is skipped; the hand keeps its own bob.
    @WrapWithCondition(method = "renderLevel", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/renderer/GameRenderer;bobView(Lcom/mojang/blaze3d/vertex/PoseStack;F)V"))
    private boolean ember$minimalBob(GameRenderer self, PoseStack pose, float partialTick) {
        return !VisualFeatures.minimalBob;
    }

    @Inject(method = "renderItemInHand", at = @At("HEAD"), cancellable = true)
    private void ember$hideHand(CallbackInfo ci) {
        if (VisualFeatures.hideHand) ci.cancel();
    }
}
