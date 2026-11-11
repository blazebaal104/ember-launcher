package dev.ember.overlay.mixin;

import dev.ember.overlay.features.QolFeatures;
import net.minecraft.client.GuiMessageTag;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MessageSignature;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Chat filter on 1.21.x: every chat line goes through addMessage(Component, MessageSignature, GuiMessageTag). */
@Mixin(ChatComponent.class)
abstract class LegacyChatMixin {
    @Inject(method = "addMessage(Lnet/minecraft/network/chat/Component;Lnet/minecraft/network/chat/MessageSignature;Lnet/minecraft/client/GuiMessageTag;)V",
            at = @At("HEAD"), cancellable = true)
    private void ember$filter(Component message, MessageSignature signature, GuiMessageTag tag, CallbackInfo ci) {
        if (QolFeatures.shouldHide(message)) ci.cancel();
    }
}
