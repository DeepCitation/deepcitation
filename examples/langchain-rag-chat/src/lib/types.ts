import type { Citation, Verification } from "deepcitation";

export interface RetrievedSource {
  sourceId: string;
  title: string;
  filename: string;
  score: number;
  excerpt: string;
}

export interface VerificationSummary {
  total: number;
  verified: number;
  partial: number;
  missed: number;
  pending: number;
}

export interface ChatResponse {
  visibleText: string;
  rawLlmOutput: string;
  citations: Record<string, Citation>;
  verifications: Record<string, Verification>;
  summary: VerificationSummary;
  retrievedSources: RetrievedSource[];
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  rawLlmOutput?: string;
  citations?: Record<string, Citation>;
  verifications?: Record<string, Verification>;
  summary?: VerificationSummary;
  retrievedSources?: RetrievedSource[];
}
