import { describe, expect, it } from "@jest/globals";
import { render } from "@testing-library/react";
import { CitationContentDisplay, type CitationContentDisplayProps } from "../react/CitationContentDisplay";
import type { CitationStatusIndicatorProps, SpinnerStage } from "../react/CitationStatusIndicator";
import { MISS_WAVY_UNDERLINE_STYLE } from "../react/constants";
import type { Citation, CitationStatus } from "../types/citation";

/** Minimal props factory for CitationContentDisplay footnote tests. */
function makeProps(overrides: Partial<CitationContentDisplayProps> = {}): CitationContentDisplayProps {
  const citation: Citation = {
    type: "document",
    attachmentId: "doc1",
    pageNumber: 1,
    citationNumber: 3,
    anchorText: "",
    fullPhrase: "Revenue grew 15%",
  };

  const status: CitationStatus = {
    isVerified: false,
    isMiss: false,
    isPartialMatch: false,
    isPending: false,
  };

  const indicatorProps: CitationStatusIndicatorProps = {
    status,
    indicatorVariant: "none",
    shouldShowSpinner: false,
    isVerified: false,
    isPartialMatch: false,
    isMiss: false,
    spinnerStage: "active" as SpinnerStage,
  };

  return {
    citation,
    status,
    citationKey: "test-key",
    displayText: "3",
    resolvedContent: "number",
    variant: "footnote",
    statusClasses: "",
    isVerified: false,
    isPartialMatch: false,
    isMiss: false,
    shouldShowSpinner: false,
    indicatorProps,
    isOpen: false,
    ...overrides,
  };
}

describe("CitationContentDisplay — footnote variant", () => {
  it("renders neutral gray by default (no status flags)", () => {
    const { container } = render(<CitationContentDisplay {...makeProps()} />);
    const sup = container.querySelector("sup");
    expect(sup).toBeInTheDocument();
    // Default neutral gray: text-gray-500 dark:text-gray-400
    expect(sup?.className).toContain("text-gray-500");
  });

  it("renders green for verified status", () => {
    const { container } = render(
      <CitationContentDisplay
        {...makeProps({
          isVerified: true,
          indicatorProps: {
            ...makeProps().indicatorProps,
            isVerified: true,
          },
        })}
      />,
    );
    const sup = container.querySelector("sup");
    expect(sup?.className).toContain("text-green-600");
  });

  it("renders amber for partial match status", () => {
    const { container } = render(
      <CitationContentDisplay
        {...makeProps({
          isPartialMatch: true,
          indicatorProps: {
            ...makeProps().indicatorProps,
            isPartialMatch: true,
          },
        })}
      />,
    );
    const sup = container.querySelector("sup");
    expect(sup?.className).toContain("text-amber-500");
  });

  it("renders red for miss status", () => {
    const { container } = render(
      <CitationContentDisplay
        {...makeProps({
          isMiss: true,
          indicatorProps: {
            ...makeProps().indicatorProps,
            isMiss: true,
          },
        })}
      />,
    );
    const sup = container.querySelector("sup");
    expect(sup?.className).toContain("text-red-500");
  });

  it("applies wavy underline style for miss state", () => {
    const { container } = render(
      <CitationContentDisplay
        {...makeProps({
          isMiss: true,
        })}
      />,
    );
    const sup = container.querySelector("sup");
    const numberSpan = sup?.querySelector("span");
    expect(numberSpan).toBeInTheDocument();

    // The inline wavy underline style should be applied
    const style = numberSpan?.style;
    expect(style?.textDecorationStyle).toBe(MISS_WAVY_UNDERLINE_STYLE.textDecorationStyle);
  });

  it("renders citation number text", () => {
    const { container } = render(<CitationContentDisplay {...makeProps()} />);
    const sup = container.querySelector("sup");
    expect(sup?.textContent).toContain("3");
  });

  it("does not apply wavy underline when spinner is showing", () => {
    const { container } = render(
      <CitationContentDisplay
        {...makeProps({
          isMiss: true,
          shouldShowSpinner: true,
          indicatorProps: {
            ...makeProps().indicatorProps,
            isMiss: true,
            shouldShowSpinner: true,
          },
        })}
      />,
    );
    const sup = container.querySelector("sup");
    const numberSpan = sup?.querySelector("span");
    // When spinner is showing, miss styling should not apply
    expect(numberSpan?.style?.textDecorationStyle).toBeFalsy();
  });

  it("renders anchor text when present", () => {
    const citation: Citation = {
      type: "document",
      attachmentId: "doc1",
      pageNumber: 1,
      citationNumber: 3,
      anchorText: "revenue",
      fullPhrase: "Revenue grew 15%",
    };
    const { container } = render(<CitationContentDisplay {...makeProps({ citation })} />);
    expect(container.textContent).toContain("revenue");
    expect(container.textContent).toContain("3");
  });
});
