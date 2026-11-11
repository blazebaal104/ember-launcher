package dev.ember.overlay.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.ember.overlay.features.QolFeatures;
import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Free look on 1.21.x: Camera#setup applies the view rotation via setRotation(FF). */
@Mixin(Camera.class)
abstract class LegacyCameraMixin {
    @WrapOperation(method = "setup", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/Camera;setRotation(FF)V"))
    private void ember$freelook(Camera camera, float yRot, float xRot, Operation<Void> original) {
        if (QolFeatures.Freelook.active) original.call(camera, QolFeatures.Freelook.yaw, QolFeatures.Freelook.pitch);
        else original.call(camera, yRot, xRot);
    }
}
