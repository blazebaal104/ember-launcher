package dev.ember.overlay.mixin;

import dev.ember.overlay.features.QolFeatures;
import dev.ember.overlay.features.VisualFeatures;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Free look steals mouse movement from the player; zoom slows it down. */
@Mixin(Entity.class)
abstract class EntityTurnMixin {
    @Unique
    private static boolean ember$rescaling;

    @Inject(method = "turn", at = @At("HEAD"), cancellable = true)
    private void ember$turn(double yRot, double xRot, CallbackInfo ci) {
        if ((Object) this != Minecraft.getInstance().player) return;
        if (QolFeatures.Freelook.active) {
            QolFeatures.Freelook.turn(yRot, xRot);
            ci.cancel();
        } else if (VisualFeatures.isZooming() && !ember$rescaling) {
            ember$rescaling = true;
            ((Entity) (Object) this).turn(yRot * 0.3, xRot * 0.3);
            ember$rescaling = false;
            ci.cancel();
        }
    }
}
