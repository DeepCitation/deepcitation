import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Mock } from "bun:test";
import { DeepCitation } from "../../client/DeepCitation.js";
import { ServerError, ValidationError } from "../../client/errors.js";

const mockFetch = mock(() => {}) as Mock<typeof fetch>;
global.fetch = mockFetch;

const TEST_API_KEY = "sk-dc-test-key-00000001";

// Groups A & B test the *HTTP-layer* error path: response.ok is false, so
// DeepCitation's existing handleHttpError() runs and extracts the message from
// the nested `error.message` field in the response body.
//
// Group C tests the *application-layer* error path added by this fix:
// response.ok is true (HTTP 200) but the JSON body carries `status: "error"`
// with a flat `error` string.  These are two separate code paths with two
// different body shapes — the difference is intentional, not an inconsistency.

/** Backend returns HTTP 4xx/5xx with a URL-specific error message. */
function makeUrlErrorResponse(message: string, status = 400) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  } as unknown as Response;
}

describe("prepareUrl() — URL failure scenarios", () => {
  let client: DeepCitation;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new DeepCitation({ apiKey: TEST_API_KEY });
  });

  // ── Group A: HTTP 400 → ValidationError (14 backend scenarios) ────────────

  describe("invalid URL format", () => {
    it("throws ValidationError when URL does not start with http:// or https://", async () => {
      mockFetch.mockResolvedValueOnce(
        makeUrlErrorResponse("Invalid URL format. URL must start with http:// or https://"),
      );
      const err = await client.prepareUrl({ url: "not-a-url" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("Invalid URL format. URL must start with http:// or https://");
      expect(err.isRetryable).toBe(false);
      expect(err.statusCode).toBe(400);
    });
  });

  describe("SSRF protection", () => {
    it("throws ValidationError when URL resolves to a private/internal address", async () => {
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse("URL resolves to a private or internal address"));
      const err = await client.prepareUrl({ url: "http://192.168.1.1/" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("URL resolves to a private or internal address");
    });
  });

  describe("DNS / network failures", () => {
    it("throws ValidationError when DNS lookup fails (ENOTFOUND)", async () => {
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse("Could not reach the conversion service or URL not found"));
      const err = await client.prepareUrl({ url: "https://nonexistent-xyz.example.com/" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("Could not reach the conversion service or URL not found");
    });

    it("throws ValidationError when connection is refused (ECONNREFUSED)", async () => {
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse("Conversion service is unavailable"));
      const err = await client.prepareUrl({ url: "https://example.com" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("Conversion service is unavailable");
    });

    it("throws ValidationError when request times out (ECONNABORTED/ETIMEDOUT)", async () => {
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse("Request timed out after 2 minutes"));
      const err = await client.prepareUrl({ url: "https://example.com/slow" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("Request timed out after 2 minutes");
    });
  });

  describe("HTTP status errors from origin server", () => {
    it("throws ValidationError when origin returns 404", async () => {
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse("The URL could not be found"));
      const err = await client.prepareUrl({ url: "https://example.com/missing" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("The URL could not be found");
    });

    it("throws ValidationError when origin returns 403 (access denied to URL content)", async () => {
      // Note: URL-origin 403 is wrapped by the backend as HTTP 400 invalid-argument,
      // so the SDK throws ValidationError, not AuthenticationError.
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse("Access to the URL is forbidden"));
      const err = await client.prepareUrl({ url: "https://example.com/private" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("Access to the URL is forbidden");
    });

    it("throws ValidationError when origin returns 401 (URL content requires authentication)", async () => {
      // Note: URL-origin 401 is wrapped by the backend as HTTP 400 invalid-argument,
      // so the SDK throws ValidationError, not AuthenticationError.
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse("The URL requires authentication"));
      const err = await client.prepareUrl({ url: "https://example.com/protected" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("The URL requires authentication");
    });

    it("throws ValidationError when origin returns 5xx (server error at source)", async () => {
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse("Server error while processing the URL"));
      const err = await client.prepareUrl({ url: "https://example.com/broken" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("Server error while processing the URL");
    });

    it("throws ValidationError for other 4xx HTTP errors from origin (e.g. 410 Gone)", async () => {
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse("HTTP 410 error"));
      const err = await client.prepareUrl({ url: "https://example.com/gone" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("HTTP 410 error");
    });
  });

  describe("file / content type problems", () => {
    it("throws ValidationError when downloaded file exceeds the size limit", async () => {
      const msg = "File too large: 52428801 bytes exceeds 52428800 byte limit";
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse(msg));
      const err = await client.prepareUrl({ url: "https://example.com/huge.pdf" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe(msg);
    });

    it("throws ValidationError for unsupported content type at URL", async () => {
      mockFetch.mockResolvedValueOnce(
        makeUrlErrorResponse("Unsupported file type at URL. Accepted: PDF, Office documents, and images."),
      );
      const err = await client.prepareUrl({ url: "https://example.com/archive.zip" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("Unsupported file type at URL. Accepted: PDF, Office documents, and images.");
    });

    it("throws ValidationError when markdown fast-path receives a non-text content type", async () => {
      const msg = 'Cannot convert content type "application/octet-stream"\n to markdown';
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse(msg));
      const err = await client
        .prepareUrl({ url: "https://example.com/binary", unsafeFastUrlOutput: true })
        .catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe(msg);
    });

    it("throws ValidationError when Gotenberg HTML-to-PDF rendering fails", async () => {
      const msg = "Gotenberg service returned status 422: Chromium failed to convert URL to PDF";
      mockFetch.mockResolvedValueOnce(makeUrlErrorResponse(msg));
      const err = await client.prepareUrl({ url: "https://example.com" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe(msg);
    });
  });

  // ── Group B: HTTP 503 → ServerError ───────────────────────────────────────

  describe("service-level failures", () => {
    it("throws ServerError (retryable) when Office file conversion fails", async () => {
      mockFetch.mockResolvedValueOnce(
        makeUrlErrorResponse("Office file conversion failed. Please try again later.", 503),
      );
      const err = await client.prepareUrl({ url: "https://example.com/report.docx" }).catch(e => e);
      expect(err).toBeInstanceOf(ServerError);
      expect(err.message).toBe("Office file conversion failed. Please try again later.");
      expect(err.isRetryable).toBe(true);
      expect(err.statusCode).toBe(503);
    });
  });

  // ── Group C: Silent gap — HTTP 200 with status:error body ─────────────────
  // This group drives the implementation fix: prepareUrl() must check result.status
  // after parsing JSON, not just rely on response.ok.

  describe("HTTP 200 with status:error body (silent failure gap — requires fix)", () => {
    it("throws ValidationError instead of silently returning when body has status:error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          attachmentId: "att_err",
          status: "error",
          error: "URL resolves to a private or internal address",
          deepTextPages: [],
          metadata: { filename: "", mimeType: "", pageCount: 0, textByteSize: 0 },
        }),
      } as unknown as Response);

      const err = await client.prepareUrl({ url: "https://example.com" }).catch(e => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe("URL resolves to a private or internal address");
    });

    it("does not throw when body has status:ready (happy path unaffected by the fix)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          attachmentId: "att_url_1",
          status: "ready",
          deepTextPages: ["[Page 1]\n[L1] Content."],
          metadata: { filename: "page.pdf", mimeType: "application/pdf", pageCount: 1, textByteSize: 50 },
          urlSource: { url: "https://example.com/article", domain: "example.com" },
        }),
      } as unknown as Response);

      const result = await client.prepareUrl({ url: "https://example.com/article" });
      expect(result.status).toBe("ready");
      expect(result.attachmentId).toBe("att_url_1");
    });
  });
});
