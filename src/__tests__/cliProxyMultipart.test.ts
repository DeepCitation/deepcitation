/**
 * @jest-environment node
 *
 * Runs in Node env (not jsdom) so we get Node's native Blob with `arrayBuffer()`.
 * jsdom's polyfilled Blob lacks that method, which is what `encodeMultipart`
 * calls on file entries. The CLI only ever runs in real Node anyway.
 */

/**
 * Tests for `encodeMultipart` (src/cli/proxy.ts) — the RFC 7578 serializer that
 * lets `createProxyFetch` carry FormData uploads over the hand-rolled CONNECT
 * tunnel without depending on `undici`. The Cowork sandbox can't `import("undici")`,
 * so the old FormData fallback failed there; this encoder is the replacement.
 *
 * We verify structural properties (boundary uniqueness, header ordering, closing
 * delimiter, Content-Type boundary parameter) rather than exact bytes, so future
 * cosmetic changes don't break the suite.
 */

import { describe, expect, it } from "@jest/globals";
import { encodeMultipart } from "../cli/proxy.js";

describe("encodeMultipart", () => {
  it("encodes a single string field with RFC 7578 structure", async () => {
    const fd = new FormData();
    fd.append("name", "Ada");

    const { body, contentType } = await encodeMultipart(fd);
    const s = body.toString("utf8");

    // Content-Type header carries the boundary parameter.
    expect(contentType).toMatch(/^multipart\/form-data; boundary=----dc[a-z0-9]+$/);
    const boundary = contentType.split("boundary=")[1];

    // Opening delimiter, Content-Disposition, blank line, value, closing delimiter.
    expect(s.startsWith(`--${boundary}\r\n`)).toBe(true);
    expect(s).toContain(`Content-Disposition: form-data; name="name"\r\n\r\nAda\r\n`);
    expect(s.endsWith(`--${boundary}--\r\n`)).toBe(true);
  });

  it("encodes a Blob field with Content-Type and filename", async () => {
    const fd = new FormData();
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    fd.append("file", blob, "payload.bin");

    const { body, contentType } = await encodeMultipart(fd);
    const boundary = contentType.split("boundary=")[1];

    // Find the header section for the file field
    const headerMarker = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="payload.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const headerIdx = body.indexOf(Buffer.from(headerMarker));
    expect(headerIdx).toBeGreaterThanOrEqual(0);

    // Bytes follow immediately after the header marker
    const payloadStart = headerIdx + Buffer.byteLength(headerMarker);
    const payloadBytes = body.subarray(payloadStart, payloadStart + 4);
    expect(Array.from(payloadBytes)).toEqual([0xde, 0xad, 0xbe, 0xef]);

    // A CRLF follows the bytes, then the closing delimiter
    expect(body.subarray(payloadStart + 4, payloadStart + 6).toString()).toBe("\r\n");
    expect(body.toString("utf8").endsWith(`--${boundary}--\r\n`)).toBe(true);
  });

  it("encodes mixed string + Blob fields in iteration order", async () => {
    const fd = new FormData();
    fd.append("title", "Hello");
    fd.append("attachment", new Blob([new Uint8Array([1, 2, 3])], { type: "text/plain" }), "a.txt");
    fd.append("trailing", "End");

    const { body, contentType } = await encodeMultipart(fd);
    const s = body.toString("latin1"); // latin1 preserves byte positions for mixed binary
    const boundary = contentType.split("boundary=")[1];

    const titleIdx = s.indexOf(`name="title"`);
    const attachmentIdx = s.indexOf(`name="attachment"`);
    const trailingIdx = s.indexOf(`name="trailing"`);

    expect(titleIdx).toBeGreaterThan(0);
    expect(attachmentIdx).toBeGreaterThan(titleIdx);
    expect(trailingIdx).toBeGreaterThan(attachmentIdx);

    // Exactly one closing delimiter at the very end
    const closingIdx = s.lastIndexOf(`--${boundary}--\r\n`);
    expect(closingIdx).toBe(s.length - `--${boundary}--\r\n`.length);
  });

  it("escapes CR/LF/double-quote in field names and filenames per browser behavior", async () => {
    const fd = new FormData();
    fd.append('weird"name', "v1");
    // File with embedded quote in filename
    const blob = new Blob([new Uint8Array([0])], { type: "application/octet-stream" });
    fd.append("file", blob, 'a"b.bin');

    const { body } = await encodeMultipart(fd);
    const s = body.toString("utf8");

    // Double-quote is percent-encoded as %22 inside the quoted header param
    expect(s).toContain(`name="weird%22name"`);
    expect(s).toContain(`filename="a%22b.bin"`);
  });

  it("uses unique boundaries across successive calls", async () => {
    const fd = new FormData();
    fd.append("k", "v");
    const a = await encodeMultipart(fd);
    const b = await encodeMultipart(fd);
    expect(a.contentType).not.toBe(b.contentType);
  });

  it("defaults filename to 'blob' when a Blob is appended without a name", async () => {
    const fd = new FormData();
    const blob = new Blob([new Uint8Array([7, 8, 9])], { type: "application/octet-stream" });
    fd.append("attachment", blob);

    const { body } = await encodeMultipart(fd);
    expect(body.toString("utf8")).toContain(`filename="blob"`);
  });

  it("defaults content type to application/octet-stream when Blob.type is empty", async () => {
    const fd = new FormData();
    // No type specified → Blob.type === ""
    const blob = new Blob([new Uint8Array([0xff])]);
    fd.append("file", blob, "x.bin");

    const { body } = await encodeMultipart(fd);
    expect(body.toString("utf8")).toContain(`Content-Type: application/octet-stream\r\n`);
  });
});
