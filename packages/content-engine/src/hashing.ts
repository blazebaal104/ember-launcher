/**
 * File hashing used to identify mods without trusting file names.
 *  - Modrinth indexes files by SHA-1 / SHA-512.
 *  - CurseForge indexes files by a MurmurHash2 "fingerprint" computed after
 *    stripping whitespace bytes (tab, LF, CR, space), seed = 1.
 */

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha1(bytes: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-1", bytes as Uint8Array<ArrayBuffer>));
}

export async function sha512(bytes: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-512", bytes as Uint8Array<ArrayBuffer>));
}

const isWhitespace = (b: number) => b === 9 || b === 10 || b === 13 || b === 32;

/** CurseForge fingerprint (32-bit unsigned MurmurHash2, seed 1, whitespace-normalised). */
export function curseforgeFingerprint(bytes: Uint8Array): number {
  // Pass 1: count kept bytes so we can size the buffer without copying twice.
  let len = 0;
  for (let i = 0; i < bytes.length; i++) if (!isWhitespace(bytes[i]!)) len++;
  const data = new Uint8Array(len);
  for (let i = 0, j = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (!isWhitespace(b)) data[j++] = b;
  }
  return murmur2(data, 1);
}

/** Reference MurmurHash2 (32-bit). Math.imul keeps the multiplication in uint32 space. */
export function murmur2(data: Uint8Array, seed: number): number {
  const m = 0x5bd1e995;
  const r = 24;
  let len = data.length;
  let h = (seed ^ len) >>> 0;
  let i = 0;

  while (len >= 4) {
    let k = data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16) | (data[i + 3]! << 24);
    k = Math.imul(k, m);
    k ^= k >>> r;
    k = Math.imul(k, m);
    h = Math.imul(h, m) ^ k;
    i += 4;
    len -= 4;
  }

  switch (len) {
    case 3:
      h ^= data[i + 2]! << 16;
    // falls through
    case 2:
      h ^= data[i + 1]! << 8;
    // falls through
    case 1:
      h ^= data[i]!;
      h = Math.imul(h, m);
  }

  h ^= h >>> 13;
  h = Math.imul(h, m);
  h ^= h >>> 15;
  return h >>> 0;
}
