import { openUrl } from "@tauri-apps/plugin-opener";
import { inTauri } from "./ipc";

export const LINKS = {
  azureAppRegistrations: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  azureFreeAccount: "https://azure.microsoft.com/free/",
  mojangReviewForm: "https://aka.ms/mce-reviewappid",
  mojangReviewInfo: "https://help.minecraft.net/hc/en-us/articles/16254801392141",
  deviceLogin: "https://microsoft.com/link",
};

export const open = (url: string) => (inTauri ? openUrl(url) : window.open(url, "_blank", "noopener"));

/** Remember that Mojang said "not approved", so Settings can show the right status. */
const KEY = "ember.signInStatus";
export const signInStatus = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(v: string | null) {
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: status just isn't remembered */
    }
  },
};
