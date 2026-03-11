/**
 * Build popover DOM content from verification data.
 */
import type { VerificationData } from "./types.js";

const STATUS_LABELS: Record<string, { label: string; icon: string }> = {
  found: { label: "Verified", icon: "✓" },
  found_anchor_text_only: { label: "Partial Match", icon: "~" },
  found_phrase_missed_anchor_text: { label: "Partial Match", icon: "~" },
  found_on_other_page: { label: "Partial Match", icon: "~" },
  found_on_other_line: { label: "Partial Match", icon: "~" },
  partial_text_found: { label: "Partial Match", icon: "~" },
  first_word_found: { label: "Partial Match", icon: "~" },
  not_found: { label: "Not Found", icon: "✗" },
  loading: { label: "Loading…", icon: "⏳" },
  pending: { label: "Pending", icon: "⏳" },
  skipped: { label: "Skipped", icon: "—" },
};

const STATUS_CLASSES: Record<string, string> = {
  found: "dc-pop-verified",
  not_found: "dc-pop-not-found",
  loading: "dc-pop-pending",
  pending: "dc-pop-pending",
  skipped: "dc-pop-pending",
};

function getStatusClass(status: string | undefined): string {
  if (!status) return "dc-pop-pending";
  if (STATUS_CLASSES[status]) return STATUS_CLASSES[status];
  // Any "found_*" or "partial_*" variant → partial
  if (status.startsWith("found_") || status.startsWith("partial") || status === "first_word_found") {
    return "dc-pop-partial";
  }
  return "dc-pop-pending";
}

export function buildPopoverContent(data: VerificationData): HTMLDivElement {
  const container = document.createElement("div");
  container.className = "dc-pop-content";

  // Status header
  const header = document.createElement("div");
  const statusInfo = STATUS_LABELS[data.status ?? "pending"] ?? STATUS_LABELS.pending;
  header.className = `dc-pop-header ${getStatusClass(data.status)}`;
  header.textContent = `${statusInfo.icon} ${statusInfo.label}`;
  container.appendChild(header);

  // Source label
  const sourceLabel = data.label ?? data.url?.verifiedTitle ?? data.url?.verifiedDomain;
  if (sourceLabel) {
    const source = document.createElement("div");
    source.className = "dc-pop-source";
    source.textContent = sourceLabel;

    if (data.document?.verifiedPageNumber != null) {
      const isImage = data.document.mimeType?.startsWith("image/");
      const loc = isImage ? "Image" : `p. ${data.document.verifiedPageNumber}`;
      source.textContent += ` — ${loc}`;
    }
    container.appendChild(source);
  }

  // Claim blockquote
  const quote = data.verifiedFullPhrase ?? data.verifiedMatchSnippet ?? data.citation?.fullPhrase;
  if (quote) {
    const blockquote = document.createElement("blockquote");
    blockquote.className = "dc-pop-quote";
    const truncated = quote.length > 200 ? `${quote.slice(0, 200)}…` : quote;
    blockquote.textContent = `"${truncated}"`;
    container.appendChild(blockquote);
  }

  // Evidence image
  if (data.evidence?.src) {
    const img = document.createElement("img");
    img.className = "dc-pop-image";
    img.src = data.evidence.src;
    img.alt = "Evidence snippet";
    img.loading = "lazy";
    img.setAttribute("data-dc-expandable", "true");
    container.appendChild(img);
  }

  return container;
}

export function buildExpandedView(imageSrc: string): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "dc-pop-expanded-overlay";

  const img = document.createElement("img");
  img.className = "dc-pop-expanded-image";
  img.src = imageSrc;
  img.alt = "Evidence (expanded)";

  overlay.appendChild(img);
  return overlay;
}
