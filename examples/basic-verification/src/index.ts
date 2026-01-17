/**
 * DeepCitation Basic Example
 *
 * This directory contains examples for different LLM providers.
 * Run the example for your preferred provider:
 *
 *   bun run start:openai     - OpenAI GPT-5 Mini
 *   bun run start:anthropic  - Anthropic Claude
 *   bun run start:gemini     - Google Gemini
 *
 * Make sure to copy .env.example to .env and add your API keys first!
 */

console.log(`
╔════════════════════════════════════════════════════════════╗
║           DeepCitation Basic Verification Example          ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Run one of the following commands:                        ║
║                                                            ║
║    bun run start:openai      - Using OpenAI GPT-5 Mini     ║
║    bun run start:anthropic   - Using Anthropic Claude      ║
║    bun run start:gemini      - Using Gemini Flash Lite     ║
║                                                            ║
║  Make sure to:                                             ║
║  1. Copy .env.example to .env                              ║
║  2. Add your DEEPCITATION_API_KEY                          ║
║  3. Add your LLM provider API key                          ║
║                                                            ║
║  Optional: Override prompts in .env                        ║
║    SYSTEM_PROMPT="Your custom system prompt..."            ║
║    USER_PROMPT="Your custom user question..."              ║
║                                                            ║
║  Get a free DeepCitation API key at:                       ║
║  https://deepcitation.com/playground                       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
