import { FOCUS_RING_CLASSES, HIDE_SCROLLBAR_STYLE, HITBOX_EXTEND_8x14 } from "./constants.js";
import { useTranslation } from "./i18n.js";
import { ChevronRightIcon, XIcon } from "./icons.js";
import { cn } from "./utils.js";

// =============================================================================
// TYPES
// =============================================================================

export interface PagePickerProps {
  /** Sorted, deduped available pages. */
  pages: number[];
  /** The verified/active page (highlighted). */
  activePage: number;
  /**
   * Called when any picker target is clicked.
   * For the active-page pill, the parent maps this to its onClose semantic
   * (collapse expanded view if open, no-op otherwise).
   * For neighbors and dots, the parent opens the expanded-page view for that page.
   */
  onPageClick: (page: number) => void;
  isImage?: boolean;
  /**
   * True when the popover is currently in expanded-page view.
   * Controls whether the active-page pill renders an X (close) or chevron (expand).
   */
  isExpanded?: boolean;
}

// =============================================================================
// INTERNAL PILL STYLES
// =============================================================================

const PILL_MUTED_CLASSES = "bg-dc-muted text-dc-muted-foreground border-dc-border";

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Inline navigation strip for multi-page citations.
 *
 * Renders:
 * - Active page: pill in active/close state (X icon, blue styling).
 * - activePage ± 1 (when present): descriptive pill with chevron.
 * - All other pages: small dot buttons (w-1.5 h-1.5 rounded-full).
 *
 * The strip can overflow horizontally inside its container — acceptable for v1.
 */
export function PagePicker({ pages, activePage, onPageClick, isImage, isExpanded }: PagePickerProps) {
  const t = useTranslation();

  if (pages.length === 0) return null;

  return (
    <>
      <style>{`[data-dc-page-picker]::-webkit-scrollbar { display: none; }`}</style>
      <div
        data-dc-page-picker=""
        className="flex items-center gap-1 overflow-x-auto"
        style={HIDE_SCROLLBAR_STYLE}
        role="group"
        aria-label={t("aria.pageNavigation")}
      >
        {pages.map(page => {
          const isActive = page === activePage;
          const isNeighbor = page === activePage - 1 || page === activePage + 1;
          const label = isImage ? t("location.image") : t("location.page", { pageNumber: page });

          if (isActive) {
            return (
              <button
                key={page}
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onPageClick(page);
                }}
                className={cn(
                  "relative inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded-dc-md border cursor-pointer",
                  "transition-colors bg-dc-primary/10 text-dc-primary border-dc-primary/30 hover:bg-dc-primary/15",
                  FOCUS_RING_CLASSES,
                  HITBOX_EXTEND_8x14,
                )}
                aria-label={
                  isExpanded
                    ? isImage
                      ? t("aria.closeImageView")
                      : t("aria.closePageViewNum", { pageNumber: page })
                    : isImage
                      ? t("action.viewImage")
                      : t("action.expandFullPageNum", { pageNumber: page })
                }
                title={isExpanded ? t("action.closeExpanded") : undefined}
              >
                <span>{label}</span>
                <span className="size-3 inline-flex items-center justify-center">
                  {isExpanded ? <XIcon /> : <ChevronRightIcon />}
                </span>
              </button>
            );
          }

          if (isNeighbor) {
            return (
              <button
                key={page}
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onPageClick(page);
                }}
                className={cn(
                  "relative inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium rounded-dc-md border cursor-pointer",
                  "transition-colors",
                  PILL_MUTED_CLASSES,
                  "hover:bg-dc-muted",
                  FOCUS_RING_CLASSES,
                  HITBOX_EXTEND_8x14,
                )}
                aria-label={isImage ? t("action.viewImage") : t("action.expandFullPageNum", { pageNumber: page })}
              >
                <span>{label}</span>
                <span className="size-3">
                  <ChevronRightIcon />
                </span>
              </button>
            );
          }

          return (
            <button
              key={page}
              type="button"
              data-dc-page-dot=""
              aria-label={t("aria.gotoPageNum", { pageNumber: page })}
              onClick={e => {
                e.stopPropagation();
                onPageClick(page);
              }}
              className={cn(
                "relative w-1.5 h-1.5 rounded-full shrink-0 cursor-pointer transition-colors duration-120",
                "bg-dc-muted-foreground/40 hover:bg-dc-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-ring/40",
                HITBOX_EXTEND_8x14,
              )}
            />
          );
        })}
      </div>
    </>
  );
}
