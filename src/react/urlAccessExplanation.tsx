/**
 * URL access explanation — mapping utilities for URL access failures.
 *
 * Converts API access statuses to UrlFetchStatus values and structured
 * UrlAccessExplanation objects for display in the popover.
 * Includes the UrlAccessExplanationSection rendering component.
 *
 * @packageDocumentation
 */

import type React from "react";
import type { SearchStatus } from "../types/search.js";
import type { UrlAccessStatus } from "../types/verification.js";
import { defaultTranslator, type TranslateFunction, useTranslation } from "./i18n.js";
import type { UrlFetchStatus } from "./types.js";
import { cn } from "./utils.js";

// =============================================================================
// TYPES
// =============================================================================

/** Structured explanation for URL access failures shown in the popover. */
export interface UrlAccessExplanation {
  /** Short status title, e.g., "Paywall Detected" */
  title: string;
  /** 1-sentence explanation of what happened */
  description: string;
  /** Actionable suggestion for the user, or null if nothing can be done */
  suggestion: string | null;
  /** Color scheme: "amber" for blocked (potentially resolvable), "red" for errors */
  colorScheme: "amber" | "red";
}

// =============================================================================
// STATUS MAPPING
// =============================================================================

/**
 * Maps UrlAccessStatus (from verification API response) to UrlFetchStatus (UI layer).
 * Used when the verification object has url-specific access data.
 *
 * For the generic "blocked" status, uses the error message to infer the specific
 * block type (paywall, login, rate limit, geo-restriction, or anti-bot fallback).
 */
export function mapUrlAccessStatusToFetchStatus(status: UrlAccessStatus, errorMessage?: string | null): UrlFetchStatus {
  switch (status) {
    case "accessible":
      return "verified";
    case "redirected":
      return "redirected";
    case "redirected_same_domain":
      return "redirected_valid";
    case "not_found":
      return "error_not_found";
    case "forbidden":
      return "blocked_login";
    case "server_error":
      return "error_server";
    case "timeout":
      return "error_timeout";
    case "blocked":
      return inferBlockedType(errorMessage);
    case "network_error":
      return "error_network";
    case "pending":
      return "pending";
    case "unknown":
      return "unknown";
  }
}

/**
 * Infer specific blocked type from the error message when the API returns
 * the generic "blocked" status. Falls back to "blocked_antibot" (site protection)
 * as the most common cause.
 */
function inferBlockedType(errorMessage?: string | null): UrlFetchStatus {
  if (!errorMessage) return "blocked_antibot";
  const msg = errorMessage.toLowerCase();
  if (msg.includes("paywall") || msg.includes("subscribe") || msg.includes("subscription")) {
    return "blocked_paywall";
  }
  if (msg.includes("login") || msg.includes("sign in") || msg.includes("sign-in") || msg.includes("authenticate")) {
    return "blocked_login";
  }
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("too many")) {
    return "blocked_rate_limit";
  }
  if (msg.includes("geo") || msg.includes("region") || msg.includes("country") || msg.includes("available in")) {
    return "blocked_geo";
  }
  return "blocked_antibot";
}

/**
 * Maps SearchStatus (from verification response) to UrlFetchStatus (UI layer).
 * Used as fallback when verification.url.urlAccessStatus is not available.
 */
export function mapSearchStatusToFetchStatus(status: SearchStatus | null | undefined): UrlFetchStatus {
  if (!status) return "pending";
  switch (status) {
    case "found":
    case "found_source_match_only":
    case "found_context_missed_source_match":
      return "verified";
    case "found_on_other_page":
    case "found_on_other_line":
    case "partial_text_found":
    case "first_word_found":
      return "partial";
    case "not_found":
      // SearchStatus.not_found means the text wasn't found on the page,
      // NOT that the page returned HTTP 404.  When urlAccessStatus is
      // absent we can't infer URL-level errors from a search miss.
      return "unknown";
    case "loading":
    case "pending":
    case "timestamp_wip":
    case "skipped":
      return "pending";
    default: {
      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    }
  }
}

// =============================================================================
// EXPLANATION RESOLUTION
// =============================================================================

/**
 * Get a structured explanation for URL access failures.
 * Returns null for success/pending/unknown statuses (no explanation needed).
 * Pass a `t` function from `useTranslation()` for i18n support.
 */
export function getUrlAccessExplanation(
  fetchStatus: UrlFetchStatus,
  errorMessage?: string | null,
  t: TranslateFunction = defaultTranslator,
): UrlAccessExplanation | null {
  switch (fetchStatus) {
    // Blocked scenarios (amber — potentially resolvable by the user)
    case "blocked_paywall":
      return {
        title: t("urlAccess.paywall.title"),
        description: errorMessage || t("urlAccess.paywall.description"),
        suggestion: t("urlAccess.paywall.suggestion"),
        colorScheme: "amber",
      };
    case "blocked_login":
      return {
        title: t("urlAccess.login.title"),
        description: errorMessage || t("urlAccess.login.description"),
        suggestion: t("urlAccess.login.suggestion"),
        colorScheme: "amber",
      };
    case "blocked_geo":
      return {
        title: t("urlAccess.geo.title"),
        description: errorMessage || t("urlAccess.geo.description"),
        suggestion: t("urlAccess.geo.suggestion"),
        colorScheme: "amber",
      };
    case "blocked_antibot":
      return {
        title: t("urlAccess.antibot.title"),
        description: errorMessage || t("urlAccess.antibot.description"),
        suggestion: t("urlAccess.antibot.suggestion"),
        colorScheme: "amber",
      };
    case "blocked_rate_limit":
      return {
        title: t("urlAccess.rateLimit.title"),
        description: errorMessage || t("urlAccess.rateLimit.description"),
        suggestion: t("urlAccess.rateLimit.suggestion"),
        colorScheme: "amber",
      };

    // Error scenarios (red — likely can't be resolved without fixing the URL)
    case "error_not_found":
      return {
        title: t("urlAccess.notFound.title"),
        description: errorMessage || t("urlAccess.notFound.description"),
        suggestion: t("urlAccess.notFound.suggestion"),
        colorScheme: "red",
      };
    case "error_server":
      return {
        title: t("urlAccess.server.title"),
        description: errorMessage || t("urlAccess.server.description"),
        suggestion: t("urlAccess.server.suggestion"),
        colorScheme: "red",
      };
    case "error_timeout":
      return {
        title: t("urlAccess.timeout.title"),
        description: errorMessage || t("urlAccess.timeout.description"),
        suggestion: t("urlAccess.timeout.suggestion"),
        colorScheme: "red",
      };
    case "error_network":
      return {
        title: t("urlAccess.network.title"),
        description: errorMessage || t("urlAccess.network.description"),
        suggestion: t("urlAccess.network.suggestion"),
        colorScheme: "red",
      };

    // Non-error statuses — no explanation needed
    default:
      return null;
  }
}

// =============================================================================
// RENDERING COMPONENT
// =============================================================================

/** Colored banner for URL access failures (amber for blocked, red for errors). */
export function UrlAccessExplanationSection({ explanation }: { explanation: UrlAccessExplanation }): React.ReactNode {
  const t = useTranslation();
  const isAmber = explanation.colorScheme === "amber";
  return (
    <div
      className={cn(
        "px-4 py-3 border-b",
        isAmber ? "bg-dc-partial-bg border-dc-partial-border" : "bg-dc-destructive-bg border-dc-destructive-border",
      )}
      role="status"
      aria-label={`${isAmber ? t("misc.warning") : t("misc.error")}: ${explanation.title}`}
    >
      <div
        className={cn(
          "text-sm font-medium mb-1 flex items-center gap-1.5",
          isAmber ? "text-dc-partial" : "text-dc-destructive",
        )}
      >
        <span className="shrink-0 text-xs" aria-hidden="true">
          {isAmber ? "\u26A0" : "\u2718"}
        </span>
        {explanation.title}
      </div>
      <p className={cn("text-xs", isAmber ? "text-dc-partial" : "text-dc-destructive")}>{explanation.description}</p>
      {explanation.suggestion && (
        <p className={cn("text-xs mt-1.5 opacity-80", isAmber ? "text-dc-partial" : "text-dc-destructive")}>
          {explanation.suggestion}
        </p>
      )}
    </div>
  );
}
