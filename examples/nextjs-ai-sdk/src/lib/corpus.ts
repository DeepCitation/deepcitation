export interface CorpusSource {
  id: string;
  title: string;
  filename: string;
  url: string;
  /** Name of the env var that holds a cached attachmentId for this source. */
  attachmentEnvVar: string;
  description: string;
}

export const CORPUS_SOURCE: CorpusSource = {
  id: "attention-is-all-you-need",
  title: "Attention Is All You Need",
  filename: "Attention Is All You Need.pdf",
  url: "https://deepcitation.com/demo/playground-sample/Attention%20Is%20All%20You%20Need.pdf",
  attachmentEnvVar: "DEEPCITATION_ATTACHMENT_ATTENTION_IS_ALL_YOU_NEED",
  description: "Transformer architecture paper introducing multi-head self-attention.",
};

export const SAMPLE_QUESTIONS = [
  "How does multi-head attention work in the Transformer?",
  "Why did the authors drop recurrence and convolutions entirely?",
  "What translation benchmarks did the Transformer achieve state-of-the-art on?",
];
