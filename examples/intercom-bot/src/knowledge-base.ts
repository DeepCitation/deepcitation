/**
 * Sample Knowledge Base
 *
 * This module contains sample support documentation that the bot uses
 * to answer customer questions. In production, you would typically:
 *
 * - Load documents from your help center or CMS
 * - Include product manuals, FAQs, and policy documents
 * - Update documents when content changes
 */

export interface KnowledgeDocument {
  content: string;
  filename: string;
}

/**
 * Sample ACME Corporation Support Documentation
 */
export const SAMPLE_KNOWLEDGE_BASE: KnowledgeDocument[] = [
  {
    filename: "refund-policy.txt",
    content: `# ACME Corporation Refund Policy

## Standard Refunds
We offer a full refund within 30 days of purchase for all physical products. Items must be returned in original packaging and unused condition.

## Digital Products
Digital products, including software licenses and downloadable content, are non-refundable once the download link has been accessed or the license key has been activated.

## Refund Process
1. Contact our support team with your order number
2. Receive a prepaid return shipping label (for physical products)
3. Ship the item back within 14 days
4. Refund processed within 5-7 business days after receipt

## Exceptions
- Customized or personalized items cannot be returned
- Products purchased during clearance sales are final sale
- Gift cards are non-refundable

## Contact
For refund requests, email refunds@acme.example.com or call 1-800-ACME-HELP.`,
  },
  {
    filename: "shipping-information.txt",
    content: `# ACME Corporation Shipping Information

## Shipping Options

### Standard Shipping
- Cost: $5.99 for orders under $50, FREE for orders $50+
- Delivery: 5-7 business days
- Available: Continental United States only

### Express Shipping
- Cost: $12.99
- Delivery: 2-3 business days
- Available: All 50 US states

### Overnight Shipping
- Cost: $24.99
- Delivery: Next business day (order by 2 PM EST)
- Available: Major metropolitan areas only

## International Shipping
We ship to Canada, UK, and EU countries.
- Cost: Starting at $19.99, calculated at checkout
- Delivery: 7-14 business days
- Note: Customer responsible for customs duties and taxes

## Order Tracking
All orders include tracking. You'll receive an email with tracking number within 24 hours of shipment.

## Shipping Restrictions
- Hazardous materials cannot be shipped via air
- Some products restricted to certain regions
- PO Boxes not eligible for overnight delivery`,
  },
  {
    filename: "account-management.txt",
    content: `# ACME Account Management

## Password Reset
To reset your password:
1. Click "Forgot Password" on the login page
2. Enter your registered email address
3. Check your inbox for a reset link (valid for 24 hours)
4. Create a new password (minimum 8 characters, must include number)

## Two-Factor Authentication (2FA)
We strongly recommend enabling 2FA for account security:
1. Go to Account Settings > Security
2. Click "Enable 2FA"
3. Scan the QR code with your authenticator app
4. Enter the 6-digit code to confirm

Supported apps: Google Authenticator, Authy, Microsoft Authenticator

## Account Deletion
To permanently delete your account:
1. Go to Account Settings > Privacy
2. Click "Delete Account"
3. Confirm by entering your password
4. Account and all data deleted within 30 days

Note: Active subscriptions must be cancelled before deletion.

## Data Export
You can export your data anytime:
1. Go to Account Settings > Privacy
2. Click "Export My Data"
3. Download link sent to your email within 48 hours`,
  },
  {
    filename: "warranty-information.txt",
    content: `# ACME Product Warranty

## Standard Warranty Coverage
All ACME products include a 2-year manufacturer warranty covering:
- Manufacturing defects
- Component failures under normal use
- Electrical malfunctions

## What's Not Covered
- Physical damage from drops, spills, or misuse
- Normal wear and tear
- Modifications or unauthorized repairs
- Commercial use of consumer products

## Extended Warranty
Purchase ACME Care+ for extended coverage:
- 3 additional years of protection
- Accidental damage coverage (2 incidents)
- Priority customer support
- Cost: $49.99 for products under $200, $99.99 for products $200+

## Warranty Claims
To file a warranty claim:
1. Contact support with your product serial number
2. Describe the issue with photos if possible
3. Receive a Return Merchandise Authorization (RMA)
4. Ship product with RMA number visible
5. Replacement or repair within 10 business days

## Warranty Registration
Register your product within 30 days of purchase at acme.example.com/register for:
- Faster warranty claims
- Product recall notifications
- Exclusive offers and updates`,
  },
  {
    filename: "product-support.txt",
    content: `# ACME Product Support

## Contact Options

### Live Chat
Available 24/7 on our website
Average response time: 2 minutes

### Phone Support
1-800-ACME-HELP (1-800-226-3435)
Hours: Monday-Friday 8 AM - 8 PM EST
Saturday: 9 AM - 5 PM EST

### Email Support
support@acme.example.com
Response time: Within 24 business hours

## Self-Service Resources
- Knowledge Base: help.acme.example.com
- Video Tutorials: youtube.com/acmesupport
- Community Forum: community.acme.example.com

## Technical Support Tiers

### Tier 1 (Free)
- Basic troubleshooting
- Product setup assistance
- Account issues

### Tier 2 (Premium subscribers)
- Advanced technical support
- Remote diagnostics
- Priority queue

### Tier 3 (Enterprise)
- Dedicated support engineer
- Custom SLA
- On-site support available

## Before Contacting Support
Please have ready:
- Product serial number or order number
- Description of the issue
- Steps already attempted
- Any error messages or codes`,
  },
];

/**
 * Get the combined knowledge base content for display
 */
export function getKnowledgeBaseSummary(): string {
  return SAMPLE_KNOWLEDGE_BASE.map(doc => `- ${doc.filename}`).join("\n");
}
