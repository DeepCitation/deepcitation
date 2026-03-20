export interface CorpusSource {
  id: string;
  title: string;
  filename: string;
  url: string;
  /** Name of the env var that holds a cached attachmentId for this source. */
  attachmentEnvVar: string;
  retrievalText: string;
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
    retrievalText:
      "YC SAFE Discount Only. Simple Agreement for Future Equity. The investor purchases the right to receive equity upon a future equity financing round. Conversion occurs at a discount to the price paid by new investors. The discount rate governs how the SAFE converts at the next equity financing. No interest accrues and the agreement has no maturity date. The company makes no representations about a future financing or exit.",
  },
  {
    id: "nvda-form144",
    title: "NVDA Form 144 – Robertson",
    filename: "NVDA_Form144_Robertson.pdf",
    url: "https://deepcitation.com/demo/finance/NVDA_Form144_Robertson.pdf",
    attachmentEnvVar: "DEEPCITATION_ATTACHMENT_NVDA_FORM144",
    description: "SEC Form 144 filing for planned NVIDIA stock sale by Robertson.",
    retrievalText:
      "NVIDIA Form 144 Robertson. SEC Form 144 notice of proposed sale of securities. The filing discloses the number of shares to be sold, the estimated aggregate market value, the nature of the seller's relationship to NVIDIA Corporation, and the approximate date of intended sale. Form 144 is required when corporate insiders sell restricted or control securities pursuant to Rule 144 under the Securities Act of 1933.",
  },
  {
    id: "attention-is-all-you-need",
    title: "Attention Is All You Need",
    filename: "Attention Is All You Need.pdf",
    url: "https://deepcitation.com/demo/playground-sample/Attention%20Is%20All%20You%20Need.pdf",
    attachmentEnvVar: "DEEPCITATION_ATTACHMENT_ATTENTION_IS_ALL_YOU_NEED",
    description: "Transformer architecture paper introducing multi-head self-attention.",
    retrievalText:
      "Attention Is All You Need. Vaswani et al. 2017. The Transformer model architecture relies entirely on self-attention mechanisms, dispensing with recurrence and convolutions entirely. Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions. The encoder-decoder structure uses stacked self-attention and point-wise fully connected layers. Positional encodings are added to token embeddings to supply sequence order information. The model achieves state-of-the-art results on English-to-German and English-to-French translation benchmarks.",
  },
  {
    id: "why-hallucinate",
    title: "Why Language Models Hallucinate",
    filename: "Why Language Models Hallucinate.pdf",
    url: "https://deepcitation.com/demo/playground-sample/Why%20Language%20Models%20Hallucinate.pdf",
    attachmentEnvVar: "DEEPCITATION_ATTACHMENT_WHY_HALLUCINATE",
    description: "Analysis of the causes of and mitigations for hallucination in LLMs.",
    retrievalText:
      "Why Language Models Hallucinate. Large language models generate plausible-sounding but factually incorrect information due to distributional gaps in training data and the autoregressive generation process. Retrieval-augmented generation and citation verification reduce hallucination by grounding outputs in specific source documents. Temperature settings, decoding strategies, and RLHF training all affect hallucination rates. Models can confidently fabricate citations, statistics, and quotes that do not appear in any source.",
  },
];

export const SAMPLE_QUESTIONS = [
  "What discount rate applies when the YC SAFE converts, and what triggers a conversion event?",
  "How many NVIDIA shares is Robertson planning to sell, and what is the estimated aggregate market value?",
  "How does multi-head attention work, and why does the Transformer drop recurrence entirely?",
  "What are the root causes of hallucination in language models, and how does RAG reduce them?",
];
