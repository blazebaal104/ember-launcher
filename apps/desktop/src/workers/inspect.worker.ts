/// <reference lib="webworker" />
/**
 * CPU-heavy part of the transfer tool: unzip archives, read mod metadata, compute
 * SHA-1/SHA-512 and CurseForge fingerprints. Runs off the UI thread so dropping a
 * 300-mod pack never freezes the window. Network calls stay on the main thread
 * because Tauri IPC isn't available inside workers.
 */
import { inspectUploads, type UploadedFile } from "@ember/content-engine";

self.onmessage = async (e: MessageEvent<{ files: UploadedFile[] }>) => {
  try {
    const result = await inspectUploads(e.data.files);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
