package dev.ember.overlay.mixin;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.ember.overlay.features.VisualFeatures;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Minimal view bobbing and hide hand. Targets verified against Minecraft 26.3:
 *   private void bobView(CameraRenderState, PoseStack)
 *   private void renderItemInHand(CameraRenderState, PlayerRenderState, GpuTextureView)
 * Each hook is one flag check when its feature is off.
 */
@Mixin(GameRenderer.class)
abstract class GameRendererMixin {
    // Only the camera's bob inside renderLevel is skipped; the hand keeps its own bob.
    @WrapWithCondition(method = "renderLevel", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/renderer/GameRenderer;bobView(Lnet/minecraft/client/renderer/state/level/CameraRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;)V"))
    private boolean ember$minimalBob(GameRenderer self, CameraRenderState camera, PoseStack pose) {
        return !VisualFeatures.minimalBob;
    }

    @Inject(method = "renderItemInHand", at = @At("HEAD"), cancellable = true)
    private void ember$hideHand(CallbackInfo ci) {
        if (VisualFeatures.hideHand) ci.cancel();
    }
}
