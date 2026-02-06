/**
 * Intercom Webhook Server
 *
 * Express server that receives webhook events from Intercom and
 * processes them with the IntercomBot for citation-verified responses.
 */

import "dotenv/config";
import crypto from "crypto";
import express from "express";
import { IntercomBot } from "./intercom-bot.js";
import { getKnowledgeBaseSummary, SAMPLE_KNOWLEDGE_BASE } from "./knowledge-base.js";

const app = express();

// Store raw body for webhook signature verification
app.use(
  express.json({
    verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);

// Bot instance
let bot: IntercomBot;
let isReady = false;
let botAdminId: string | null = null;

/**
 * Verify Intercom webhook signature
 *
 * Intercom signs webhook payloads with HMAC-SHA256 using your client secret.
 * This prevents malicious actors from sending fake webhook events.
 */
function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(rawBody).digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(digest, "hex"));
  } catch {
    return false;
  }
}

/**
 * Extract user message from Intercom webhook payload
 */
function extractUserMessage(payload: Record<string, unknown>): string | null {
  const data = payload.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const item = data.item as Record<string, unknown> | undefined;
  if (!item) return null;

  // For conversation.user.created, message is in source.body
  const source = item.source as Record<string, unknown> | undefined;
  if (source?.body) {
    return source.body as string;
  }

  // For conversation.user.replied, message is in conversation_parts
  const parts = item.conversation_parts as Record<string, unknown> | undefined;
  const partsList = parts?.conversation_parts as Array<Record<string, unknown>> | undefined;
  if (partsList && partsList.length > 0) {
    const lastPart = partsList[partsList.length - 1];
    return lastPart.body as string;
  }

  return null;
}

/**
 * Extract conversation ID from Intercom webhook payload
 */
function extractConversationId(payload: Record<string, unknown>): string | null {
  const data = payload.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const item = data.item as Record<string, unknown> | undefined;
  if (!item) return null;

  return item.id as string | null;
}

/**
 * POST /webhook - Receive Intercom webhook events
 *
 * Subscribed topics:
 * - conversation.user.created: New conversation started
 * - conversation.user.replied: Customer replied to conversation
 */
app.post("/webhook", async (req: express.Request & { rawBody?: string }, res) => {
  const clientSecret = process.env.INTERCOM_CLIENT_SECRET;

  // Verify webhook signature if client secret is configured
  if (clientSecret) {
    const signature = req.headers["x-hub-signature"] as string;
    if (!signature) {
      console.warn("⚠️ Webhook received without signature");
      return res.status(401).json({ error: "Missing signature" });
    }

    // Extract the signature value (format: "sha1=..." - but Intercom uses SHA256)
    const signatureValue = signature.replace("sha1=", "");

    if (!verifyWebhookSignature(req.rawBody || "", signatureValue, clientSecret)) {
      console.warn("⚠️ Invalid webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  // Respond immediately (Intercom expects quick response)
  res.status(200).json({ received: true });

  // Process the webhook asynchronously
  try {
    const payload = req.body;
    const topic = payload.topic as string;

    console.log(`\n🔔 Received webhook: ${topic}`);

    // Only process user messages
    if (topic !== "conversation.user.created" && topic !== "conversation.user.replied") {
      console.log(`   Ignoring topic: ${topic}`);
      return;
    }

    if (!isReady) {
      console.log("   ⏳ Bot not ready, skipping...");
      return;
    }

    if (!botAdminId) {
      console.log("   ❌ No admin ID configured, cannot reply");
      return;
    }

    const conversationId = extractConversationId(payload);
    const userMessage = extractUserMessage(payload);

    if (!conversationId || !userMessage) {
      console.log("   ❌ Could not extract conversation ID or message");
      return;
    }

    // Handle the message
    await bot.handleIncomingMessage(conversationId, userMessage, botAdminId);
  } catch (error) {
    console.error("Error processing webhook:", error);
  }
});

/**
 * GET /health - Health check endpoint
 */
app.get("/health", (_req, res) => {
  res.json({
    status: isReady ? "ready" : "initializing",
    knowledgeBase: getKnowledgeBaseSummary(),
  });
});

/**
 * POST /test - Test endpoint for local development
 *
 * Allows testing the bot without Intercom webhooks.
 * Send: { "question": "What is your refund policy?" }
 */
app.post("/test", async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: "Bot not ready" });
  }

  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Missing question" });
  }

  try {
    const response = await bot.generateResponse(question);
    res.json({
      answer: response.cleanResponse,
      confidence: response.confidence,
      needsReview: response.needsReview,
      citations: {
        total: response.totalCitations,
        verified: response.verifiedCitations,
      },
    });
  } catch (error) {
    console.error("Error generating response:", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

/**
 * Initialize the bot and start the server
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Intercom Bot with DeepCitation Verification         ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Validate environment variables
  const requiredEnvVars = ["DEEPCITATION_API_KEY", "OPENAI_API_KEY", "INTERCOM_ACCESS_TOKEN"];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(", ")}`);
    console.error("   Copy .env.example to .env and fill in your API keys");
    process.exit(1);
  }

  // Initialize bot
  console.log("🤖 Initializing bot...");
  bot = new IntercomBot({
    deepcitationApiKey: process.env.DEEPCITATION_API_KEY!,
    openaiApiKey: process.env.OPENAI_API_KEY!,
    intercomAccessToken: process.env.INTERCOM_ACCESS_TOKEN!,
    minConfidenceThreshold: parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD || "0.8"),
  });

  // Load knowledge base
  console.log("📚 Loading knowledge base...");
  await bot.loadKnowledgeBase(SAMPLE_KNOWLEDGE_BASE);
  console.log("   ✓ Loaded documents:");
  SAMPLE_KNOWLEDGE_BASE.forEach(doc => {
    console.log(`     - ${doc.filename}`);
  });

  // Get admin ID for replies (you should set this to your bot's admin ID)
  botAdminId = process.env.INTERCOM_ADMIN_ID || null;
  if (!botAdminId) {
    console.warn("⚠️ INTERCOM_ADMIN_ID not set - webhook replies disabled");
    console.warn("   Set this to your Intercom admin/bot ID to enable replies");
  }

  isReady = true;

  // Start server
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`
✅ Server running on port ${port}

📡 Endpoints:
   POST /webhook     - Intercom webhook receiver
   GET  /health      - Health check
   POST /test        - Test endpoint (local dev)

🔗 Webhook URL (for Intercom):
   https://your-domain.com/webhook

   For local development, use ngrok:
   ngrok http ${port}

📝 Test locally:
   curl -X POST http://localhost:${port}/test \\
     -H "Content-Type: application/json" \\
     -d '{"question": "What is your refund policy?"}'
`);
  });
}

main().catch(console.error);
