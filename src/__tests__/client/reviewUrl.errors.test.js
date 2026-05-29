import { beforeEach, describe, expect, it, mock } from "bun:test";
import { DeepCitation } from "../../client/DeepCitation.js";
import { ValidationError } from "../../client/errors.js";
const mockFetch = mock(() => { });
global.fetch = mockFetch;
const TEST_API_KEY = "sk-dc-test-key-00000001";
function makeReviewError(message, status = 400) {
    return {
        ok: false,
        status,
        json: async () => ({ error: { message } }),
    };
}
function makeReviewSuccess(overrides = {}) {
    const base = {
        url: "https://example.com/paper.pdf",
        normalizedUrl: "https://example.com/paper.pdf",
        domain: "example.com",
        httpStatus: 200,
        contentType: "application/pdf",
        contentLength: 1048576,
        suggestedFilename: "paper.pdf",
        classifiedAs: "pdf",
        isCached: false,
        processingTimeMs: 180,
    };
    return {
        ok: true,
        status: 200,
        json: async () => ({ ...base, ...overrides }),
    };
}
describe("reviewUrl() — URL failure scenarios", () => {
    let client;
    beforeEach(() => {
        mockFetch.mockReset();
        client = new DeepCitation({ apiKey: TEST_API_KEY });
    });
    // ── Failure scenarios ──────────────────────────────────────────────────────
    it("throws ValidationError for invalid URL format", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("Invalid URL format. URL must start with http:// or https://"));
        const err = await client.reviewUrl({ url: "not-a-url" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("Invalid URL format. URL must start with http:// or https://");
        expect(err.isRetryable).toBe(false);
        expect(err.statusCode).toBe(400);
    });
    it("throws ValidationError for SSRF (private/internal address)", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("URL resolves to a private or internal address"));
        const err = await client.reviewUrl({ url: "http://192.168.1.1/" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("URL resolves to a private or internal address");
    });
    it("throws ValidationError for DNS failure (ENOTFOUND)", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("Could not reach the URL — domain not found"));
        const err = await client.reviewUrl({ url: "https://nonexistent-xyz.example.com/" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("Could not reach the URL — domain not found");
    });
    it("throws ValidationError for connection refused (ECONNREFUSED)", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("Connection refused — the server is not responding"));
        const err = await client.reviewUrl({ url: "https://example.com" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("Connection refused — the server is not responding");
    });
    it("throws ValidationError when review times out", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("Request timed out after 15 seconds"));
        const err = await client.reviewUrl({ url: "https://example.com/slow" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("Request timed out after 15 seconds");
    });
    it("throws ValidationError for HTTP 404", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("The URL could not be found"));
        const err = await client.reviewUrl({ url: "https://example.com/missing" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("The URL could not be found");
    });
    it("throws ValidationError for HTTP 403 (access denied)", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("Access to the URL is forbidden"));
        const err = await client.reviewUrl({ url: "https://example.com/private" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("Access to the URL is forbidden");
    });
    it("throws ValidationError for HTTP 401 (authentication required)", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("The URL requires authentication"));
        const err = await client.reviewUrl({ url: "https://example.com/protected" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("The URL requires authentication");
    });
    it("throws ValidationError for HTTP 5xx from origin", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("Server error while processing the URL"));
        const err = await client.reviewUrl({ url: "https://example.com/broken" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("Server error while processing the URL");
    });
    it("throws ValidationError for other 4xx (e.g. 410 Gone)", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("HTTP 410 error"));
        const err = await client.reviewUrl({ url: "https://example.com/gone" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("HTTP 410 error");
    });
    it("throws ValidationError when file exceeds size limit", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("File too large: 52.4 MB exceeds the 50 MB limit"));
        const err = await client.reviewUrl({ url: "https://example.com/huge.pdf" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toContain("too large");
    });
    it("throws ValidationError for unsupported content type", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("Unsupported file type at URL. Accepted: PDF, Office documents, and images."));
        const err = await client.reviewUrl({ url: "https://example.com/archive.zip" }).catch(e => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.message).toBe("Unsupported file type at URL. Accepted: PDF, Office documents, and images.");
    });
    // ── Success scenarios ──────────────────────────────────────────────────────
    it("returns ReviewUrlResponse for a PDF URL", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewSuccess());
        const result = await client.reviewUrl({ url: "https://example.com/paper.pdf" });
        expect(result.classifiedAs).toBe("pdf");
        expect(result.httpStatus).toBe(200);
        expect(result.isCached).toBe(false);
        expect(result.domain).toBe("example.com");
        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
    it("returns ReviewUrlResponse with isCached: true when URL is cached", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewSuccess({ isCached: true, cacheExpiresAt: "2026-04-11T23:59:59.999Z" }));
        const result = await client.reviewUrl({ url: "https://example.com/paper.pdf" });
        expect(result.isCached).toBe(true);
        expect(result.cacheExpiresAt).toBe("2026-04-11T23:59:59.999Z");
    });
    it("returns ReviewUrlResponse for an HTML page", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewSuccess({
            url: "https://example.com/article",
            classifiedAs: "html",
            contentType: "text/html",
            contentLength: undefined,
            suggestedFilename: undefined,
        }));
        const result = await client.reviewUrl({ url: "https://example.com/article" });
        expect(result.classifiedAs).toBe("html");
    });
    it("includes error properties: code DC_VALIDATION_ERROR, isRetryable false, statusCode 400", async () => {
        mockFetch.mockResolvedValueOnce(makeReviewError("The URL could not be found"));
        const err = await client.reviewUrl({ url: "https://example.com" }).catch(e => e);
        expect(err.code).toBe("DC_VALIDATION_ERROR");
        expect(err.isRetryable).toBe(false);
        expect(err.statusCode).toBe(400);
        expect(err.docUrl).toBe("https://docs.deepcitation.com/errors#DC_VALIDATION_ERROR");
    });
});
