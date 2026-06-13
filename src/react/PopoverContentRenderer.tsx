import type React from "react";
import { memo } from "react";
import type { SupportingFact } from "../types/citation.js";
import type { PageImage, Verification } from "../types/verification.js";
import { CitationErrorBoundary } from "./CitationErrorBoundary.js";
import type { IndicatorVariant } from "./types.js";
import { DefaultPopoverContent, type PopoverViewState } from "./DefaultPopoverContent.js";
import type { EvidenceKeyholeRenderProps } from "./EvidenceTray.js";
import type { BaseCitationProps, DownloadInfo, PopoverAction } from "./types.js";

export interface PopoverContentRendererProps {
  renderPopoverContent?: (props: {
    citation: BaseCitationProps["citation"];
    verification: Verification | null;
    status: import("../types/citation.js").CitationStatus;
  }) => React.ReactNode;
  renderEvidenceKeyhole?: (props: EvidenceKeyholeRenderProps) => React.ReactNode;
  renderExpandedPage?: (props: {
    onCollapse: () => void;
    onDisplayedSizeChange?: (width: number, height: number) => void;
  }) => React.ReactNode;
  citation: BaseCitationProps["citation"];
  verification: Verification | null;
  status: import("../types/citation.js").CitationStatus;
  isLoading: boolean;
  isVisible: boolean;
  sourceTitle?: string;
  claimText?: string;
  indicatorVariant: IndicatorVariant;
  viewState: PopoverViewState;
  onViewStateChange: (viewState: PopoverViewState) => void;
  expandedImageSrcOverride: string | null;
  onExpandedWidthChange?: (width: number | null, source?: "expanded-keyhole" | "expanded-page" | null) => void;
  pageImages?: PageImage[];
  availablePages?: number[];
  prevBeforeExpandedPageRef: React.RefObject<"summary" | "expanded-keyhole">;
  download?: DownloadInfo;
  escapeInterceptRef?: React.MutableRefObject<(() => void) | null>;
  customPopoverActions?: PopoverAction[];
  supportingFacts?: SupportingFact[];
  supportingFactVerifications?: (Verification | undefined)[];
  parentInstanceId?: string;
}

/**
 * Renders popover content — either a custom render prop or the default.
 * Extracted as a named component so React can track it as a stable fiber type
 * for proper reconciliation (avoids remounting on every parent render).
 */
export const PopoverContentRenderer = memo(function PopoverContentRenderer({
  renderPopoverContent,
  renderEvidenceKeyhole,
  renderExpandedPage,
  citation,
  verification,
  status,
  isLoading,
  isVisible,
  sourceTitle,
  claimText,
  indicatorVariant,
  viewState,
  onViewStateChange,
  expandedImageSrcOverride,
  onExpandedWidthChange,
  pageImages,
  availablePages,
  prevBeforeExpandedPageRef,
  download,
  escapeInterceptRef,
  customPopoverActions,
  supportingFacts,
  supportingFactVerifications,
  parentInstanceId,
}: PopoverContentRendererProps) {
  if (renderPopoverContent) {
    const CustomContent = renderPopoverContent;
    return (
      <CitationErrorBoundary>
        <CustomContent citation={citation} verification={verification} status={status} />
      </CitationErrorBoundary>
    );
  }
  return (
    <CitationErrorBoundary>
      <DefaultPopoverContent
        citation={citation}
        verification={verification}
        status={status}
        isLoading={isLoading}
        isVisible={isVisible}
        sourceTitle={sourceTitle}
        claimText={claimText}
        indicatorVariant={indicatorVariant}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        expandedImageSrcOverride={expandedImageSrcOverride}
        onExpandedWidthChange={onExpandedWidthChange}
        pageImages={pageImages}
        availablePages={availablePages}
        prevBeforeExpandedPageRef={prevBeforeExpandedPageRef}
        download={download}
        escapeInterceptRef={escapeInterceptRef}
        customPopoverActions={customPopoverActions}
        supportingFacts={supportingFacts}
        supportingFactVerifications={supportingFactVerifications}
        parentInstanceId={parentInstanceId}
        renderEvidenceKeyhole={renderEvidenceKeyhole}
        renderExpandedPage={renderExpandedPage}
      />
    </CitationErrorBoundary>
  );
});
