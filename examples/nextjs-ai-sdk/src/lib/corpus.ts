export interface CorpusSource {
  id: string;
  title: string;
  filename: string;
  url: string;
  /** Name of the env var that holds a cached attachmentId for this source. */
  attachmentEnvVar: string;
  description: string;
}

export const CORPUS_SOURCES: CorpusSource[] = [
  {
    id: "yc-safe",
    title: "YC SAFE (Discount Only)",
    filename: "YC_SAFE_Discount_Only.docx.pdf",
    url: "https://deepcitation.com/demo/legal/YC_SAFE_Discount_Only.docx.pdf",
    attachmentEnvVar: "DEEPCITATION_ATTACHMENT_YC_SAFE",
    description: "YC Simple Agreement for Future Equity, discount-only variant.",
  },
  {
    id: "nvda-form144",
    title: "NVDA Form 144 – Robertson",
    filename: "NVDA_Form144_Robertson.pdf",
    url: "https://deepcitation.com/demo/finance/NVDA_Form144_Robertson.pdf",
    attachmentEnvVar: "DEEPCITATION_ATTACHMENT_NVDA_FORM144",
    description: "SEC Form 144 filing for planned NVIDIA stock sale by Robertson.",
  },
  {
    id: "attention-is-all-you-need",
    title: "Attention Is All You Need",
    filename: "Attention Is All You Need.pdf",
    url: "https://deepcitation.com/demo/playground-sample/Attention%20Is%20All%20You%20Need.pdf",
    attachmentEnvVar: "DEEPCITATION_ATTACHMENT_ATTENTION_IS_ALL_YOU_NEED",
    description: "Transformer architecture paper introducing multi-head self-attention.",
  },
  {
    id: "why-hallucinate",
    title: "Why Language Models Hallucinate",
    filename: "Why Language Models Hallucinate.pdf",
    url: "https://deepcitation.com/demo/playground-sample/Why%20Language%20Models%20Hallucinate.pdf",
    attachmentEnvVar: "DEEPCITATION_ATTACHMENT_WHY_HALLUCINATE",
    description: "Analysis of the causes of and mitigations for hallucination in LLMs.",
  },
];

export const SAMPLE_QUESTIONS = [
  "What discount rate applies when the YC SAFE converts, and what triggers a conversion event?",
  "How many NVIDIA shares is Robertson planning to sell, and what is the estimated aggregate market value?",
  "How does multi-head attention work, and why does the Transformer drop recurrence entirely?",
  "What are the root causes of hallucination in language models, and how does RAG reduce them?",
];
