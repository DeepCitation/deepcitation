import type { SearchStatus } from "../../types/search";
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
