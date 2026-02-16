import type { Citation } from "../../types/citation";
import type { SearchStatus } from "../../types/search";
import type { UrlAccessStatus, Verification } from "../../types/verification";
import type { UrlFetchStatus } from "../types";

export const allUrlStatuses: Array<{
  status: UrlFetchStatus;
  description: string;
}> = [
  { status: "verified", description: "Verified" },
  { status: "partial", description: "Partial" },
  { status: "pending", description: "Pending" },
  { status: "accessible", description: "Accessible" },
  { status: "redirected", description: "Redirected" },
  { status: "redirected_valid", description: "Redirected Valid" },
  { status: "blocked_antibot", description: "Blocked Anti-bot" },
  { status: "blocked_login", description: "Blocked Login" },
  { status: "blocked_paywall", description: "Blocked Paywall" },
  { status: "blocked_geo", description: "Blocked Geo" },
  { status: "blocked_rate_limit", description: "Blocked Rate Limit" },
  { status: "error_timeout", description: "Error Timeout" },
  { status: "error_not_found", description: "Error 404" },
  { status: "error_server", description: "Error Server" },
  { status: "error_network", description: "Error Network" },
  { status: "unknown", description: "Unknown" },
];

/** All verification statuses for comprehensive popover showcase */
export const allVerificationStatuses: Array<{
  status: SearchStatus;
  label: string;
  description: string;
  color: string;
}> = [
  // Green statuses
  {
    status: "found",
    label: "Found",
    description: "Exact match verified",
    color: "green",
  },
  {
    status: "found_anchor_text_only",
    label: "Anchor Text Only",
    description: "Anchor text matched",
    color: "green",
  },
  {
    status: "found_phrase_missed_anchor_text",
    label: "Phrase (Missed Anchor)",
    description: "Full phrase found but anchor text differed",
    color: "green",
  },
  // Amber statuses
  {
    status: "found_on_other_page",
    label: "Other Page",
    description: "Found on different page",
    color: "amber",
  },
  {
    status: "found_on_other_line",
    label: "Other Line",
    description: "Found on different line",
    color: "amber",
  },
  {
    status: "partial_text_found",
    label: "Partial Text",
    description: "Partial text matched",
    color: "amber",
  },
  {
    status: "first_word_found",
    label: "First Word",
    description: "Only first word matched",
    color: "amber",
  },
  // Red statuses
  {
    status: "not_found",
    label: "Not Found",
    description: "Citation could not be verified",
    color: "red",
  },
  // Gray statuses
  {
    status: "pending",
    label: "Pending",
    description: "Verification in progress",
    color: "gray",
  },
  {
    status: "loading",
    label: "Loading",
    description: "Loading verification",
    color: "gray",
  },
];

// =============================================================================
// URL ACCESS FAILURE FIXTURES
// =============================================================================

/** Helper to create a URL citation fixture with a realistic domain/URL. */
function makeUrlCitation(url: string, domain: string, title: string): Citation {
  return {
    type: "url",
    url,
    domain,
    title,
    fullPhrase: `According to ${title}, the key finding was significant.`,
    anchorText: "the key finding was significant",
    citationNumber: 1,
  };
}

/** Helper to create a verification with URL access failure. */
function makeUrlFailureVerification(urlAccessStatus: UrlAccessStatus, errorMessage?: string): Verification {
  return {
    status: "not_found",
    verifiedPageNumber: -1,
    url: {
      urlAccessStatus,
      urlVerificationError: errorMessage ?? null,
    },
  };
}

/** URL access failure fixtures for showcase and testing. */
export const urlAccessFailureFixtures: Array<{
  label: string;
  description: string;
  category: "blocked" | "error";
  citation: Citation;
  verification: Verification;
}> = [
  // Blocked scenarios (amber — potentially resolvable by the user)
  {
    label: "Paywall",
    description: "Site requires paid subscription",
    category: "blocked",
    citation: makeUrlCitation(
      "https://www.nytimes.com/2024/03/15/business/economy/gdp-growth.html",
      "nytimes.com",
      "GDP Growth Exceeds Expectations in Q1",
    ),
    verification: makeUrlFailureVerification("blocked"),
  },
  {
    label: "Login Required",
    description: "Page requires authentication",
    category: "blocked",
    citation: makeUrlCitation(
      "https://members.example.com/research/annual-report",
      "members.example.com",
      "Annual Research Report 2024",
    ),
    verification: makeUrlFailureVerification("forbidden"),
  },
  {
    label: "Geo-Restricted",
    description: "Content not available in server region",
    category: "blocked",
    citation: makeUrlCitation(
      "https://www.bbc.co.uk/iplayer/episode/b09xyz123",
      "bbc.co.uk",
      "BBC Documentary: Climate Change",
    ),
    verification: makeUrlFailureVerification("blocked", "Content is only available in the UK"),
  },
  {
    label: "Anti-Bot",
    description: "Bot protection blocked crawler",
    category: "blocked",
    citation: makeUrlCitation(
      "https://protected-site.com/data/quarterly-results",
      "protected-site.com",
      "Quarterly Financial Results",
    ),
    verification: makeUrlFailureVerification("blocked", "Cloudflare challenge page detected"),
  },
  {
    label: "Rate Limited",
    description: "Too many requests to domain",
    category: "blocked",
    citation: makeUrlCitation(
      "https://api.example.com/v2/articles/12345",
      "api.example.com",
      "API Documentation Article",
    ),
    verification: makeUrlFailureVerification("blocked", "HTTP 429: Too Many Requests"),
  },
  // Error scenarios (red — likely can't be resolved without fixing the URL)
  {
    label: "404 Not Found",
    description: "Page moved or deleted",
    category: "error",
    citation: makeUrlCitation(
      "https://example.com/blog/deleted-post-2023",
      "example.com",
      "Understanding Market Trends",
    ),
    verification: makeUrlFailureVerification("not_found"),
  },
  {
    label: "Server Error",
    description: "Website experiencing issues",
    category: "error",
    citation: makeUrlCitation(
      "https://unstable-service.com/api/reports",
      "unstable-service.com",
      "Service Status Report",
    ),
    verification: makeUrlFailureVerification("server_error", "HTTP 503: Service Unavailable"),
  },
  {
    label: "Timeout",
    description: "Website too slow to respond",
    category: "error",
    citation: makeUrlCitation(
      "https://slow-cdn.example.com/resources/whitepaper.html",
      "slow-cdn.example.com",
      "Industry Whitepaper 2024",
    ),
    verification: makeUrlFailureVerification("timeout", "Request timed out after 30 seconds"),
  },
  {
    label: "Network Error",
    description: "Domain unreachable",
    category: "error",
    citation: makeUrlCitation(
      "https://nonexistent-domain.test/article/research",
      "nonexistent-domain.test",
      "Research Findings Summary",
    ),
    verification: makeUrlFailureVerification("network_error", "DNS resolution failed"),
  },
];
