/**
 * Support Bot with Invisible Citation Verification
 *
 * This class demonstrates how to build a customer-facing AI assistant
 * that internally verifies all responses against source documents,
 * without showing citation markers to end users.
 */

import OpenAI from "openai";
import {
  DeepCitation,
  wrapCitationPrompt,
  getCitationStatus,
  removeCitations,
  type Verification,
  type FileDataPart,
} from "@deepcitation/deepcitation-js";

export interface SupportBotConfig {
  deepcitationApiKey: string;
  openaiApiKey: string;
  minConfidenceThreshold?: number;
}

export interface SupportBotResponse {
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

export class SupportBot {
  private dc: DeepCitation;
  private openai: OpenAI;
  private minConfidenceThreshold: number;
  private fileDataParts: FileDataPart[] = [];
  private deepTextPromptPortion: string[] = [];
  private isLoaded = false;

  constructor(config: SupportBotConfig) {
    this.dc = new DeepCitation({ apiKey: config.deepcitationApiKey });
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
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
  async loadKnowledgeBase(
    content: string | Buffer,
    filename: string
  ): Promise<void> {
    const buffer = typeof content === "string" ? Buffer.from(content) : content;

    const result = await this.dc.prepareFiles([{ file: buffer, filename }]);

    this.fileDataParts = result.fileDataParts;
    this.deepTextPromptPortion = result.deepTextPromptPortion;
    this.isLoaded = true;
  }

  /**
   * Load multiple knowledge base documents
   */
  async loadMultipleDocuments(
    documents: Array<{ content: string | Buffer; filename: string }>
  ): Promise<void> {
    const files = documents.map((doc) => ({
      file:
        typeof doc.content === "string"
          ? Buffer.from(doc.content)
          : doc.content,
      filename: doc.filename,
    }));

    const result = await this.dc.prepareFiles(files);

    this.fileDataParts = result.fileDataParts;
    this.deepTextPromptPortion = result.deepTextPromptPortion;
    this.isLoaded = true;
  }

  /**
   * Answer a customer question with invisible citation verification
   *
   * The response is verified against source documents, but the customer
   * sees a clean response without citation markers. Verification data
   * is returned separately for monitoring and audit purposes.
   */
  async answer(question: string): Promise<SupportBotResponse> {
    if (!this.isLoaded) {
      throw new Error(
        "Knowledge base not loaded. Call loadKnowledgeBase() first."
      );
    }

    // Step 1: Prepare citation-enhanced prompts
    const systemPrompt = `You are a helpful customer support agent. Answer questions
accurately based on the provided knowledge base. Be friendly but concise.
If information is not available in the knowledge base, say so honestly.`;

    const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
      systemPrompt,
      userPrompt: question,
      deepTextPromptPortion: this.deepTextPromptPortion,
    });

    // Step 2: Get response from LLM (using fast/cheap model)
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
    const verificationResult = await this.dc.verifyCitationsFromLlmOutput({
      llmOutput: rawResponse,
      fileDataParts: this.fileDataParts,
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
      cleanResponse: removeCitations(rawResponse, false),
      rawResponse,
      confidence,
      needsReview: confidence < this.minConfidenceThreshold,
      totalCitations,
      verifiedCitations,
      verificationDetails: verificationResult.verifications,
    };
  }

  /**
   * Answer with automatic retry for low-confidence responses
   *
   * If the first response has low confidence, asks the LLM to try again
   * with more explicit instructions to cite sources carefully.
   */
  async answerWithRetry(
    question: string,
    maxRetries = 2
  ): Promise<SupportBotResponse> {
    let response = await this.answer(question);

    for (
      let attempt = 0;
      attempt < maxRetries && response.needsReview;
      attempt++
    ) {
      console.log(
        `Retry ${attempt + 1}: Confidence ${(response.confidence * 100).toFixed(
          0
        )}% below threshold`
      );

      // Try again with stricter prompt
      const stricterQuestion = `${question}

IMPORTANT: Only answer based on information explicitly stated in the knowledge base.
If you're not certain about something, say "I don't have that information."
Make sure to cite exact phrases from the source documents.`;

      response = await this.answer(stricterQuestion);
    }

    return response;
  }
}
