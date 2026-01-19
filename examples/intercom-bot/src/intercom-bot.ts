/**
 * Intercom Bot with Invisible Citation Verification
 *
 * This class demonstrates how to build an Intercom-integrated AI assistant
 * that internally verifies all responses against attachments,
 * without showing citation markers to end users.
 */

import OpenAI from "openai";
import { IntercomClient } from "intercom-client";
import {
  DeepCitation,
  wrapCitationPrompt,
  getCitationStatus,
  replaceCitations,
  type Verification,
  type FileDataPart,
} from "@deepcitation/deepcitation-js";

export interface IntercomBotConfig {
  deepcitationApiKey: string;
  openaiApiKey: string;
  intercomAccessToken: string;
  minConfidenceThreshold?: number;
}

export interface BotResponse {
  /** Clean response without citation markers (for customers) */
  cleanResponse: string;
  /** Raw response with citation tags (for debugging) */
  rawResponse: string;
  /** Confidence score (0-1) based on verification rate */
  confidence: number;
  /** True if confidence is below threshold */
  needsReview: boolean;
  /** Total number of citations in response */
  totalCitations: number;
  /** Number of successfully verified citations */
  verifiedCitations: number;
  /** Full verification details for each citation */
  verificationDetails: Record<string, Verification>;
}

export interface KnowledgeDocument {
  content: string | Buffer;
  filename: string;
}

export class IntercomBot {
  private dc: DeepCitation;
  private openai: OpenAI;
  private intercom: IntercomClient;
  private minConfidenceThreshold: number;
  private fileDataParts: FileDataPart[] = [];
  private deepTextPromptPortion: string[] = [];
  private isLoaded = false;

  constructor(config: IntercomBotConfig) {
    this.dc = new DeepCitation({ apiKey: config.deepcitationApiKey });
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.intercom = new IntercomClient({ token: config.intercomAccessToken });
    this.minConfidenceThreshold = config.minConfidenceThreshold ?? 0.8;
  }

  /**
   * Load knowledge base documents
   *
   * In production, you might load multiple documents:
   * - FAQ documents
   * - Product manuals
   * - Policy documents
   * - Help center articles
   */
  async loadKnowledgeBase(documents: KnowledgeDocument[]): Promise<void> {
    const files = documents.map((doc) => ({
      file:
        typeof doc.content === "string"
          ? Buffer.from(doc.content)
          : doc.content,
      filename: doc.filename,
    }));

    const result = await this.deepcitation.prepareFiles(files);

    this.fileDataParts = result.fileDataParts;
    this.deepTextPromptPortion = result.deepTextPromptPortion;
    this.isLoaded = true;
  }

  /**
   * Check if knowledge base is loaded
   */
  isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Generate a response with citation verification
   *
   * The response is verified against attachments, but the customer
   * sees a clean response without citation markers. Verification data
   * is returned separately for monitoring and audit purposes.
   */
  async generateResponse(question: string): Promise<BotResponse> {
    if (!this.isLoaded) {
      throw new Error(
        "Knowledge base not loaded. Call loadKnowledgeBase() first."
      );
    }

    // Step 1: Prepare citation-enhanced prompts
    const systemPrompt = `You are a helpful customer support agent for ACME Corporation.
Answer questions accurately based on the provided knowledge base.
Be friendly, professional, and concise.
If information is not available in the knowledge base, say so honestly.
Do not make up information that isn't in the attachments.`;

    const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
      systemPrompt,
      userPrompt: question,
      deepTextPromptPortion: this.deepTextPromptPortion,
    });

    // Step 2: Get response from LLM
    const completion = await this.openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: enhancedSystemPrompt },
        { role: "user", content: enhancedUserPrompt },
      ],
      temperature: 0.3, // Lower temperature for more factual responses
    });

    const rawResponse = completion.choices[0].message.content!;

    // Step 3: Verify citations against knowledge base
    const verificationResult = await this.deepcitation.verify({
      llmOutput: rawResponse,
    });

    // Step 4: Calculate confidence score
    const citations = Object.values(verificationResult.verifications);
    const totalCitations = citations.length;
    const verifiedCitations = citations.filter(
      (c) => getCitationStatus(c).isVerified
    ).length;

    // Confidence = percentage of verified citations
    // If no citations, we assume low confidence (response may be made up)
    const confidence =
      totalCitations > 0 ? verifiedCitations / totalCitations : 0;

    // Step 5: Return clean response with verification metadata
    return {
      cleanResponse: replaceCitations(rawResponse),
      rawResponse,
      confidence,
      needsReview: confidence < this.minConfidenceThreshold,
      totalCitations,
      verifiedCitations,
      verificationDetails: verificationResult.verifications,
    };
  }

  /**
   * Reply to an Intercom conversation
   */
  async replyToConversation(
    conversationId: string,
    message: string,
    adminId: string
  ): Promise<void> {
    await this.intercom.conversations.reply({
      conversation_id: conversationId,
      body: {
        message_type: "comment",
        type: "admin",
        admin_id: adminId,
        body: message,
      },
    });
  }

  /**
   * Add an internal note to a conversation (visible only to admins)
   */
  async addInternalNote(
    conversationId: string,
    note: string,
    adminId: string
  ): Promise<void> {
    await this.intercom.conversations.reply({
      conversation_id: conversationId,
      body: {
        message_type: "note",
        type: "admin",
        admin_id: adminId,
        body: note,
      },
    });
  }

  /**
   * Format verification details as an internal note
   */
  formatVerificationNote(response: BotResponse): string {
    const confidenceEmoji =
      response.confidence >= 0.8
        ? "✅"
        : response.confidence >= 0.5
          ? "⚠️"
          : "❌";

    let note = `**DeepCitation Verification Report**\n\n`;
    note += `${confidenceEmoji} **Confidence:** ${(response.confidence * 100).toFixed(0)}%\n`;
    note += `📊 **Citations:** ${response.verifiedCitations}/${response.totalCitations} verified\n`;

    if (response.needsReview) {
      note += `\n🚨 **Action Required:** Response flagged for human review due to low confidence.\n`;
    }

    if (response.totalCitations > 0) {
      note += `\n**Citation Details:**\n`;
      for (const [key, verification] of Object.entries(
        response.verificationDetails
      )) {
        const status = getCitationStatus(verification);
        note += `- Citation ${key}: ${status.isVerified ? "✅ Verified" : "❌ Not verified"}\n`;
      }
    }

    return note;
  }

  /**
   * Main handler for incoming messages from Intercom webhook
   *
   * This is the primary integration point. When a customer sends a message,
   * this method:
   * 1. Generates a verified response
   * 2. Replies to the conversation with the clean response
   * 3. Adds an internal note with verification details
   */
  async handleIncomingMessage(
    conversationId: string,
    userMessage: string,
    adminId: string
  ): Promise<BotResponse> {
    console.log(`\n📩 Received message in conversation ${conversationId}`);
    console.log(`   Question: "${userMessage}"`);

    // Generate verified response
    const response = await this.generateResponse(userMessage);

    console.log(
      `   Confidence: ${(response.confidence * 100).toFixed(0)}% (${response.verifiedCitations}/${response.totalCitations} citations)`
    );

    // Reply to the customer with clean response
    await this.replyToConversation(
      conversationId,
      response.cleanResponse,
      adminId
    );
    console.log(`   ✓ Sent reply to customer`);

    // Add internal note with verification details
    const note = this.formatVerificationNote(response);
    await this.addInternalNote(conversationId, note, adminId);
    console.log(`   ✓ Added verification note for admins`);

    if (response.needsReview) {
      console.log(`   ⚠️ Response flagged for human review`);
    }

    return response;
  }
}
