import { describe, expect, test } from "bun:test";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_FILE_SIZE,
  validateFileMagicBytes,
  validateUploadFile,
} from "../utils/fileSafety";

describe("validateFileMagicBytes", () => {
  test("validates PDF magic bytes", () => {
    // %PDF
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
    expect(validateFileMagicBytes(pdf, "application/pdf")).toBe(true);
  });

  test("rejects invalid PDF", () => {
    const notPdf = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    expect(validateFileMagicBytes(notPdf, "application/pdf")).toBe(false);
  });

  test("validates PNG magic bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validateFileMagicBytes(png, "image/png")).toBe(true);
  });

  test("validates JPEG magic bytes", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(validateFileMagicBytes(jpeg, "image/jpeg")).toBe(true);
  });

  test("validates TIFF little-endian", () => {
    const tiffLE = new Uint8Array([0x49, 0x49, 0x2a, 0x00]);
    expect(validateFileMagicBytes(tiffLE, "image/tiff")).toBe(true);
  });

  test("validates TIFF big-endian", () => {
    const tiffBE = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]);
    expect(validateFileMagicBytes(tiffBE, "image/tiff")).toBe(true);
  });

  test("validates WebP with both RIFF and WEBP signatures", () => {
    // RIFF????WEBP
    const webp = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // file size (ignored)
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    ]);
    expect(validateFileMagicBytes(webp, "image/webp")).toBe(true);
  });

  test("rejects WAV file claimed as WebP (RIFF but not WEBP)", () => {
    // RIFF????WAVE — valid WAV, not WebP
    const wav = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // file size
      0x57,
      0x41,
      0x56,
      0x45, // WAVE
    ]);
    expect(validateFileMagicBytes(wav, "image/webp")).toBe(false);
  });

  test("rejects AVI file claimed as WebP (RIFF but not WEBP)", () => {
    // RIFF????AVI  — valid AVI, not WebP
    const avi = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // file size
      0x41,
      0x56,
      0x49,
      0x20, // AVI
    ]);
    expect(validateFileMagicBytes(avi, "image/webp")).toBe(false);
  });

  test("returns null for unknown MIME type", () => {
    const buffer = new Uint8Array([0x00, 0x01, 0x02]);
    expect(validateFileMagicBytes(buffer, "application/octet-stream")).toBeNull();
  });

  test("rejects buffer too short for signature", () => {
    const tiny = new Uint8Array([0x25]);
    expect(validateFileMagicBytes(tiny, "application/pdf")).toBe(false);
  });
});

describe("validateUploadFile", () => {
  const validPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

  test("returns null for valid file", () => {
    expect(validateUploadFile(1024, "application/pdf", validPdf)).toBeNull();
  });

  test("rejects oversized file", () => {
    const error = validateUploadFile(MAX_UPLOAD_FILE_SIZE + 1, "application/pdf", validPdf);
    expect(error).toContain("too large");
  });

  test("rejects unsupported MIME type", () => {
    const error = validateUploadFile(1024, "text/html", validPdf);
    expect(error).toContain("Unsupported");
  });

  test("rejects mismatched magic bytes", () => {
    const notPdf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG bytes
    const error = validateUploadFile(1024, "application/pdf", notPdf);
    expect(error).toContain("does not match");
  });
});

describe("ALLOWED_UPLOAD_MIME_TYPES", () => {
  test("includes expected types", () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("application/pdf");
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("image/png");
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("image/jpeg");
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("image/tiff");
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("image/webp");
  });
});
