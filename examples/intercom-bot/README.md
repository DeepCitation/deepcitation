# Intercom Bot with DeepCitation Verification

A customer support bot that integrates with [Intercom](https://www.intercom.com/) and uses [DeepCitation](https://deepcitation.com) for invisible citation verification. Customers see clean, friendly responses while your team gets confidence scores and verification details.

## How It Works

```
┌─────────────────┐     Webhook Event     ┌──────────────────────┐
│   Intercom      │ ──────────────────────▶│  This Server         │
│   (Customer     │  conversation.user.*   │  POST /webhook       │
│    Message)     │                        └──────────┬───────────┘
└─────────────────┘                                   │
                                                      ▼
                                          ┌──────────────────────┐
                                          │  IntercomBot         │
                                          │  - Generate answer   │
                                          │  - Verify citations  │
                                          │  - Calculate score   │
                                          └──────────┬───────────┘
                                                      │
                                                      ▼
┌─────────────────┐     Reply + Note      ┌──────────────────────┐
│   Intercom      │ ◀──────────────────────│  Intercom API        │
│   (Bot Reply)   │                        │  - Customer reply    │
└─────────────────┘                        │  - Admin note        │
                                           └──────────────────────┘
```

**What customers see:** A clean, helpful response without citation markers.

**What your team sees:** Internal notes with confidence scores and verification details.

## Prerequisites

- [Intercom](https://www.intercom.com/) workspace with Developer Hub access
- [DeepCitation API key](https://deepcitation.com/signup) (free)
- [OpenAI API key](https://platform.openai.com)
- Node.js 18+ or Bun

## Quick Start

### 1. Install Dependencies

```bash
cd examples/intercom-bot
bun install
# or: npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```bash
DEEPCITATION_API_KEY=sk-dc-your_key
OPENAI_API_KEY=sk-your-openai-key
INTERCOM_ACCESS_TOKEN=your_intercom_token
INTERCOM_CLIENT_SECRET=your_client_secret
INTERCOM_ADMIN_ID=your_admin_id
```

### 3. Run the Demo (No Intercom Required)

Test the citation verification flow without Intercom:

```bash
bun run demo
```

### 4. Start the Webhook Server

```bash
bun run start
```

## Intercom Setup

### Step 1: Create a Developer App

1. Go to [Intercom Developer Hub](https://developers.intercom.com)
2. Click **New app** → **Create app**
3. Name it (e.g., "DeepCitation Support Bot")
4. Select your workspace

### Step 2: Configure Webhooks

1. In your app, go to **Configure** → **Webhooks**
2. Add your webhook URL: `https://your-domain.com/webhook`
3. Subscribe to these topics:
   - `conversation.user.created`
   - `conversation.user.replied`

### Step 3: Get Your Credentials

1. **Access Token**: Go to **Authentication** → copy your access token
2. **Client Secret**: Go to **Basic Information** → copy client secret
3. **Admin ID**: Go to your Intercom workspace → **Settings** → **Teammates** → find your bot's admin ID

### Step 4: Local Development with ngrok

For local testing, use [ngrok](https://ngrok.com/) to expose your server:

```bash
# Start the server
bun run start

# In another terminal
ngrok http 3000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`) and set it as your webhook URL in Intercom.

## API Endpoints

### `POST /webhook`
Receives Intercom webhook events. Automatically:
- Verifies webhook signature
- Extracts customer message
- Generates citation-verified response
- Replies to conversation
- Adds internal verification note

### `GET /health`
Returns server status and loaded knowledge base.

### `POST /test`
Test endpoint for local development without webhooks.

```bash
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"question": "What is your refund policy?"}'
```

Response:
```json
{
  "answer": "We offer a full refund within 30 days...",
  "confidence": 1.0,
  "needsReview": false,
  "citations": {
    "total": 3,
    "verified": 3
  }
}
```

## Customization

### Knowledge Base

Edit `src/knowledge-base.ts` to add your own support documentation:

```typescript
export const SAMPLE_KNOWLEDGE_BASE: KnowledgeDocument[] = [
  {
    filename: "your-faq.txt",
    content: `Your FAQ content here...`,
  },
  // Add more documents...
];
```

### Confidence Threshold

Adjust when responses are flagged for review:

```bash
# In .env
MIN_CONFIDENCE_THRESHOLD=0.8  # 80% of citations must verify
```

### System Prompt

Customize the bot's personality in `src/intercom-bot.ts`:

```typescript
const systemPrompt = `You are a helpful customer support agent...`;
```

## Production Considerations

1. **Webhook Security**: Always verify webhook signatures in production
2. **Error Handling**: Add retry logic and dead letter queues
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Monitoring**: Track confidence scores and flag patterns
5. **Caching**: Cache `fileDataParts` to avoid re-uploading documents
6. **Human Handoff**: Route low-confidence conversations to human agents

## Files

```
intercom-bot/
├── src/
│   ├── intercom-bot.ts    # Core bot class
│   ├── server.ts          # Express webhook server
│   ├── demo.ts            # Standalone demo script
│   └── knowledge-base.ts  # Sample documentation
├── .env.example           # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### "Bot not ready"
The knowledge base is still loading. Wait a few seconds after server start.

### "No admin ID configured"
Set `INTERCOM_ADMIN_ID` in your `.env` file to enable replies.

### Webhook signature verification fails
Ensure `INTERCOM_CLIENT_SECRET` matches your app's client secret.

### No response from bot
Check that you've subscribed to the correct webhook topics in Intercom.

## Related

- [DeepCitation Documentation](https://deepcitation.com/docs)
- [Intercom Developer Docs](https://developers.intercom.com/docs)
- [Basic Verification Example](../basic-verification)
- [Next.js Example](../nextjs-ai-sdk)
