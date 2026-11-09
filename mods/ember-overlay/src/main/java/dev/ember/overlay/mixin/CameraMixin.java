package dev.ember.overlay.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.ember.overlay.features.QolFeatures;
import dev.ember.overlay.features.VisualFeatures;
import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * Zoom and free look. In 26.3 the field of view is computed by Camera#calculateFov(float)
 * and the view rotation is applied in Camera#alignWithEntity(float) via setRotation(FF).
 */
@Mixin(Camera.class)
abstract class CameraMixin {
    @ModifyReturnValue(method = "calculateFov", at = @At("RETURN"))
    private float ember$zoom(float fov) {
        return VisualFeatures.applyZoom(fov);
    }

    @WrapOperation(method = "alignWithEntity", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/Camera;setRotation(FF)V"))
    private void ember$freelook(Camera camera, float yRot, float xRot, Operation<Void> original) {
        if (QolFeatures.Freelook.active) original.call(camera, QolFeatures.Freelook.yaw, QolFeatures.Freelook.pitch);
        else original.call(camera, yRot, xRot);
    }
}
