package dev.ember.overlay.mixin;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.ember.overlay.features.VisualFeatures;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Minimal view bobbing and hide hand on 1.21.x. */
@Mixin(GameRenderer.class)
abstract class LegacyGameRendererMixin {
    @WrapWithCondition(method = "renderLevel", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/renderer/GameRenderer;bobView(Lcom/mojang/blaze3d/vertex/PoseStack;F)V"))
    private boolean ember$minimalBob(GameRenderer self, PoseStack pose, float partialTicks) {
        return !VisualFeatures.minimalBob;
    }

    @Inject(method = "renderItemInHand", at = @At("HEAD"), cancellable = true)
    private void ember$hideHand(CallbackInfo ci) {
        if (VisualFeatures.hideHand) ci.cancel();
    }
}
