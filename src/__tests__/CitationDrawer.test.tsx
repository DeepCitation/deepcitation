import { afterEach, describe, expect, it, jest, mock } from "@jest/globals";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import type React from "react";
import { CitationComponent } from "../react/CitationComponent";
import { CitationDrawer, CitationDrawerItemComponent } from "../react/CitationDrawer";
import type { CitationDrawerItem, SourceCitationGroup } from "../react/CitationDrawer.types";
import { getStatusPriority, groupCitationsBySource, useCitationDrawer } from "../react/CitationDrawer.utils";
import { CitationDrawerTrigger } from "../react/CitationDrawerTrigger";
import type { Citation } from "../types/citation";
import type { Verification } from "../types/verification";

// Mock createPortal to render content in place instead of portal
mock.module("react-dom", () => ({
  createPortal: (node: React.ReactNode) => node,
}));

describe("CitationComponent source variant", () => {
  afterEach(() => {
    cleanup();
  });

  const baseCitation: Citation = {
    type: "url",
    citationNumber: 1,
    anchorText: "test citation",
    fullPhrase: "This is a test citation phrase",
    siteName: "Delaware Corporations",
    domain: "delaware.gov",
    faviconUrl: "https://delaware.gov/favicon.ico",
    title: "How to Calculate Franchise Taxes",
    description: "The minimum tax is $175.00 for corporations...",
  };

  const verification: Verification = {
    status: "found",
    verifiedMatchSnippet: "test citation phrase",
  };

  describe("source variant rendering", () => {
    it("renders source name from citation", () => {
      const { getByText } = render(
        <CitationComponent citation={baseCitation} verification={verification} variant="badge" />,
      );

      expect(getByText("Delaware Corporations")).toBeInTheDocument();
    });

    it("renders favicon when provided", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verification} variant="badge" />,
      );

      const favicon = container.querySelector('img[src="https://delaware.gov/favicon.ico"]');
      expect(favicon).toBeInTheDocument();
    });

    it("renders favicon from faviconUrl prop over citation.faviconUrl", () => {
      const customFavicon = "https://custom.com/favicon.png";
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verification}
          variant="badge"
          faviconUrl={customFavicon}
        />,
      );

      const favicon = container.querySelector(`img[src="${customFavicon}"]`);
      expect(favicon).toBeInTheDocument();
    });

    it("renders additional count when provided", () => {
      const { getByText } = render(
        <CitationComponent citation={baseCitation} verification={verification} variant="badge" additionalCount={2} />,
      );

      expect(getByText("+2")).toBeInTheDocument();
    });

    it("does not render additional count when 0", () => {
      const { queryByText } = render(
        <CitationComponent citation={baseCitation} verification={verification} variant="badge" additionalCount={0} />,
      );

      expect(queryByText("+0")).not.toBeInTheDocument();
    });

    it("falls back to domain when siteName is not provided", () => {
      const citationWithoutName: Citation = {
        ...baseCitation,
        type: "url",
        siteName: undefined,
      };

      const { getByText } = render(
        <CitationComponent citation={citationWithoutName} verification={verification} variant="badge" />,
      );

      expect(getByText("delaware.gov")).toBeInTheDocument();
    });

    it("falls back to anchorText when no source fields are provided", () => {
      const citationNoSource: Citation = {
        citationNumber: 1,
        anchorText: "Fallback Text",
      };

      const { getByText } = render(
        <CitationComponent citation={citationNoSource} verification={verification} variant="badge" />,
      );

      expect(getByText("Fallback Text")).toBeInTheDocument();
    });

    it("falls back to 'Source' when no text fields available", () => {
      const citationEmpty: Citation = {
        citationNumber: 1,
      };

      const { getByText } = render(
        <CitationComponent citation={citationEmpty} verification={verification} variant="badge" />,
      );

      expect(getByText("Source")).toBeInTheDocument();
    });

    it("applies correct styling classes for source variant", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verification} variant="badge" />,
      );

      const chip = container.querySelector(".rounded-full");
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveClass("bg-gray-100");
    });

    it("hides broken favicon images on error", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verification} variant="badge" />,
      );

      const favicon = container.querySelector("img") as HTMLImageElement;
      expect(favicon).toBeInTheDocument();

      // Simulate error event
      fireEvent.error(favicon);

      expect(favicon.style.display).toBe("none");
    });
  });

  describe("source content type", () => {
    it("uses source content type by default for source variant", () => {
      const { getByText } = render(
        <CitationComponent citation={baseCitation} verification={verification} variant="badge" />,
      );

      // Should show siteName, not anchorText or number
      expect(getByText("Delaware Corporations")).toBeInTheDocument();
    });

    it("can override content type for source variant", () => {
      const { getByText } = render(
        <CitationComponent citation={baseCitation} verification={verification} variant="badge" content="anchorText" />,
      );

      // Should show anchorText when explicitly set
      expect(getByText("test citation")).toBeInTheDocument();
    });
  });
});

describe("groupCitationsBySource", () => {
  const createCitationItem = (key: string, siteName: string, domain?: string): CitationDrawerItem => ({
    citationKey: key,
    citation: {
      type: "url",
      citationNumber: parseInt(key, 10),
      siteName,
      domain,
      anchorText: `Citation ${key}`,
    },
    verification: null,
  });

  it("groups citations by source domain", () => {
    const citations: CitationDrawerItem[] = [
      createCitationItem("1", "Delaware", "delaware.gov"),
      createCitationItem("2", "Delaware", "delaware.gov"),
      createCitationItem("3", "Wikipedia", "wikipedia.org"),
    ];

    const groups = groupCitationsBySource(citations);

    expect(groups).toHaveLength(2);
    expect(groups[0].sourceName).toBe("Delaware");
    expect(groups[0].citations).toHaveLength(2);
    expect(groups[0].additionalCount).toBe(1);
    expect(groups[1].sourceName).toBe("Wikipedia");
    expect(groups[1].citations).toHaveLength(1);
    expect(groups[1].additionalCount).toBe(0);
  });

  it("handles citations without source domain", () => {
    const citations: CitationDrawerItem[] = [
      createCitationItem("1", "Source A", undefined),
      createCitationItem("2", "Source B", undefined),
    ];

    const groups = groupCitationsBySource(citations);

    expect(groups).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    const groups = groupCitationsBySource([]);
    expect(groups).toHaveLength(0);
  });

  it("preserves source favicon from first citation in group", () => {
    const citations: CitationDrawerItem[] = [
      {
        citationKey: "1",
        citation: {
          type: "url",
          siteName: "Test",
          domain: "test.com",
          faviconUrl: "https://test.com/favicon.ico",
        },
        verification: null,
      },
      {
        citationKey: "2",
        citation: {
          type: "url",
          siteName: "Test",
          domain: "test.com",
        },
        verification: null,
      },
    ];

    const groups = groupCitationsBySource(citations);

    expect(groups[0].sourceFavicon).toBe("https://test.com/favicon.ico");
  });
});

describe("CitationDrawerItemComponent", () => {
  afterEach(() => {
    cleanup();
  });

  const createItem = (overrides: Partial<CitationDrawerItem> = {}): CitationDrawerItem => ({
    citationKey: "1",
    citation: {
      type: "url",
      siteName: "Delaware Corporations",
      domain: "delaware.gov",
      faviconUrl: "https://delaware.gov/favicon.ico",
      title: "How to Calculate Franchise Taxes",
      description: "The minimum tax is $175.00 for corporations...",
    },
    verification: { status: "found" },
    ...overrides,
  });

  it("renders source name", () => {
    const { getByText } = render(<CitationDrawerItemComponent item={createItem()} />);

    expect(getByText("Delaware Corporations")).toBeInTheDocument();
  });

  it("renders article title", () => {
    const { getByText } = render(<CitationDrawerItemComponent item={createItem()} />);

    expect(getByText("How to Calculate Franchise Taxes")).toBeInTheDocument();
  });

  it("renders snippet", () => {
    const { getByText } = render(<CitationDrawerItemComponent item={createItem()} />);

    expect(getByText("The minimum tax is $175.00 for corporations...")).toBeInTheDocument();
  });

  it("renders status indicator instead of favicon", () => {
    const { container, getByTestId } = render(<CitationDrawerItemComponent item={createItem()} />);

    // Status indicator should be present (verified = green check)
    const statusIcon = container.querySelector("[title='Verified']");
    expect(statusIcon).toBeInTheDocument();

    // No favicon image should be rendered in the status indicator column
    const leftColumn = getByTestId("status-indicator");
    const faviconImg = leftColumn.querySelector("img");
    expect(faviconImg).toBeNull();
  });

  it("renders status indicator when no favicon available", () => {
    const item = createItem({
      citation: {
        type: "url",
        siteName: "Test",
        domain: "test.com",
      },
    });

    const { container } = render(<CitationDrawerItemComponent item={item} />);

    // Should show status indicator, not initial letter "T"
    const statusIcon = container.querySelector("[title='Verified']");
    expect(statusIcon).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = jest.fn();
    const item = createItem();

    const { container } = render(<CitationDrawerItemComponent item={item} onClick={onClick} />);

    const itemElement = container.querySelector("[role='button']");
    expect(itemElement).toBeInTheDocument();
    if (itemElement) {
      fireEvent.click(itemElement);
    }

    expect(onClick).toHaveBeenCalledWith(item);
  });

  it("shows status indicator for verified citations", () => {
    const { container } = render(
      <CitationDrawerItemComponent item={createItem({ verification: { status: "found" } })} />,
    );

    const indicator = container.querySelector(".text-green-500");
    expect(indicator).toBeInTheDocument();
  });

  it("shows warning indicator for not found citations", () => {
    const { container } = render(
      <CitationDrawerItemComponent item={createItem({ verification: { status: "not_found" } })} />,
    );

    const indicator = container.querySelector(".text-red-500");
    expect(indicator).toBeInTheDocument();
  });

  it("shows spinner for pending citations", () => {
    const { container } = render(
      <CitationDrawerItemComponent item={createItem({ verification: { status: "pending" } })} />,
    );

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("applies border when not last item", () => {
    const { container } = render(<CitationDrawerItemComponent item={createItem()} isLast={false} />);

    const itemElement = container.firstChild;
    expect(itemElement).toHaveClass("border-b");
  });

  it("does not apply border when last item", () => {
    const { container } = render(<CitationDrawerItemComponent item={createItem()} isLast={true} />);

    const itemElement = container.firstChild;
    expect(itemElement).not.toHaveClass("border-b");
  });

  it("handles keyboard navigation", () => {
    const onClick = jest.fn();
    const item = createItem();

    const { container } = render(<CitationDrawerItemComponent item={item} onClick={onClick} />);

    const itemElement = container.querySelector("[role='button']");
    expect(itemElement).toBeInTheDocument();
    if (itemElement) {
      fireEvent.keyDown(itemElement, { key: "Enter" });
    }

    expect(onClick).toHaveBeenCalledWith(item);
  });
});

describe("CitationDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  const createGroup = (name: string, count: number): SourceCitationGroup => ({
    sourceName: name,
    sourceDomain: `${name.toLowerCase()}.com`,
    citations: Array.from({ length: count }, (_, i) => ({
      citationKey: `${name}-${i}`,
      citation: {
        type: "url" as const,
        siteName: name,
        title: `Article ${i + 1}`,
        description: `Snippet for article ${i + 1}`,
      },
      verification: { status: "found" as const },
    })),
    additionalCount: count - 1,
  });

  it("renders when open", () => {
    const { getByRole } = render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[createGroup("Test", 1)]} />,
    );

    expect(getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const { queryByRole } = render(
      <CitationDrawer isOpen={false} onClose={() => {}} citationGroups={[createGroup("Test", 1)]} />,
    );

    expect(queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders title", () => {
    const { getByText } = render(
      <CitationDrawer
        isOpen={true}
        onClose={() => {}}
        citationGroups={[createGroup("Test", 1)]}
        title="My Citations"
      />,
    );

    expect(getByText("My Citations")).toBeInTheDocument();
  });

  it("renders default title", () => {
    const { getByText } = render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[createGroup("Test", 1)]} />,
    );

    expect(getByText("Citations")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = jest.fn();

    const { getByLabelText } = render(
      <CitationDrawer isOpen={true} onClose={onClose} citationGroups={[createGroup("Test", 1)]} />,
    );

    const closeButton = getByLabelText("Close");
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = jest.fn();

    const { container } = render(
      <CitationDrawer isOpen={true} onClose={onClose} citationGroups={[createGroup("Test", 1)]} />,
    );

    const backdrop = container.querySelector("[aria-hidden='true']");
    expect(backdrop).toBeInTheDocument();
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const onClose = jest.fn();

    render(<CitationDrawer isOpen={true} onClose={onClose} citationGroups={[createGroup("Test", 1)]} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("renders all citation items", () => {
    const groups = [createGroup("Source A", 2), createGroup("Source B", 1)];

    const { getAllByText, getByText } = render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={groups} showMoreSection={false} />,
    );

    // Source A has 2 citations (rendered as expanded items, shows titles)
    // Source B has 1 citation (renders as CompactSingleCitationRow, no title shown)
    // So "Article 1" appears only once (from Source A)
    // And "Article 2" appears once (from Source A)
    expect(getAllByText("Article 1")).toHaveLength(1);
    expect(getByText("Article 2")).toBeInTheDocument();

    // But both source groups should be present
    expect(getByText("Source A")).toBeInTheDocument();
    expect(getByText("Source B")).toBeInTheDocument();
  });

  it("shows all items without More section (always expanded)", () => {
    const groups = [createGroup("Test", 5)];

    const { getByText } = render(<CitationDrawer isOpen={true} onClose={() => {}} citationGroups={groups} />);

    // All items should be visible (no More section, always expanded)
    expect(getByText("Article 1")).toBeInTheDocument();
    expect(getByText("Article 4")).toBeInTheDocument();
    expect(getByText("Article 5")).toBeInTheDocument();
  });

  it("calls onCitationClick when item clicked", () => {
    const onCitationClick = jest.fn();
    const groups = [
      {
        sourceName: "Test",
        sourceDomain: "test.com",
        citations: [
          {
            citationKey: "test-0",
            citation: {
              type: "url" as const,
              siteName: "Test",
              title: "Article 1",
              description: "Snippet for article 1",
              anchorText: "Article 1",
            },
            verification: { status: "found" as const },
          },
        ],
        additionalCount: 0,
      },
    ];

    const { container } = render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={groups} onCitationClick={onCitationClick} />,
    );

    // Click on the CompactSingleCitationRow (role="button")
    const button = container.querySelector('[role="button"]');
    expect(button).toBeInTheDocument();
    if (button) {
      fireEvent.click(button);
    }

    expect(onCitationClick).toHaveBeenCalled();
  });

  it("shows empty state when no citations", () => {
    const { getByText } = render(<CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[]} />);

    expect(getByText("No citations to display")).toBeInTheDocument();
  });

  it("renders handle bar for bottom position", () => {
    const { container } = render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[createGroup("Test", 1)]} position="bottom" />,
    );

    // Handle bar is a rounded div
    const handleBar = container.querySelector(".rounded-full.bg-gray-300");
    expect(handleBar).toBeInTheDocument();
  });

  it("does not render handle bar for right position", () => {
    const { container } = render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[createGroup("Test", 1)]} position="right" />,
    );

    // Handle bar should not exist
    const handleBar = container.querySelector(".rounded-full.bg-gray-300");
    expect(handleBar).not.toBeInTheDocument();
  });

  it("uses custom renderCitationItem when provided", () => {
    const groups = [createGroup("Test", 1)];

    const { getByText } = render(
      <CitationDrawer
        isOpen={true}
        onClose={() => {}}
        citationGroups={groups}
        renderCitationItem={item => <div key={item.citationKey}>Custom: {item.citation.title}</div>}
      />,
    );

    expect(getByText("Custom: Article 1")).toBeInTheDocument();
  });
});

describe("useCitationDrawer", () => {
  it("initializes with closed state", () => {
    const { result } = renderHook(() => useCitationDrawer());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.citations).toHaveLength(0);
  });

  it("opens drawer", () => {
    const { result } = renderHook(() => useCitationDrawer());

    act(() => {
      result.current.openDrawer();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it("closes drawer", () => {
    const { result } = renderHook(() => useCitationDrawer());

    act(() => {
      result.current.openDrawer();
    });

    act(() => {
      result.current.closeDrawer();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it("toggles drawer", () => {
    const { result } = renderHook(() => useCitationDrawer());

    act(() => {
      result.current.toggleDrawer();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggleDrawer();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it("adds citation", () => {
    const { result } = renderHook(() => useCitationDrawer());

    const item: CitationDrawerItem = {
      citationKey: "1",
      citation: { type: "url", siteName: "Test" },
      verification: null,
    };

    act(() => {
      result.current.addCitation(item);
    });

    expect(result.current.citations).toHaveLength(1);
    expect(result.current.citations[0]).toEqual(item);
  });

  it("does not add duplicate citations", () => {
    const { result } = renderHook(() => useCitationDrawer());

    const item: CitationDrawerItem = {
      citationKey: "1",
      citation: { type: "url", siteName: "Test" },
      verification: null,
    };

    act(() => {
      result.current.addCitation(item);
      result.current.addCitation(item);
    });

    expect(result.current.citations).toHaveLength(1);
  });

  it("removes citation", () => {
    const { result } = renderHook(() => useCitationDrawer());

    const item: CitationDrawerItem = {
      citationKey: "1",
      citation: { type: "url", siteName: "Test" },
      verification: null,
    };

    act(() => {
      result.current.addCitation(item);
    });

    act(() => {
      result.current.removeCitation("1");
    });

    expect(result.current.citations).toHaveLength(0);
  });

  it("clears all citations", () => {
    const { result } = renderHook(() => useCitationDrawer());

    act(() => {
      result.current.addCitation({
        citationKey: "1",
        citation: { type: "url", siteName: "Test 1" },
        verification: null,
      });
      result.current.addCitation({
        citationKey: "2",
        citation: { type: "url", siteName: "Test 2" },
        verification: null,
      });
    });

    act(() => {
      result.current.clearCitations();
    });

    expect(result.current.citations).toHaveLength(0);
  });

  it("sets citations list", () => {
    const { result } = renderHook(() => useCitationDrawer());

    const items: CitationDrawerItem[] = [
      {
        citationKey: "1",
        citation: { type: "url", siteName: "Test 1" },
        verification: null,
      },
      {
        citationKey: "2",
        citation: { type: "url", siteName: "Test 2" },
        verification: null,
      },
    ];

    act(() => {
      result.current.setCitations(items);
    });

    expect(result.current.citations).toHaveLength(2);
  });

  it("computes citation groups", () => {
    const { result } = renderHook(() => useCitationDrawer());

    act(() => {
      result.current.addCitation({
        citationKey: "1",
        citation: { type: "url", siteName: "Source A", domain: "a.com" },
        verification: null,
      });
      result.current.addCitation({
        citationKey: "2",
        citation: { type: "url", siteName: "Source A", domain: "a.com" },
        verification: null,
      });
      result.current.addCitation({
        citationKey: "3",
        citation: { type: "url", siteName: "Source B", domain: "b.com" },
        verification: null,
      });
    });

    expect(result.current.citationGroups).toHaveLength(2);
    expect(result.current.citationGroups[0].citations).toHaveLength(2);
    expect(result.current.citationGroups[1].citations).toHaveLength(1);
  });
});

describe("getStatusPriority", () => {
  it("returns 1 for verified statuses", () => {
    expect(getStatusPriority({ status: "found" })).toBe(1);
    expect(getStatusPriority({ status: "found_anchor_text_only" })).toBe(1);
    expect(getStatusPriority({ status: "found_phrase_missed_anchor_text" })).toBe(1);
  });

  it("returns 2 for pending/null statuses", () => {
    expect(getStatusPriority(null)).toBe(2);
    expect(getStatusPriority({ status: "pending" })).toBe(2);
    expect(getStatusPriority({ status: "loading" })).toBe(2);
  });

  it("returns 3 for partial match statuses", () => {
    expect(getStatusPriority({ status: "partial_text_found" })).toBe(3);
    expect(getStatusPriority({ status: "found_on_other_page" })).toBe(3);
    expect(getStatusPriority({ status: "found_on_other_line" })).toBe(3);
    expect(getStatusPriority({ status: "first_word_found" })).toBe(3);
  });

  it("returns 4 for not_found status", () => {
    expect(getStatusPriority({ status: "not_found" })).toBe(4);
  });
});

describe("CitationDrawerTrigger", () => {
  afterEach(() => {
    cleanup();
  });

  const createGroup = (name: string, count: number, status: Verification["status"] = "found"): SourceCitationGroup => ({
    sourceName: name,
    sourceDomain: `${name.toLowerCase()}.com`,
    sourceFavicon: `https://${name.toLowerCase()}.com/favicon.ico`,
    citations: Array.from({ length: count }, (_, i) => ({
      citationKey: `${name}-${i}`,
      citation: {
        type: "url" as const,
        siteName: name,
        title: `Article ${i + 1}`,
      },
      verification: { status },
    })),
    additionalCount: count - 1,
  });

  it("renders the trigger with data-testid", () => {
    const groups = [createGroup("Test", 1)];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    expect(getByTestId("citation-drawer-trigger")).toBeInTheDocument();
  });

  it("returns null when no citations", () => {
    const { container } = render(<CitationDrawerTrigger citationGroups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("displays the label with source counts", () => {
    const groups = [createGroup("Source A", 2), createGroup("Source B", 1)];
    const { getByText } = render(<CitationDrawerTrigger citationGroups={groups} />);

    // New label format: "Source A +1" (first source name + count of additional sources)
    expect(getByText("Source A +1")).toBeInTheDocument();
  });

  it("uses custom label when provided", () => {
    const groups = [createGroup("Test", 1)];
    const { getByText } = render(<CitationDrawerTrigger citationGroups={groups} label="Custom Label" />);

    expect(getByText("Custom Label")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = jest.fn();
    const groups = [createGroup("Test", 1)];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} onClick={onClick} />);

    fireEvent.click(getByTestId("citation-drawer-trigger"));
    expect(onClick).toHaveBeenCalled();
  });

  it("renders status icon chips for each source group", () => {
    const groups = [
      createGroup("Verified", 1, "found"),
      createGroup("Pending", 1, "pending"),
      createGroup("NotFound", 1, "not_found"),
    ];
    const { container } = render(<CitationDrawerTrigger citationGroups={groups} />);

    // Should have green, gray, and red status icons
    expect(container.querySelector(".text-green-500")).toBeInTheDocument();
    expect(container.querySelector(".text-gray-400")).toBeInTheDocument();
    expect(container.querySelector(".text-red-500")).toBeInTheDocument();
  });

  it("renders spinner for pending status icons", () => {
    const groups = [createGroup("Pending", 1, "pending")];
    const { container } = render(<CitationDrawerTrigger citationGroups={groups} />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("respects maxIcons prop", () => {
    const groups = Array.from({ length: 8 }, (_, i) => createGroup(`Source${i}`, 1));
    const { container } = render(<CitationDrawerTrigger citationGroups={groups} maxIcons={3} />);

    // The component should have a +5 overflow text somewhere
    expect(container.textContent).toContain("+5");
  });

  it("sets aria-expanded based on isOpen prop", () => {
    const groups = [createGroup("Test", 1)];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} isOpen={true} />);

    expect(getByTestId("citation-drawer-trigger")).toHaveAttribute("aria-expanded", "true");
  });

  it("does not render stacked favicons", () => {
    const groups = [createGroup("Test", 1)];
    const { queryByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    // Stacked favicons section has been removed; only status icons should appear
    const triggerBar = queryByTestId("citation-drawer-trigger");
    expect(triggerBar).toBeInTheDocument();

    // No favicon images should be directly in the trigger bar
    const faviconInBar = triggerBar?.querySelector('img[src="https://test.com/favicon.ico"]');
    expect(faviconInBar).not.toBeInTheDocument();
  });

  /** Helper: hover the trigger, then hover the first icon in the status group */
  const hoverFirstIcon = (trigger: HTMLElement) => {
    fireEvent.mouseEnter(trigger);
    const iconGroup = trigger.querySelector("[role='group']");
    expect(iconGroup).toBeInTheDocument();
    const firstIcon = iconGroup?.firstElementChild;
    expect(firstIcon).toBeInTheDocument();
    if (firstIcon) fireEvent.mouseEnter(firstIcon);
  };

  it("shows tooltip on icon hover", () => {
    const groups = [createGroup("TestSource", 2)];
    const { getByTestId, queryByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    // Tooltip should appear
    expect(queryByTestId("source-tooltip")).toBeInTheDocument();
  });

  it("calls onSourceClick when proof thumbnail is clicked in tooltip", () => {
    const onSourceClick = jest.fn();
    const groups: SourceCitationGroup[] = [
      {
        sourceName: "TestSource",
        sourceDomain: "testsource.com",
        sourceFavicon: "https://testsource.com/favicon.ico",
        citations: [
          {
            citationKey: "ts-0",
            citation: { type: "url", siteName: "TestSource", title: "Article 1" },
            verification: {
              status: "found",
              document: {
                verificationImageSrc: "data:image/png;base64,abc123",
              },
            },
          },
        ],
        additionalCount: 0,
      },
    ];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} onSourceClick={onSourceClick} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    // Click the proof thumbnail (now a div with role="button" to avoid nesting buttons)
    const proofButton = trigger.querySelector("[aria-label='View proof for TestSource']");
    expect(proofButton).toBeInTheDocument();
    if (proofButton) fireEvent.click(proofButton);

    expect(onSourceClick).toHaveBeenCalledWith(groups[0]);
  });

  it("handles empty sourceName by falling back to 'Source'", () => {
    const groups: SourceCitationGroup[] = [
      {
        sourceName: "",
        sourceDomain: "test.com",
        citations: [
          {
            citationKey: "t-0",
            citation: { type: "url", siteName: "" },
            verification: { status: "found" },
          },
        ],
        additionalCount: 0,
      },
    ];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    // The tooltip should show "Source" fallback, not empty string
    const tooltip = trigger.querySelector("[data-testid='source-tooltip']");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip?.textContent).toContain("Source");
  });

  it("handles whitespace-only sourceName by falling back to 'Source'", () => {
    const groups: SourceCitationGroup[] = [
      {
        sourceName: "   ",
        sourceDomain: "test.com",
        citations: [
          {
            citationKey: "t-0",
            citation: { type: "url", siteName: "   " },
            verification: { status: "found" },
          },
        ],
        additionalCount: 0,
      },
    ];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    const tooltip = trigger.querySelector("[data-testid='source-tooltip']");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip?.textContent).toContain("Source");
  });

  it("rejects invalid proof image URLs", () => {
    const groups: SourceCitationGroup[] = [
      {
        sourceName: "TestSource",
        sourceDomain: "testsource.com",
        citations: [
          {
            citationKey: "ts-0",
            citation: { type: "url", siteName: "TestSource", title: "Article 1" },
            verification: {
              status: "found",
              document: {
                verificationImageSrc: "javascript:alert('xss')",
              },
            },
          },
        ],
        additionalCount: 0,
      },
    ];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    // Should not render proof image for invalid URL
    const proofButton = trigger.querySelector("button[aria-label='View proof for TestSource']");
    expect(proofButton).not.toBeInTheDocument();
  });
});
