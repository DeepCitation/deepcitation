/**
 * Pure JavaScript SHA-1 implementation.
 * Based on the FIPS 180-4 specification.
 * No external dependencies.
 */

function utf8Encode(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

function sha1(message: Uint8Array): string {
  // Initial hash values
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  // Pre-processing: adding padding bits
  const msgLen = message.length;
  const bitLen = msgLen * 8;

  // Calculate padded length: message + 1 (0x80) + padding + 8 (length)
  // Total must be multiple of 64 bytes (512 bits)
  const totalLen = msgLen + 1 + 8; // minimum: msg + 0x80 + 64-bit length
  const paddedLen = Math.ceil(totalLen / 64) * 64;

  // Create padded buffer
  const padded = new ArrayBuffer(paddedLen);
  const paddedView = new Uint8Array(padded);
  const dataView = new DataView(padded);

  // Copy message
  paddedView.set(message);

  // Append bit '1' (0x80)
  paddedView[msgLen] = 0x80;

  // Append length as 64-bit big-endian (in bits)
  // High 32 bits (for messages > 512MB, which we don't support)
  dataView.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  // Low 32 bits
  dataView.setUint32(paddedLen - 4, bitLen >>> 0, false);

  // Process each 512-bit (64-byte) chunk
  const w = new Uint32Array(80);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    // Break chunk into sixteen 32-bit big-endian words
    for (let i = 0; i < 16; i++) {
      w[i] = dataView.getUint32(offset + i * 4, false);
    }

    // Extend the sixteen 32-bit words into eighty 32-bit words
    for (let i = 16; i < 80; i++) {
      const val = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (val << 1) | (val >>> 31);
    }

    // Initialize working variables
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    // Main loop
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;

      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }

    // Add this chunk's hash to result
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  // Produce the final hash value (160-bit) as hex string
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
}

/**
 * Computes a SHA-1 hash of the provided data.
 * Used internally by generateCitationKey in react/utils.ts
 */
export function sha1Hash(data: unknown): string {
  try {
    if (!data) return "";
    const str = typeof data === "string" ? data : JSON.stringify(data);
    return sha1(utf8Encode(str));
  } catch (error) {
    console.error("Error in making the hash:", error);
  }
  return "";
}
