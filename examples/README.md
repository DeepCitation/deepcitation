# DeepCitation Examples

Complete, runnable examples demonstrating DeepCitation integration patterns.

## Examples

| Example | Description | Best For |
|---------|-------------|----------|
| [**basic-verification**](./basic-verification) | Core 3-step workflow with OpenAI/Anthropic | Learning the basics, quick integration |
| [**nextjs-ai-sdk**](./nextjs-ai-sdk) | Next.js chat app with Vercel AI SDK | Full-stack apps, streaming UI |

## Quick Start

```bash
# Clone and navigate to examples
cd packages/deepcitation/examples

# Choose an example
cd basic-verification  # or nextjs-ai-sdk

# Install and run
npm install
cp .env.example .env   # Add your API keys
npm start
```

## Getting API Keys

1. **DeepCitation** (free): [deepcitation.com/signup](https://deepcitation.com/signup)
2. **OpenAI**: [platform.openai.com](https://platform.openai.com)
3. **Anthropic**: [console.anthropic.com](https://console.anthropic.com)

## Example Details

### Basic Verification

The simplest integration showing the complete workflow:

```typescript
// 1. Upload documents
const { fileDataParts, deepTextPromptPortion } = await deepcitation.prepareFiles([...]);

// 2. Wrap prompts with citation instructions
const { enhancedSystemPrompt, enhancedUserPrompt } = wrapCitationPrompt({
  systemPrompt,
  userPrompt: question,
  deepTextPromptPortion, 
});

// 3. Call LLM with enhanced prompts
const response = await llm.chat({ messages: [...] });

// 4. Verify citations
const result = await deepcitation.verify({ llmOutput: response });

// 5. Check status
for (const [key, verification] of Object.entries(result.verifications)) {
  const status = getCitationStatus(verification);
  console.log(`Citation ${key}: ${status.isVerified ? "✅" : "❌"}`);
}
```

### Next.js AI SDK

Full-stack chat application with streaming and real-time verification:

```typescript
// API route with AI SDK streaming
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

const result = streamText({
  model: openai("gpt-5-mini"),
  system: enhancedSystemPrompt,
  messages: enhancedMessages,
  async onFinish({ text }) {
    // Verify after streaming completes
    const verifications = await verifyCitations(sessionId, text);
  },
});

return result.toDataStreamResponse();
```

```bash
# Run the Next.js example
cd nextjs-ai-sdk
npm install
npm run dev
# Open http://localhost:3000
```

## More Resources

- [Full Documentation](https://deepcitation.com/docs)
- [API Reference](../README.md#api-reference)
- [React Components](../README.md#react-components)
- [Integration Patterns](../README.md#integration-patterns)
