/**
 * Tests for webhook signature verification
 *
 * These tests ensure that webhook signature validation works correctly
 * to prevent malicious actors from sending fake webhook events.
 */

import { describe, expect, it } from "bun:test";
import crypto from "crypto";

/**
 * Verify Intercom webhook signature
 * This is the same function used in server.ts
 */
function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(digest, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Helper to generate a valid signature for testing
 */
function generateSignature(body: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  return hmac.update(body).digest("hex");
}

describe("Webhook Signature Verification", () => {
  const testSecret = "test_client_secret_123";

  describe("verifyWebhookSignature", () => {
    it("validates correct signature", () => {
      const body = JSON.stringify({ topic: "conversation.user.replied" });
      const signature = generateSignature(body, testSecret);

      const isValid = verifyWebhookSignature(body, signature, testSecret);

      expect(isValid).toBe(true);
    });

    it("rejects incorrect signature", () => {
      const body = JSON.stringify({ topic: "conversation.user.replied" });
      const wrongSignature = "invalid_signature_abc123";

      const isValid = verifyWebhookSignature(body, wrongSignature, testSecret);

      expect(isValid).toBe(false);
    });

    it("rejects signature from wrong secret", () => {
      const body = JSON.stringify({ topic: "conversation.user.replied" });
      const signatureFromWrongSecret = generateSignature(body, "wrong_secret");

      const isValid = verifyWebhookSignature(
        body,
        signatureFromWrongSecret,
        testSecret
      );

      expect(isValid).toBe(false);
    });

    it("rejects modified body with original signature", () => {
      const originalBody = JSON.stringify({ topic: "conversation.user.replied" });
      const signature = generateSignature(originalBody, testSecret);

      const modifiedBody = JSON.stringify({
        topic: "conversation.user.replied",
        malicious: true,
      });

      const isValid = verifyWebhookSignature(modifiedBody, signature, testSecret);

      expect(isValid).toBe(false);
    });

    it("handles empty body", () => {
      const body = "";
      const signature = generateSignature(body, testSecret);

      const isValid = verifyWebhookSignature(body, signature, testSecret);

      expect(isValid).toBe(true);
    });

    it("handles unicode content", () => {
      const body = JSON.stringify({ message: "Hello 世界! 🚀" });
      const signature = generateSignature(body, testSecret);

      const isValid = verifyWebhookSignature(body, signature, testSecret);

      expect(isValid).toBe(true);
    });

    it("handles large payload", () => {
      const largeBody = JSON.stringify({
        data: "x".repeat(100000),
        nested: {
          array: Array(1000).fill("item"),
        },
      });
      const signature = generateSignature(largeBody, testSecret);

      const isValid = verifyWebhookSignature(largeBody, signature, testSecret);

      expect(isValid).toBe(true);
    });

    it("accepts both lowercase and uppercase hex signatures", () => {
      const body = JSON.stringify({ topic: "test" });
      const signature = generateSignature(body, testSecret);
      const upperSignature = signature.toUpperCase();

      // Buffer.from with 'hex' encoding is case-insensitive
      const isValidLower = verifyWebhookSignature(body, signature, testSecret);
      const isValidUpper = verifyWebhookSignature(body, upperSignature, testSecret);

      expect(isValidLower).toBe(true);
      expect(isValidUpper).toBe(true); // Hex is case-insensitive
    });

    it("handles non-hex signature gracefully", () => {
      const body = JSON.stringify({ topic: "test" });

      // Non-hex characters should not crash
      const isValid = verifyWebhookSignature(body, "not-valid-hex!", testSecret);

      expect(isValid).toBe(false);
    });

    it("handles signature length mismatch", () => {
      const body = JSON.stringify({ topic: "test" });

      // Too short
      const isValidShort = verifyWebhookSignature(body, "abc123", testSecret);
      expect(isValidShort).toBe(false);

      // Too long
      const longSig = "a".repeat(128);
      const isValidLong = verifyWebhookSignature(body, longSig, testSecret);
      expect(isValidLong).toBe(false);
    });
  });

  describe("Timing attack resistance", () => {
    it("uses constant-time comparison", () => {
      const body = JSON.stringify({ topic: "test" });
      const correctSignature = generateSignature(body, testSecret);

      // Generate signatures with different positions of first difference
      const wrongSignatures = [
        "0" + correctSignature.slice(1), // Differs at start
        correctSignature.slice(0, 32) + "0".repeat(32), // Differs in middle
        correctSignature.slice(0, -1) + "0", // Differs at end
      ];

      // All should fail, and timing should be consistent
      // (We can't easily test timing, but we verify they all fail)
      for (const wrongSig of wrongSignatures) {
        const isValid = verifyWebhookSignature(body, wrongSig, testSecret);
        expect(isValid).toBe(false);
      }
    });
  });

  describe("Real-world scenarios", () => {
    it("validates typical Intercom webhook payload", () => {
      const payload = {
        type: "notification_event",
        topic: "conversation.user.replied",
        id: "notif_abc123",
        created_at: 1234567890,
        data: {
          type: "notification_event_data",
          item: {
            type: "conversation",
            id: "conv_xyz789",
            conversation_parts: {
              conversation_parts: [
                {
                  type: "conversation_part",
                  id: "part_123",
                  body: "Hello, I need help with my order",
                  author: {
                    type: "user",
                    id: "user_456",
                  },
                },
              ],
            },
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateSignature(body, testSecret);

      const isValid = verifyWebhookSignature(body, signature, testSecret);

      expect(isValid).toBe(true);
    });

    it("handles newlines in body correctly", () => {
      const bodyWithNewlines = '{"message": "Line 1\\nLine 2\\nLine 3"}';
      const signature = generateSignature(bodyWithNewlines, testSecret);

      const isValid = verifyWebhookSignature(
        bodyWithNewlines,
        signature,
        testSecret
      );

      expect(isValid).toBe(true);
    });
  });
});

describe("Signature Generation", () => {
  it("generates consistent signatures for same input", () => {
    const body = JSON.stringify({ test: "data" });
    const secret = "consistent_secret";

    const sig1 = generateSignature(body, secret);
    const sig2 = generateSignature(body, secret);

    expect(sig1).toBe(sig2);
  });

  it("generates different signatures for different bodies", () => {
    const secret = "same_secret";

    const sig1 = generateSignature('{"a": 1}', secret);
    const sig2 = generateSignature('{"a": 2}', secret);

    expect(sig1).not.toBe(sig2);
  });

  it("generates different signatures for different secrets", () => {
    const body = JSON.stringify({ same: "body" });

    const sig1 = generateSignature(body, "secret1");
    const sig2 = generateSignature(body, "secret2");

    expect(sig1).not.toBe(sig2);
  });

  it("generates 64-character hex signature (SHA-256)", () => {
    const signature = generateSignature("test", "secret");

    expect(signature).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(signature)).toBe(true);
  });
});
