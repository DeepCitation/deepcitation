/**
 * File content validation via magic bytes (file signatures).
 *
 * Client-supplied MIME types (Content-Type headers) are trivially spoofable.
 * This module checks actual file bytes to verify content matches claimed type.
 */

/** A magic byte signature: contiguous bytes at a fixed offset. */
interface MagicSignature {
  offset: number;
  bytes: number[];
}

/**
 * A file type definition with one or more signature checks.
 * All signatures must match for the file to be considered valid.
 */
interface FileTypeSignature {
  signatures: MagicSignature[];
}

/**
 * Known file type signatures.
 *
 * Each entry maps a MIME type to one or more valid signature sets.
 * A file matches if ANY of the signature sets passes (all signatures
 * within a set must match).
 */
const FILE_SIGNATURES: Record<string, FileTypeSignature[]> = {
  "application/pdf": [
    { signatures: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }] }, // %PDF
  ],
  "image/png": [
    { signatures: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }] }, // .PNG
  ],
  "image/jpeg": [
    { signatures: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] }, // SOI marker
  ],
  "image/tiff": [
    { signatures: [{ offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] }] }, // II* (little-endian)
    { signatures: [{ offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] }] }, // MM* (big-endian)
  ],
  "image/webp": [
    {
      // WebP uses RIFF container: bytes 0-3 = "RIFF", bytes 8-11 = "WEBP"
      // Checking only RIFF would accept WAV, AVI, and other RIFF formats.
      signatures: [
        { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
        { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
      ],
    },
  ],
};

/** MIME types accepted by the DeepCitation upload pipeline. */
export const ALLOWED_UPLOAD_MIME_TYPES = Object.keys(FILE_SIGNATURES);

/** Maximum upload file size in bytes (50 MB). */
export const MAX_UPLOAD_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Check whether a buffer's magic bytes match a single signature set.
 */
function matchesSignatureSet(buffer: Uint8Array, sigSet: FileTypeSignature): boolean {
  return sigSet.signatures.every(sig => sig.bytes.every((b, i) => buffer[sig.offset + i] === b));
}

/**
 * Validate that a file buffer's actual content matches the claimed MIME type.
 *
 * @returns `true` if the magic bytes match, `false` if they don't,
 *          `null` if the MIME type has no known signature (can't validate).
 *
 * @example
 * ```typescript
 * const buffer = Buffer.from(arrayBuffer);
 * const valid = validateFileMagicBytes(buffer, "image/webp");
 * if (valid === false) {
 *   // File content does not match declared type
 * }
 * ```
 */
export function validateFileMagicBytes(buffer: Uint8Array, mimeType: string): boolean | null {
  const signatureSets = FILE_SIGNATURES[mimeType];
  if (!signatureSets) return null; // Unknown type — can't validate

  // Check minimum buffer length against all signatures
  for (const sigSet of signatureSets) {
    const maxNeeded = Math.max(...sigSet.signatures.map(s => s.offset + s.bytes.length));
    if (buffer.length < maxNeeded) continue; // Too short for this signature
    if (matchesSignatureSet(buffer, sigSet)) return true;
  }

  return false;
}

/**
 * Validate file size and MIME type for upload.
 *
 * @returns `null` if valid, or an error string if invalid.
 *
 * @example
 * ```typescript
 * const error = validateUploadFile(file.size, file.type, buffer);
 * if (error) {
 *   return NextResponse.json({ error }, { status: 400 });
 * }
 * ```
 */
export function validateUploadFile(fileSize: number, mimeType: string, buffer: Uint8Array): string | null {
  if (fileSize > MAX_UPLOAD_FILE_SIZE) {
    return "File too large. Maximum size is 50MB.";
  }

  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType)) {
    return "Unsupported file type. Allowed: PDF, PNG, JPEG, TIFF, WebP.";
  }

  const magicValid = validateFileMagicBytes(buffer, mimeType);
  if (magicValid === false) {
    return "File content does not match its declared type.";
  }

  return null;
}
