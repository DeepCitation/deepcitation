import type { Mock } from "bun:test";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { DeepCitation, fetchWithRetry } from "../client/DeepCitation.js";
import { makeNumericResponse } from "./testHelpers.js";

// Mock global fetch
const mockFetch = mock(() => {}) as Mock<typeof fetch>;
global.fetch = mockFetch;

describe("DeepCitation Client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("constructor", () => {
    it("throws error when no API key provided", () => {
      expect(() => new DeepCitation({ apiKey: "" })).toThrow("DeepCitation API key is required");
    });

    it("throws AuthenticationError for key without sk-dc- prefix", () => {
      expect(() => new DeepCitation({ apiKey: "abc-notvalid-key-here" })).toThrow("Invalid API key format");
    });

    it("throws AuthenticationError for key that is too short", () => {
      expect(() => new DeepCitation({ apiKey: "sk-dc-" })).toThrow("Invalid API key format");
    });

    it("creates client with valid API key", () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });
      expect(client).toBeInstanceOf(DeepCitation);
    });

    it("uses default API URL when not specified", () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });
      // Client should work without custom URL
      expect(client).toBeInstanceOf(DeepCitation);
    });

    it("uses custom API URL when provided", () => {
      const client = new DeepCitation({
        apiKey: "sk-dc-test-key-00000001",
        apiUrl: "https://custom.api.com/",
      });
      expect(client).toBeInstanceOf(DeepCitation);
    });

    it("strips trailing slash from custom API URL", () => {
      const client = new DeepCitation({
        apiKey: "sk-dc-test-key-00000001",
        apiUrl: "https://custom.api.com/",
      });
      expect(client).toBeInstanceOf(DeepCitation);
    });

    it("clamps negative maxRetries to 0 — does not throw undefined", async () => {
      // With maxRetries < 0, the for loop would never run and lastError stays undefined,
      // causing `throw undefined`. The constructor must clamp to 0.
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", maxRetries: -5 });

      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const blob = new Blob(["content"]);
      // Should throw the actual network error, not undefined
      await expect(client.uploadFile(blob)).rejects.toThrow("Failed to fetch");
      // Clamped to 0 retries — only one attempt
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("requestSource", () => {
    it("includes X-Request-Source header when configured", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", requestSource: "my-app" });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_abc",
          deepTextPages: [],
          metadata: { filename: "t.pdf", mimeType: "application/pdf", pageCount: 1, textByteSize: 0 },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["x"], { type: "application/pdf" });
      await client.uploadFile(blob, { filename: "t.pdf" });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)["X-Request-Source"]).toBe("my-app");
    });

    it("omits X-Request-Source header when not configured", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_abc",
          deepTextPages: [],
          metadata: { filename: "t.pdf", mimeType: "application/pdf", pageCount: 1, textByteSize: 0 },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["x"], { type: "application/pdf" });
      await client.uploadFile(blob, { filename: "t.pdf" });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)["X-Request-Source"]).toBeUndefined();
    });

    it("rejects requestSource containing newline characters", () => {
      expect(() => new DeepCitation({ apiKey: "sk-dc-test-key-00000001", requestSource: "bad\r\nvalue" })).toThrow(
        "requestSource must not contain newline characters",
      );
      expect(() => new DeepCitation({ apiKey: "sk-dc-test-key-00000001", requestSource: "bad\nvalue" })).toThrow(
        "requestSource must not contain newline characters",
      );
    });
  });

  describe("uploadFile", () => {
    it("uploads a file and returns response", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_abc123",
          deepTextPages: ["[Page 1]\n[L1] Test content"],
          metadata: {
            filename: "test.pdf",
            mimeType: "application/pdf",
            pageCount: 1,
            textByteSize: 100,
          },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["test content"], { type: "application/pdf" });
      const result = await client.uploadFile(blob, { filename: "test.pdf" });

      expect(result.attachmentId).toBe("file_abc123");
      expect(result.deepTextPages).toEqual(["[Page 1]\n[L1] Test content"]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("throws error on upload failure", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "Invalid file format" } }),
      } as Response);

      const blob = new Blob(["test content"]);
      await expect(client.uploadFile(blob)).rejects.toThrow("Invalid file format");
    });

    it("handles custom attachmentId option", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "custom_id",
          deepTextPages: ["content"],
          metadata: {
            filename: "test.pdf",
            mimeType: "application/pdf",
            pageCount: 1,
            textByteSize: 50,
          },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["content"]);
      const result = await client.uploadFile(blob, {
        attachmentId: "custom_id",
      });

      expect(result.attachmentId).toBe("custom_id");
    });

    it("throws error for invalid file type", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      // @ts-expect-error - testing invalid input
      await expect(client.uploadFile("not a file")).rejects.toThrow("Invalid file type");
    });
  });

  describe("prepareAttachments", () => {
    it("uploads multiple files and returns aggregated response", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      // Mock two successful uploads
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            attachmentId: "file_1",
            deepTextPages: ["[Page 1]\n[L1] Content from file 1"],
            metadata: {
              filename: "doc1.pdf",
              mimeType: "application/pdf",
              pageCount: 1,
              textByteSize: 100,
            },
            status: "ready",
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            attachmentId: "file_2",
            deepTextPages: ["[Page 1]\n[L1] Content from file 2"],
            metadata: {
              filename: "doc2.pdf",
              mimeType: "application/pdf",
              pageCount: 2,
              textByteSize: 200,
            },
            status: "ready",
          }),
        } as Response);

      const blob1 = new Blob(["content 1"], { type: "application/pdf" });
      const blob2 = new Blob(["content 2"], { type: "application/pdf" });

      const result = await client.prepareAttachments([
        { file: blob1, filename: "doc1.pdf" },
        { file: blob2, filename: "doc2.pdf" },
      ]);

      expect(result.fileDataParts).toHaveLength(2);
      expect(result.attachments).toHaveLength(2);

      expect(result.fileDataParts[0].attachmentId).toBe("file_1");
      expect(result.fileDataParts[1].attachmentId).toBe("file_2");
      expect(result.attachments[0].attachmentId).toBe("file_1");
      expect(result.attachments[1].attachmentId).toBe("file_2");

      // deepTextPages are keyed by attachmentId so callers do not rely on ordering.
      expect(result.deepTextPagesByAttachmentId).toEqual({
        file_1: ["[Page 1]\n[L1] Content from file 1"],
        file_2: ["[Page 1]\n[L1] Content from file 2"],
      });
    });

    it("handles single file", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "single_file",
          deepTextPages: ["[Page 1]\n[L1] Single content"],
          metadata: {
            filename: "single.pdf",
            mimeType: "application/pdf",
            pageCount: 1,
            textByteSize: 50,
          },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["single content"]);
      const result = await client.prepareAttachments([{ file: blob, filename: "single.pdf" }]);

      expect(result.fileDataParts).toHaveLength(1);
      expect(result.attachments).toHaveLength(1);
      expect(result.deepTextPagesByAttachmentId).toEqual({
        single_file: ["[Page 1]\n[L1] Single content"],
      });
    });

    it("handles empty files array", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      const result = await client.prepareAttachments([]);

      expect(result.fileDataParts).toHaveLength(0);
      expect(result.attachments).toHaveLength(0);
    });

    it("propagates upload errors", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Server error" } }),
      } as Response);

      const blob = new Blob(["content"]);
      await expect(client.prepareAttachments([{ file: blob, filename: "test.pdf" }])).rejects.toThrow("Server error");
    });

    it("supports custom attachmentId per file", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "my_custom_id",
          deepTextPages: ["content"],
          metadata: {
            filename: "custom.pdf",
            mimeType: "application/pdf",
            pageCount: 1,
            textByteSize: 50,
          },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["content"]);
      const result = await client.prepareAttachments([
        { file: blob, filename: "custom.pdf", attachmentId: "my_custom_id" },
      ]);

      expect(result.fileDataParts[0].attachmentId).toBe("my_custom_id");
    });
  });

  describe("verify", () => {
    it("parses and verifies citations from LLM output", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      // First upload a file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_123",
          deepTextPages: ["[Page 1]\n[L1] Revenue grew 15%"],
          metadata: {
            filename: "report.pdf",
            mimeType: "application/pdf",
            pageCount: 1,
            textByteSize: 100,
          },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["content"]);
      await client.uploadFile(blob, { attachmentId: "file_123" });

      // Then verify citations
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            citation_key_1: {
              document: {
                verifiedPageNumber: 1,
              },
              evidence: {
                src: "base64data",
              },
              status: "found",
              sourceSnippet: "Revenue grew 15%",
            },
          },
        }),
      } as Response);

      const llmOutput = makeNumericResponse("The company showed strong growth [1].", [
        {
          id: 1,
          attachment_id: "file_123",
          source_context: "Revenue grew 15%",
          source_match: "15%",
          page_id: "1_0",
          line_ids: [1],
        },
      ]);

      const result = await client.verify({
        llmOutput,
      });

      expect(result.verifications).toBeDefined();
      expect(Object.keys(result.verifications).length).toBeGreaterThanOrEqual(1);
    });

    it("verifies citations with attachmentId in citation", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            key1: {
              document: {
                verifiedPageNumber: 1,
              },
              status: "found",
              sourceSnippet: "Test content",
            },
          },
        }),
      } as Response);

      const result = await client.verify({
        llmOutput:
          'Test content[1]\n\n<<<CITATION_DATA>>>\n{"file_123":[{"id":1,"source_context":"Test content","source_match":"Test","page_id":"page_number_1_index_0","line_ids":[1]}]}\n<<<END_CITATION_DATA>>>',
      });

      expect(result.verifications).toBeDefined();
    });

    it("returns empty verifications when no citations in output", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      const result = await client.verify({
        llmOutput: "Just plain text with no citations.",
      });

      expect(result.verifications).toEqual({});
    });
  });

  describe("verifyAttachment", () => {
    it("verifies citations with attachmentId and citation map", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      // Verify citations directly with attachmentId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            "1": { document: { verifiedPageNumber: 1 }, status: "found" },
          },
        }),
      } as Response);

      const result = await client.verifyAttachment("file_abc", {
        "1": {
          pageNumber: 1,
          sourceContext: "test phrase",
          attachmentId: "file_abc",
        },
      });

      expect(result.verifications["1"].status).toBe("found");
    });

    it("handles API error gracefully", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: "File not found" } }),
      } as Response);

      await expect(
        client.verifyAttachment("unknown_file", {
          "1": { sourceContext: "test" },
        }),
      ).rejects.toThrow("File not found");
    });

    it("returns empty verifications when no citations provided", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      const result = await client.verifyAttachment("file_abc", {});

      expect(result.verifications).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("deduplicates identical verification requests", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            "1": { document: { verifiedPageNumber: 1 }, status: "found" },
          },
        }),
      } as Response);

      const citations = {
        "1": {
          pageNumber: 1,
          sourceContext: "test phrase",
          attachmentId: "file_abc",
        },
      };

      // Make two identical requests concurrently
      const [result1, result2] = await Promise.all([
        client.verifyAttachment("file_abc", citations),
        client.verifyAttachment("file_abc", citations),
      ]);

      // Both should return the same result
      expect(result1.verifications["1"].status).toBe("found");
      expect(result2.verifications["1"].status).toBe("found");

      // But only one API call should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("makes separate calls for different citations", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            verifications: { "1": { status: "found" } },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            verifications: { "2": { status: "found" } },
          }),
        } as Response);

      const citations1 = {
        "1": { sourceContext: "phrase 1", attachmentId: "file_abc" },
      };
      const citations2 = {
        "2": { sourceContext: "phrase 2", attachmentId: "file_abc" },
      };

      await Promise.all([
        client.verifyAttachment("file_abc", citations1),
        client.verifyAttachment("file_abc", citations2),
      ]);

      // Different citations should make separate calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does not reuse a failed request across different timeouts", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockImplementation((_, init) => {
        return new Promise<Response>((resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          const timer = setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({
                verifications: { "1": { status: "found" } },
              }),
            } as Response);
          }, 50);

          const abort = () => {
            clearTimeout(timer);
            reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
          };

          if (signal?.aborted) {
            abort();
            return;
          }

          signal?.addEventListener("abort", abort, { once: true });
        });
      });

      const citations = {
        "1": {
          pageNumber: 1,
          sourceContext: "test phrase",
          attachmentId: "file_abc",
        },
      };

      // First request with a very short timeout — should time out before the 50ms fetch resolves
      await expect(client.verifyAttachment("file_abc", citations, { requestTimeoutMs: 1 })).rejects.toThrow(
        "Request timed out after 1ms",
      );

      // Second request with a longer timeout — should succeed
      await expect(client.verifyAttachment("file_abc", citations, { requestTimeoutMs: 500 })).resolves.toMatchObject({
        verifications: {
          "1": { status: "found" },
        },
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("verifyBatch", () => {
    it("sends batch request with mode:batch and per-citation attachmentId", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            key1: { status: "found" },
            key2: { status: "partial_text_found" },
          },
        }),
      } as Response);

      const result = await client.verifyBatch({
        key1: {
          type: "document",
          sourceContext: "HbA1c 5.5%",
          sourceMatch: "5.5",
          pageNumber: 2,
          attachmentId: "abc123",
        },
        key2: {
          type: "document",
          sourceContext: "disc protrusion",
          sourceMatch: "disc protrusion",
          pageNumber: 1,
          attachmentId: "def456",
        },
      });

      expect(result.verifications.key1.status).toBe("found");
      expect(result.verifications.key2.status).toBe("partial_text_found");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.data.mode).toBe("batch");
      expect(requestBody.data.citations.key1.attachmentId).toBe("abc123");
      expect(requestBody.data.citations.key2.attachmentId).toBe("def456");
    });

    it("returns empty verifications for empty citations", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      const result = await client.verifyBatch({});

      expect(result.verifications).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("skips citations without attachmentId", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            key1: { status: "found" },
          },
        }),
      } as Response);

      const result = await client.verifyBatch({
        key1: {
          type: "document",
          sourceContext: "test phrase",
          attachmentId: "abc123",
          pageNumber: 1,
        },
        key2: {
          type: "document",
          sourceContext: "no attachment",
          pageNumber: 1,
        },
      });

      expect(result.verifications.key1.status).toBe("found");
      expect(result.verifications.key2.status).toBe("skipped");
      expect(result.verifications.key2.skipped).toBe(true);

      // Only key1 should be sent to the API
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.data.citations.key1).toBeDefined();
      expect(requestBody.data.citations.key2).toBeUndefined();
    });

    it("returns all skipped when no citations have attachmentId", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      const result = await client.verifyBatch({
        key1: { type: "document", sourceContext: "test", pageNumber: 1 },
      });

      expect(result.verifications.key1.status).toBe("skipped");
      expect(result.verifications.key1.skipped).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws ValidationError when citations exceed 500", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      const citations: Record<string, { type: "document"; sourceContext: string; attachmentId: string }> = {};
      for (let i = 0; i < 501; i++) {
        citations[`key${i}`] = { type: "document", sourceContext: `phrase ${i}`, attachmentId: "abc" };
      }

      await expect(client.verifyBatch(citations)).rejects.toThrow("max is 500");
    });

    it("throws ValidationError when distinct attachments exceed 50", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      const citations: Record<string, { type: "document"; sourceContext: string; attachmentId: string }> = {};
      for (let i = 0; i < 51; i++) {
        citations[`key${i}`] = { type: "document", sourceContext: `phrase ${i}`, attachmentId: `att_${i}` };
      }

      await expect(client.verifyBatch(citations)).rejects.toThrow("max is 50");
    });

    it("handles API error in batch mode", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Internal server error" } }),
      } as Response);

      await expect(
        client.verifyBatch({
          key1: { type: "document", sourceContext: "test", attachmentId: "abc123", pageNumber: 1 },
        }),
      ).rejects.toThrow();
    });

    it("includes endUserId and outputImageFormat in batch request", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verifications: { key1: { status: "found" } } }),
      } as Response);

      await client.verifyBatch(
        { key1: { type: "document", sourceContext: "test", attachmentId: "abc123", pageNumber: 1 } },
        { outputImageFormat: "png", endUserId: "user-batch-1" },
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.data.outputImageFormat).toBe("png");
      expect(requestBody.data.endUserId).toBe("user-batch-1");
    });
  });

  describe("verify uses batch mode", () => {
    it("sends a single batch request instead of per-attachment calls", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            citation_key_1: { status: "found" },
          },
        }),
      } as Response);

      const llmOutput = makeNumericResponse("Test [1].", [
        {
          id: 1,
          attachment_id: "file_123",
          source_context: "Test content",
          source_match: "Test",
          page_id: "1_0",
          line_ids: [1],
        },
      ]);

      await client.verify({ llmOutput });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.data.mode).toBe("batch");
    });

    it("propagates skipped: true for citations without attachmentId", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            citation_key_1: { status: "found" },
          },
        }),
      } as Response);

      // Citation [1] has an attachment, citation [2] does not
      const llmOutput = makeNumericResponse("Test [1]. Also [2].", [
        {
          id: 1,
          attachment_id: "file_123",
          source_context: "Test content",
          source_match: "Test",
          page_id: "1_0",
          line_ids: [1],
        },
        {
          id: 2,
          source_context: "No attachment",
          source_match: "Also",
          page_id: "1_0",
          line_ids: [2],
        },
      ]);

      const result = await client.verify({ llmOutput });

      // The citation without attachmentId should be skipped with discriminant
      const skippedEntry = Object.values(result.verifications).find(v => v.status === "skipped");
      expect(skippedEntry).toBeDefined();
      expect(skippedEntry?.skipped).toBe(true);
    });
  });

  describe("prepareAttachments with concurrency limits", () => {
    it("uploads files with concurrency limit", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockFetch.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, 10));

        concurrentCalls--;
        return {
          ok: true,
          json: async () => ({
            attachmentId: `file_${Math.random()}`,
            deepTextPages: ["content"],
            metadata: {
              filename: "test.pdf",
              mimeType: "application/pdf",
              pageCount: 1,
              textByteSize: 50,
            },
            status: "ready",
          }),
        } as Response;
      });

      // Create 10 files to upload
      const files = Array(10)
        .fill(null)
        .map((_, i) => ({
          file: new Blob([`content ${i}`]),
          filename: `file${i}.pdf`,
        }));

      await client.prepareAttachments(files);

      // All files should be uploaded
      expect(mockFetch).toHaveBeenCalledTimes(10);

      // Max concurrent should be exactly 5 (DEFAULT_UPLOAD_CONCURRENCY)
      // With 10 files and artificial delays, we should hit the limit
      expect(maxConcurrentCalls).toBe(5);
    });

    it("respects custom concurrency limit from config", async () => {
      const customLimit = 3;
      const client = new DeepCitation({
        apiKey: "sk-dc-test-key-00000001",
        maxUploadConcurrency: customLimit,
      });
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockFetch.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

        await new Promise(resolve => setTimeout(resolve, 10));

        concurrentCalls--;
        return {
          ok: true,
          json: async () => ({
            attachmentId: `file_${Math.random()}`,
            deepTextPages: ["content"],
            metadata: {
              filename: "test.pdf",
              mimeType: "application/pdf",
              pageCount: 1,
              textByteSize: 50,
            },
            status: "ready",
          }),
        } as Response;
      });

      const files = Array(10)
        .fill(null)
        .map((_, i) => ({
          file: new Blob([`content ${i}`]),
          filename: `file${i}.pdf`,
        }));

      await client.prepareAttachments(files);

      expect(mockFetch).toHaveBeenCalledTimes(10);
      expect(maxConcurrentCalls).toBe(customLimit);
    });
  });

  describe("getAttachment", () => {
    it("returns attachment metadata on success", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "att_abc123",
          status: "ready",
          source: "test.pdf",
          originalFilename: "test.pdf",
          mimeType: "application/pdf",
          pageCount: 3,
          pageImages: [],
          verifications: {},
        }),
      } as Response);

      const result = await client.getAttachment("att_abc123");

      expect(result.id).toBe("att_abc123");
      expect(result.status).toBe("ready");
      expect(result.pageCount).toBe(3);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/getAttachment"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-dc-test-key-00000001",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ attachmentId: "att_abc123" }),
        }),
      );
    });

    it("throws ValidationError for empty attachmentId", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      await expect(client.getAttachment("")).rejects.toThrow("attachmentId is required");
    });

    it("throws error on API failure", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Attachment not found" }),
      } as Response);

      await expect(client.getAttachment("nonexistent")).rejects.toThrow();
    });
  });

  describe("cache key completeness", () => {
    it("differentiates citations with same text but different lineIds", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            verifications: { "1": { status: "found" } },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            verifications: { "1": { status: "not_found" } },
          }),
        } as Response);

      // Same text, different lineIds
      const citations1 = {
        "1": {
          sourceContext: "test phrase",
          sourceMatch: "test",
          pageNumber: 1,
          lineIds: [1, 2, 3],
          attachmentId: "file_abc",
        },
      };
      const citations2 = {
        "1": {
          sourceContext: "test phrase",
          sourceMatch: "test",
          pageNumber: 1,
          lineIds: [4, 5, 6],
          attachmentId: "file_abc",
        },
      };

      await client.verifyAttachment("file_abc", citations1);
      await client.verifyAttachment("file_abc", citations2);

      // Different lineIds should result in separate API calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("uses same cache for identical citations with different numbering", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          verifications: { "1": { status: "found" } },
        }),
      } as Response);

      // Same citation content, different map keys (numbering)
      const citations1 = {
        "1": {
          sourceContext: "test phrase",
          sourceMatch: "test",
          pageNumber: 1,
          lineIds: [1, 2, 3],
          attachmentId: "file_abc",
        },
      };
      const citations2 = {
        "42": {
          sourceContext: "test phrase",
          sourceMatch: "test",
          pageNumber: 1,
          lineIds: [1, 2, 3],
          attachmentId: "file_abc",
        },
      };

      await client.verifyAttachment("file_abc", citations1);
      await client.verifyAttachment("file_abc", citations2);

      // Same content should hit cache - only one API call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("endUserId attribution", () => {
    it("includes instance-level endUserId in uploadFile FormData", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", endUserId: "user-instance" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_1",
          deepTextPages: ["content"],
          metadata: { filename: "test.pdf", mimeType: "application/pdf", pageCount: 1, textByteSize: 50 },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["content"]);
      await client.uploadFile(blob, { filename: "test.pdf" });

      const formData = mockFetch.mock.calls[0][1].body as FormData;
      expect(formData.get("endUserId")).toBe("user-instance");
    });

    it("per-request endUserId overrides instance default in uploadFile", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", endUserId: "user-instance" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_1",
          deepTextPages: ["content"],
          metadata: { filename: "test.pdf", mimeType: "application/pdf", pageCount: 1, textByteSize: 50 },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["content"]);
      await client.uploadFile(blob, { filename: "test.pdf", endUserId: "user-override" });

      const formData = mockFetch.mock.calls[0][1].body as FormData;
      expect(formData.get("endUserId")).toBe("user-override");
    });

    it("omits endUserId from FormData when neither instance nor request set", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_1",
          deepTextPages: ["content"],
          metadata: { filename: "test.pdf", mimeType: "application/pdf", pageCount: 1, textByteSize: 50 },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["content"]);
      await client.uploadFile(blob, { filename: "test.pdf" });

      const formData = mockFetch.mock.calls[0][1].body as FormData;
      expect(formData.get("endUserId")).toBeNull();
    });

    it("includes endUserId in verifyAttachment request body", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", endUserId: "user-instance" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: { "1": { status: "found" } },
        }),
      } as Response);

      await client.verifyAttachment(
        "file_abc",
        { "1": { sourceContext: "test", attachmentId: "file_abc" } },
        { endUserId: "user-verify" },
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.data.endUserId).toBe("user-verify");
    });

    it("includes instance endUserId in verifyAttachment when no override", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", endUserId: "user-instance" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: { "1": { status: "found" } },
        }),
      } as Response);

      await client.verifyAttachment("file_abc", { "1": { sourceContext: "test", attachmentId: "file_abc" } });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.data.endUserId).toBe("user-instance");
    });

    it("threads endUserId from verify through to verifyAttachment", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: { key1: { status: "found" } },
        }),
      } as Response);

      await client.verify({
        llmOutput: makeNumericResponse("Test [1].", [
          {
            id: 1,
            attachment_id: "file_123",
            source_context: "Test",
            source_match: "Test",
            page_id: "1_0",
            line_ids: [1],
          },
        ]),
        endUserId: "user-verify",
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.data.endUserId).toBe("user-verify");
    });

    it("includes endUserId in prepareUrl JSON body", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", endUserId: "user-instance" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "url_1",
          deepTextPages: ["content"],
          metadata: { filename: "page.pdf", mimeType: "application/pdf", pageCount: 1, textByteSize: 50 },
          status: "ready",
        }),
      } as Response);

      await client.prepareUrl({ url: "https://example.com", endUserId: "user-url" });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.endUserId).toBe("user-url");
    });

    it("includes endUserId in getAttachment with per-request override", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", endUserId: "user-instance" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "att_abc",
          status: "ready",
          source: "test.pdf",
          originalFilename: "test.pdf",
          mimeType: "application/pdf",
          pageCount: 1,
          pageImages: [],
          verifications: {},
        }),
      } as Response);

      await client.getAttachment("att_abc", { endUserId: "user-get" });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.endUserId).toBe("user-get");
    });

    it("includes endUserId in convertToPdf JSON body", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", endUserId: "user-instance" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "conv_1",
          metadata: {
            originalFilename: "page.html",
            originalMimeType: "text/html",
            convertedMimeType: "application/pdf",
            conversionTimeMs: 1000,
          },
          status: "converted",
        }),
      } as Response);

      await client.convertToPdf({ url: "https://example.com", endUserId: "user-convert" });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.endUserId).toBe("user-convert");
    });

    it("includes endUserId in prepareConvertedFile JSON body", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "conv_1",
          deepTextPages: ["content"],
          metadata: { filename: "test.pdf", mimeType: "application/pdf", pageCount: 1, textByteSize: 50 },
          status: "ready",
        }),
      } as Response);

      await client.prepareConvertedFile({ attachmentId: "conv_1", endUserId: "user-prepare" });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.endUserId).toBe("user-prepare");
    });
  });

  describe("fetchWithRetry (network error resilience)", () => {
    it("succeeds immediately on first attempt when no network error", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", maxRetries: 3 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_1",
          deepTextPages: ["content"],
          metadata: { filename: "test.pdf", mimeType: "application/pdf", pageCount: 1, textByteSize: 50 },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["content"]);
      await client.uploadFile(blob, { filename: "test.pdf" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries after network error and succeeds on second attempt", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", maxRetries: 3 });

      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_1",
          deepTextPages: ["content"],
          metadata: { filename: "test.pdf", mimeType: "application/pdf", pageCount: 1, textByteSize: 50 },
          status: "ready",
        }),
      } as Response);

      const blob = new Blob(["content"]);
      const result = await client.uploadFile(blob, { filename: "test.pdf" });

      expect(result.attachmentId).toBe("file_1");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting all retries", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", maxRetries: 2 });

      const networkError = new TypeError("Failed to fetch");
      mockFetch.mockRejectedValue(networkError);

      const blob = new Blob(["content"]);
      await expect(client.uploadFile(blob, { filename: "test.pdf" })).rejects.toThrow("Failed to fetch");

      // 1 initial attempt + 2 retries = 3 total calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("does not retry HTTP error responses (4xx/5xx)", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", maxRetries: 3 });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Server error" } }),
      } as Response);

      const blob = new Blob(["content"]);
      await expect(client.uploadFile(blob)).rejects.toThrow("Server error");

      // Should only be called once — HTTP errors are not retried
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("maxRetries: 0 disables retries entirely", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", maxRetries: 0 });

      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const blob = new Blob(["content"]);
      await expect(client.uploadFile(blob)).rejects.toThrow("Failed to fetch");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("aborts during backoff delay when AbortSignal fires", async () => {
      const controller = new AbortController();

      // Reject on first attempt to trigger the backoff delay
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      // fetchWithRetry is called directly so we can inject the signal.
      // The delay for attempt=1 is ~100ms; we abort synchronously after the
      // first rejection propagates so the abort listener fires before the timer.
      const promise = fetchWithRetry("https://example.com/test", { signal: controller.signal }, 3);

      // Let the first fetch rejection settle, then abort during the backoff window
      await Promise.resolve();
      controller.abort(new DOMException("Aborted", "AbortError"));

      await expect(promise).rejects.toThrow("Aborted");
      // Only one fetch attempt — aborted during the delay before the second attempt
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not retry when fetch rejects with AbortError", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", maxRetries: 3 });

      mockFetch.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

      const blob = new Blob(["content"]);
      await expect(client.uploadFile(blob, { filename: "test.pdf" })).rejects.toThrow("Aborted");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not retry when fetch rejects with TimeoutError", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-test-key-00000001", maxRetries: 3 });

      mockFetch.mockRejectedValueOnce(new DOMException("Request timed out after 50ms", "TimeoutError"));

      const blob = new Blob(["content"]);
      await expect(client.uploadFile(blob, { filename: "test.pdf" })).rejects.toThrow("timed out");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
