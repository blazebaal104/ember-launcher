package dev.ember.overlay.mixin;

import dev.ember.overlay.features.VisualFeatures;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleEngine;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ParticleEngine.class)
abstract class ParticleEngineMixin {
    @Inject(method = "add", at = @At("HEAD"), cancellable = true)
    private void ember$limit(Particle particle, CallbackInfo ci) {
        if (VisualFeatures.dropParticle()) ci.cancel();
    }
}
