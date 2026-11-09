package dev.ember.overlay.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.ember.overlay.features.QolFeatures;
import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** While free look is held the camera uses our yaw/pitch instead of the player's. */
@Mixin(Camera.class)
abstract class CameraMixin {
    @WrapOperation(method = "setup", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/Camera;setRotation(FF)V"))
    private void ember$freelook(Camera camera, float yRot, float xRot, Operation<Void> original) {
        if (QolFeatures.Freelook.active) original.call(camera, QolFeatures.Freelook.yaw, QolFeatures.Freelook.pitch);
        else original.call(camera, yRot, xRot);
    }
}
