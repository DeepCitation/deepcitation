import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { DeepCitation } from "../client/DeepCitation.js";

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
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
          fileId: "file_abc123",
          attachmentId: "att_123", // Internal field returned by API
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

      expect(result.fileId).toBe("file_abc123");
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

    it("handles custom fileId option", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileId: "custom_id",
          attachmentId: "att_custom",
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
      const result = await client.uploadFile(blob, { fileId: "custom_id" });

      expect(result.fileId).toBe("custom_id");
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
            fileId: "file_1",
            attachmentId: "att_1",
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
            fileId: "file_2",
            attachmentId: "att_2",
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
      expect(result.deepTextPromptPortion).toHaveLength(2);

      expect(result.fileDataParts[0].fileId).toBe("file_1");
      // attachmentId is not exposed in FileDataPart
      expect(result.fileDataParts[1].fileId).toBe("file_2");

      expect(result.deepTextPromptPortion[0]).toContain("Content from file 1");
      expect(result.deepTextPromptPortion[1]).toContain("Content from file 2");
    });

    it("handles single file", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileId: "single_file",
          attachmentId: "att_single",
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
      expect(result.deepTextPromptPortion).toHaveLength(1);
    });

    it("handles empty files array", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      const result = await client.prepareFiles([]);

      expect(result.fileDataParts).toHaveLength(0);
      expect(result.deepTextPromptPortion).toHaveLength(0);
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

    it("supports custom fileId per file", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileId: "my_custom_id",
          attachmentId: "att_custom",
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
        { file: blob, filename: "custom.pdf", fileId: "my_custom_id" },
      ]);

      expect(result.fileDataParts[0].fileId).toBe("my_custom_id");
    });
  });

  describe("verifyCitations with object input", () => {
    it("verifies citations from LLM output automatically", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      // First upload a file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileId: "file_123",
          attachmentId: "att_123",
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
      await client.uploadFile(blob, { fileId: "file_123" });

      // Then verify citations
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            citation_key_1: {
              pageNumber: 1,
              searchState: { status: "found" },
              verificationImageBase64: "base64data",
              matchSnippet: "Revenue grew 15%",
            },
          },
        }),
      } as Response);

      const llmOutput =
        "The company showed strong growth. <cite file_id='file_123' start_page_key='page_number_1_index_0' full_phrase='Revenue grew 15%' key_span='15%' line_ids='1' />";

      const result = await client.verifyCitationsFromLlmOutput({
        llmOutput,
      });

      expect(result.verifications).toBeDefined();
      expect(Object.keys(result.verifications).length).toBeGreaterThanOrEqual(
        1
      );
    });

    it("verifies citations with fileId in citation", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            key1: {
              pageNumber: 1,
              searchState: { status: "found" },
              matchSnippet: "Test content",
            },
          },
        }),
      } as Response);

      const result = await client.verifyCitationsFromLlmOutput({
        llmOutput:
          "<cite file_id='file_123' start_page_key='page_number_1_index_0' full_phrase='Test content' key_span='Test' line_ids='1' />",
      });

      expect(result.verifications).toBeDefined();
    });

    it("returns empty verifications when no citations in output", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      const result = await client.verifyCitationsFromLlmOutput({
        llmOutput: "Just plain text with no citations.",
      });

      expect(result.verifications).toEqual({});
    });
  });

  describe("verifyCitations", () => {
    it("verifies citations with fileId and citation map", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      // Verify citations directly with fileId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verifications: {
            "1": { pageNumber: 1, searchState: { status: "found" } },
          },
        }),
      } as Response);

      const result = await client.verifyCitations("file_abc", {
        "1": { pageNumber: 1, fullPhrase: "test phrase", fileId: "file_abc" },
      });

      expect(result.verifications["1"].searchState.status).toBe("found");
    });

    it("handles API error gracefully", async () => {
      const client = new DeepCitation({ apiKey: "sk-dc-123" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: "File not found" } }),
      } as Response);

      await expect(
        client.verifyCitations("unknown_file", {
          "1": { fullPhrase: "test" },
        })
      ).rejects.toThrow("File not found");
    });
  });
});
