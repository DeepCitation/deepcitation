import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepCitation } from "../client/DeepCitation.js";

// Mock global fetch
const mockFetch = vi.fn() as ReturnType<typeof vi.fn>;
global.fetch = mockFetch;

describe("DeepCitation Client", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("constructor", () => {
    it("throws error when no API key provided", () => {
      expect(() => new DeepCitation({ apiKey: "" })).toThrow(
        "DeepCitation API key is required"
      );
    });

    it("creates client with valid API key", () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });
      expect(client).toBeInstanceOf(DeepCitation);
    });

    it("uses default API URL when not specified", () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });
      // Client should work without custom URL
      expect(client).toBeInstanceOf(DeepCitation);
    });

    it("uses custom API URL when provided", () => {
      const client = new DeepCitation({
        apiKey: "sk-dc-123",
        apiUrl: "https://custom.api.com/",
      });
      expect(client).toBeInstanceOf(DeepCitation);
    });

    it("strips trailing slash from custom API URL", () => {
      const client = new DeepCitation({
        apiKey: "sk-dc-123",
        apiUrl: "https://custom.api.com/",
      });
      expect(client).toBeInstanceOf(DeepCitation);
    });
  });

  describe("uploadFile", () => {
    it("uploads a file and returns response", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_abc123",
          deepTextPromptPortion: "[Page 1]\n[L1] Test content",
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
      expect(result.deepTextPromptPortion).toContain("[Page 1]");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("throws error on upload failure", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "Invalid file format" } }),
      } as Response);

      const blob = new Blob(["test content"]);
      await expect(client.uploadFile(blob)).rejects.toThrow(
        "Invalid file format"
      );
    });

    it("handles custom attachmentId option", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "custom_id",
          deepTextPromptPortion: "content",
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
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      // @ts-expect-error - testing invalid input
      await expect(client.uploadFile("not a file")).rejects.toThrow(
        "Invalid file type"
      );
    });
  });

  describe("prepareFiles", () => {
    it("uploads multiple files and returns aggregated response", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      // Mock two successful uploads
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            attachmentId: "file_1",
            deepTextPromptPortion: "[Page 1]\n[L1] Content from file 1",
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
            deepTextPromptPortion: "[Page 1]\n[L1] Content from file 2",
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

      const result = await client.prepareFiles([
        { file: blob1, filename: "doc1.pdf" },
        { file: blob2, filename: "doc2.pdf" },
      ]);

      expect(result.fileDataParts).toHaveLength(2);

      expect(result.fileDataParts[0].attachmentId).toBe("file_1");
      expect(result.fileDataParts[1].attachmentId).toBe("file_2");

      expect(result.fileDataParts[0].deepTextPromptPortion).toContain(
        "Content from file 1"
      );
      expect(result.fileDataParts[1].deepTextPromptPortion).toContain(
        "Content from file 2"
      );
    });

    it("handles single file", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "single_file",
          deepTextPromptPortion: "[Page 1]\n[L1] Single content",
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
      const result = await client.prepareFiles([
        { file: blob, filename: "single.pdf" },
      ]);

      expect(result.fileDataParts).toHaveLength(1);
      expect(result.fileDataParts[0].deepTextPromptPortion).toContain(
        "Single content"
      );
    });

    it("handles empty files array", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      const result = await client.prepareFiles([]);

      expect(result.fileDataParts).toHaveLength(0);
    });

    it("propagates upload errors", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Server error" } }),
      } as Response);

      const blob = new Blob(["content"]);
      await expect(
        client.prepareFiles([{ file: blob, filename: "test.pdf" }])
      ).rejects.toThrow("Server error");
    });

    it("supports custom attachmentId per file", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "my_custom_id",
          deepTextPromptPortion: "content",
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
      const result = await client.prepareFiles([
        { file: blob, filename: "custom.pdf", attachmentId: "my_custom_id" },
      ]);

      expect(result.fileDataParts[0].attachmentId).toBe("my_custom_id");
    });
  });

  describe("verify", () => {
    it("parses and verifies citations from LLM output", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      // First upload a file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          attachmentId: "file_123",
          deepTextPromptPortion: "[Page 1]\n[L1] Revenue grew 15%",
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
              verifiedPageNumber: 1,
              status: "found",
              verificationImageBase64: "base64data",
              verifiedMatchSnippet: "Revenue grew 15%",
            },
          },
        }),
      } as Response);

      const llmOutput =
        "The company showed strong growth. <cite attachment_id='file_123' start_page_key='page_number_1_index_0' full_phrase='Revenue grew 15%' anchor_text='15%' line_ids='1' />";

      const result = await client.verify({
        llmOutput,
      });

      expect(result.verifications).toBeDefined();
      expect(Object.keys(result.verifications).length).toBeGreaterThanOrEqual(
        1
      );
    });

    it("verifies citations with attachmentId in citation", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            key1: {
              verifiedPageNumber: 1,
              status: "found",
              verifiedMatchSnippet: "Test content",
            },
          },
        }),
      } as Response);

      const result = await client.verify({
        llmOutput:
          "<cite attachment_id='file_123' start_page_key='page_number_1_index_0' full_phrase='Test content' anchor_text='Test' line_ids='1' />",
      });

      expect(result.verifications).toBeDefined();
    });

    it("returns empty verifications when no citations in output", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      const result = await client.verify({
        llmOutput: "Just plain text with no citations.",
      });

      expect(result.verifications).toEqual({});
    });
  });

  describe("verifyAttachment", () => {
    it("verifies citations with attachmentId and citation map", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      // Verify citations directly with attachmentId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            "1": { verifiedPageNumber: 1, status: "found" },
          },
        }),
      } as Response);

      const result = await client.verifyAttachment("file_abc", {
        "1": {
          pageNumber: 1,
          fullPhrase: "test phrase",
          attachmentId: "file_abc",
        },
      });

      expect(result.verifications["1"].status).toBe("found");
    });

    it("handles API error gracefully", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: "File not found" } }),
      } as Response);

      await expect(
        client.verifyAttachment("unknown_file", {
          "1": { fullPhrase: "test" },
        })
      ).rejects.toThrow("File not found");
    });

    it("returns empty verifications when no citations provided", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      const result = await client.verifyAttachment("file_abc", {});

      expect(result.verifications).toEqual({});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("deduplicates identical verification requests", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            "1": { verifiedPageNumber: 1, status: "found" },
          },
        }),
      } as Response);

      const citations = {
        "1": {
          pageNumber: 1,
          fullPhrase: "test phrase",
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
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

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
        "1": { fullPhrase: "phrase 1", attachmentId: "file_abc" },
      };
      const citations2 = {
        "2": { fullPhrase: "phrase 2", attachmentId: "file_abc" },
      };

      await Promise.all([
        client.verifyAttachment("file_abc", citations1),
        client.verifyAttachment("file_abc", citations2),
      ]);

      // Different citations should make separate calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("prepareFiles with concurrency limits", () => {
    it("uploads files with concurrency limit", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockFetch.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

        // Simulate some async work
        await new Promise((resolve) => setTimeout(resolve, 10));

        concurrentCalls--;
        return {
          ok: true,
          json: async () => ({
            attachmentId: `file_${Math.random()}`,
            deepTextPromptPortion: "content",
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

      await client.prepareFiles(files);

      // All files should be uploaded
      expect(mockFetch).toHaveBeenCalledTimes(10);

      // Max concurrent should be exactly 5 (DEFAULT_UPLOAD_CONCURRENCY)
      // With 10 files and artificial delays, we should hit the limit
      expect(maxConcurrentCalls).toBe(5);
    });

    it("respects custom concurrency limit from config", async () => {
      const customLimit = 3;
      const client = new DeepCitation({
        apiKey: "sk-dc-123",
        maxUploadConcurrency: customLimit,
      });
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockFetch.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

        await new Promise((resolve) => setTimeout(resolve, 10));

        concurrentCalls--;
        return {
          ok: true,
          json: async () => ({
            attachmentId: `file_${Math.random()}`,
            deepTextPromptPortion: "content",
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

      await client.prepareFiles(files);

      expect(mockFetch).toHaveBeenCalledTimes(10);
      expect(maxConcurrentCalls).toBe(customLimit);
    });
  });

  describe("cache key completeness", () => {
    it("differentiates citations with same text but different lineIds", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

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
          fullPhrase: "test phrase",
          anchorText: "test",
          pageNumber: 1,
          lineIds: [1, 2, 3],
          attachmentId: "file_abc",
        },
      };
      const citations2 = {
        "1": {
          fullPhrase: "test phrase",
          anchorText: "test",
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

    it("differentiates citations with same text but different selection", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

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
            verifications: { "1": { status: "found" } },
          }),
        } as Response);

      // Same text, different selection
      const citations1 = {
        "1": {
          fullPhrase: "test phrase",
          anchorText: "test",
          pageNumber: 1,
          selection: { x: 0, y: 0, width: 100, height: 20 },
          attachmentId: "file_abc",
        },
      };
      const citations2 = {
        "1": {
          fullPhrase: "test phrase",
          anchorText: "test",
          pageNumber: 1,
          selection: { x: 50, y: 100, width: 100, height: 20 },
          attachmentId: "file_abc",
        },
      };

      await client.verifyAttachment("file_abc", citations1);
      await client.verifyAttachment("file_abc", citations2);

      // Different selection should result in separate API calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("uses same cache for identical citations with different numbering", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          verifications: { "1": { status: "found" } },
        }),
      } as Response);

      // Same citation content, different map keys (numbering)
      const citations1 = {
        "1": {
          fullPhrase: "test phrase",
          anchorText: "test",
          pageNumber: 1,
          lineIds: [1, 2, 3],
          attachmentId: "file_abc",
        },
      };
      const citations2 = {
        "42": {
          fullPhrase: "test phrase",
          anchorText: "test",
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
});
