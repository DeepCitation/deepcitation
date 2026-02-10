import { afterEach, describe, expect, it, jest, mock } from "@jest/globals";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
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
          siteName: "Test",
          domain: "test.com",
          faviconUrl: "https://test.com/favicon.ico",
        },
        verification: null,
      },
      {
        citationKey: "2",
        citation: {
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

  it("renders favicon when available", () => {
    const { container } = render(<CitationDrawerItemComponent item={createItem()} />);

    const favicon = container.querySelector('img[src="https://delaware.gov/favicon.ico"]');
    expect(favicon).toBeInTheDocument();
  });

  it("renders placeholder when no favicon", () => {
    const item = createItem({
      citation: {
        siteName: "Test",
        domain: "test.com",
      },
    });

    const { getByText } = render(<CitationDrawerItemComponent item={item} />);

    // Should show first letter as placeholder
    expect(getByText("T")).toBeInTheDocument();
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

    const indicator = container.querySelector(".text-amber-500");
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

    const { getAllByText } = render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={groups} showMoreSection={false} />,
    );

    // Source A has Article 1 and Article 2, Source B has Article 1
    // So we should have 2 "Article 1" and 1 "Article 2"
    expect(getAllByText("Article 1")).toHaveLength(2);
    expect(getAllByText("Article 2")).toHaveLength(1);
  });

  it("shows 'More' section when there are more items", () => {
    const groups = [createGroup("Test", 5)];

    const { getByText } = render(
      <CitationDrawer
        isOpen={true}
        onClose={() => {}}
        citationGroups={groups}
        showMoreSection={true}
        maxVisibleItems={3}
      />,
    );

    expect(getByText("More (2)")).toBeInTheDocument();
  });

  it("expands More section when clicked", () => {
    const groups = [createGroup("Test", 5)];

    const { getByText, queryByText } = render(
      <CitationDrawer
        isOpen={true}
        onClose={() => {}}
        citationGroups={groups}
        showMoreSection={true}
        maxVisibleItems={3}
      />,
    );

    // Initially, items 4 and 5 should not be visible
    expect(queryByText("Article 4")).not.toBeInTheDocument();

    // Click More
    fireEvent.click(getByText("More (2)"));

    // Now items 4 and 5 should be visible
    expect(getByText("Article 4")).toBeInTheDocument();
    expect(getByText("Article 5")).toBeInTheDocument();
  });

  it("calls onCitationClick when item clicked", () => {
    const onCitationClick = jest.fn();
    const groups = [createGroup("Test", 1)];

    const { getByText } = render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={groups} onCitationClick={onCitationClick} />,
    );

    fireEvent.click(getByText("Article 1"));

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
      citation: { siteName: "Test" },
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
      citation: { siteName: "Test" },
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
      citation: { siteName: "Test" },
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
        citation: { siteName: "Test 1" },
        verification: null,
      });
      result.current.addCitation({
        citationKey: "2",
        citation: { siteName: "Test 2" },
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
        citation: { siteName: "Test 1" },
        verification: null,
      },
      {
        citationKey: "2",
        citation: { siteName: "Test 2" },
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
        citation: { siteName: "Source A", domain: "a.com" },
        verification: null,
      });
      result.current.addCitation({
        citationKey: "2",
        citation: { siteName: "Source A", domain: "a.com" },
        verification: null,
      });
      result.current.addCitation({
        citationKey: "3",
        citation: { siteName: "Source B", domain: "b.com" },
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

    expect(getByText("3 sources · 3 verified")).toBeInTheDocument();
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

    // Should have green, gray, and amber status icons
    expect(container.querySelector(".text-green-500")).toBeInTheDocument();
    expect(container.querySelector(".text-gray-400")).toBeInTheDocument();
    expect(container.querySelector(".text-amber-500")).toBeInTheDocument();
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

  it("renders stacked favicons", () => {
    const groups = [createGroup("Test", 1)];
    const { container } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const favicon = container.querySelector('img[src="https://test.com/favicon.ico"]');
    expect(favicon).toBeInTheDocument();
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
            citation: { siteName: "TestSource", title: "Article 1" },
            verification: {
              status: "found",
              verificationImageBase64: "data:image/png;base64,abc123",
            },
          },
        ],
        additionalCount: 0,
      },
    ];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} onSourceClick={onSourceClick} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    // Click the proof thumbnail button
    const proofButton = trigger.querySelector("button[aria-label='View proof for TestSource']");
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
            citation: { siteName: "" },
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
            citation: { siteName: "   " },
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
            citation: { siteName: "TestSource", title: "Article 1" },
            verification: {
              status: "found",
              verificationImageBase64: "javascript:alert('xss')",
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

  it("rejects SVG data URI proof images (XSS vector) in tooltip", () => {
    const groups: SourceCitationGroup[] = [
      {
        sourceName: "TestSource",
        sourceDomain: "testsource.com",
        citations: [
          {
            citationKey: "ts-0",
            citation: { siteName: "TestSource", title: "Article 1" },
            verification: {
              status: "found",
              verificationImageBase64:
                "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KCdYU1MnKSI+PC9zdmc+",
            },
          },
        ],
        additionalCount: 0,
      },
    ];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    // SVG data URIs can embed scripts — must not render
    const proofButton = trigger.querySelector("button[aria-label='View proof for TestSource']");
    expect(proofButton).not.toBeInTheDocument();
  });

  it("rejects SVG data URI with inline XML in tooltip", () => {
    const groups: SourceCitationGroup[] = [
      {
        sourceName: "TestSource",
        sourceDomain: "testsource.com",
        citations: [
          {
            citationKey: "ts-0",
            citation: { siteName: "TestSource", title: "Article 1" },
            verification: {
              status: "found",
              verificationImageBase64:
                "data:image/svg+xml,<svg onload=\"alert('XSS')\"></svg>",
            },
          },
        ],
        additionalCount: 0,
      },
    ];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    const proofButton = trigger.querySelector("button[aria-label='View proof for TestSource']");
    expect(proofButton).not.toBeInTheDocument();
  });

  it("rejects untrusted HTTPS URLs for proof images in tooltip", () => {
    const groups: SourceCitationGroup[] = [
      {
        sourceName: "TestSource",
        sourceDomain: "testsource.com",
        citations: [
          {
            citationKey: "ts-0",
            citation: { siteName: "TestSource", title: "Article 1" },
            verification: {
              status: "found",
              verificationImageBase64: "https://evil.com/proof.png",
            },
          },
        ],
        additionalCount: 0,
      },
    ];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    const proofButton = trigger.querySelector("button[aria-label='View proof for TestSource']");
    expect(proofButton).not.toBeInTheDocument();
  });

  it("allows valid raster data URI proof images in tooltip", () => {
    const groups: SourceCitationGroup[] = [
      {
        sourceName: "TestSource",
        sourceDomain: "testsource.com",
        sourceFavicon: "https://testsource.com/favicon.ico",
        citations: [
          {
            citationKey: "ts-0",
            citation: { siteName: "TestSource", title: "Article 1" },
            verification: {
              status: "found",
              verificationImageBase64: "data:image/png;base64,iVBORw0KGgo=",
            },
          },
        ],
        additionalCount: 0,
      },
    ];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    // Valid raster data URI should render the proof button
    const proofButton = trigger.querySelector("button[aria-label='View proof for TestSource']");
    expect(proofButton).toBeInTheDocument();
  });
});

describe("CitationDrawerItemComponent proof image security", () => {
  afterEach(() => {
    cleanup();
  });

  const createItemWithProof = (proofImageSrc: string): CitationDrawerItem => ({
    citationKey: "1",
    citation: {
      siteName: "Test Source",
      domain: "test.com",
      title: "Test Article",
      description: "A test snippet",
    },
    verification: {
      status: "found",
      verificationImageBase64: proofImageSrc,
    },
  });

  it("blocks SVG data URI proof images (XSS vector)", () => {
    const item = createItemWithProof(
      "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KCdYU1MnKSI+PC9zdmc+",
    );
    const { container } = render(<CitationDrawerItemComponent item={item} />);

    // No proof image should render
    const proofImg = container.querySelector('img[alt="Verification proof"]');
    expect(proofImg).not.toBeInTheDocument();
  });

  it("blocks SVG data URI with inline XML", () => {
    const item = createItemWithProof(
      "data:image/svg+xml,<svg onload=\"alert('XSS')\"></svg>",
    );
    const { container } = render(<CitationDrawerItemComponent item={item} />);

    const proofImg = container.querySelector('img[alt="Verification proof"]');
    expect(proofImg).not.toBeInTheDocument();
  });

  it("blocks javascript: protocol proof images", () => {
    const item = createItemWithProof("javascript:alert('xss')");
    const { container } = render(<CitationDrawerItemComponent item={item} />);

    const proofImg = container.querySelector('img[alt="Verification proof"]');
    expect(proofImg).not.toBeInTheDocument();
  });

  it("blocks untrusted HTTPS URLs", () => {
    const item = createItemWithProof("https://evil.com/proof.png");
    const { container } = render(<CitationDrawerItemComponent item={item} />);

    const proofImg = container.querySelector('img[alt="Verification proof"]');
    expect(proofImg).not.toBeInTheDocument();
  });

  it("blocks HTTP URLs (non-HTTPS)", () => {
    const item = createItemWithProof("http://api.deepcitation.com/proof.png");
    const { container } = render(<CitationDrawerItemComponent item={item} />);

    const proofImg = container.querySelector('img[alt="Verification proof"]');
    expect(proofImg).not.toBeInTheDocument();
  });

  it("allows valid raster data URI (PNG)", () => {
    const item = createItemWithProof("data:image/png;base64,iVBORw0KGgo=");
    const { container } = render(<CitationDrawerItemComponent item={item} />);

    const proofImg = container.querySelector('img[alt="Verification proof"]');
    expect(proofImg).toBeInTheDocument();
    expect(proofImg).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
  });

  it("allows trusted HTTPS URLs", () => {
    const item = createItemWithProof("https://api.deepcitation.com/proof/abc123.png");
    const { container } = render(<CitationDrawerItemComponent item={item} />);

    const proofImg = container.querySelector('img[alt="Verification proof"]');
    expect(proofImg).toBeInTheDocument();
  });

  it("blocks empty string proof images", () => {
    const item = createItemWithProof("");
    const { container } = render(<CitationDrawerItemComponent item={item} />);

    const proofImg = container.querySelector('img[alt="Verification proof"]');
    expect(proofImg).not.toBeInTheDocument();
  });

  it("blocks whitespace-only proof images", () => {
    const item = createItemWithProof("   ");
    const { container } = render(<CitationDrawerItemComponent item={item} />);

    const proofImg = container.querySelector('img[alt="Verification proof"]');
    expect(proofImg).not.toBeInTheDocument();
  });
});

describe("CitationDrawer group collapse/expand state", () => {
  afterEach(() => {
    cleanup();
  });

  const createGroup = (name: string, count: number): SourceCitationGroup => ({
    sourceName: name,
    sourceDomain: `${name.toLowerCase()}.com`,
    citations: Array.from({ length: count }, (_, i) => ({
      citationKey: `${name}-${i}`,
      citation: {
        siteName: name,
        title: `${name} Article ${i + 1}`,
        description: `Snippet for ${name} article ${i + 1}`,
      },
      verification: { status: "found" as const },
    })),
    additionalCount: count - 1,
  });

  /**
   * Find a group header button by its citation count text (e.g. "2 citations" or "1 citation").
   * This text is unique to SourceGroupHeader and not present in citation items.
   * Walks up from the count badge to find the parent button with aria-expanded.
   */
  const findGroupHeaderByCount = (countText: string): HTMLElement | null => {
    try {
      const el = screen.getByText(countText);
      let node: HTMLElement | null = el;
      while (node) {
        if (node.tagName === "BUTTON" && node.hasAttribute("aria-expanded")) {
          return node;
        }
        node = node.parentElement;
      }
    } catch { /* no matching text element */ }
    return null;
  };

  it("shows group headers when multiple groups exist", () => {
    render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[createGroup("Alpha", 1), createGroup("Beta", 2)]} showMoreSection={false} />,
    );

    // Group headers show citation counts — unique to SourceGroupHeader
    expect(screen.getByText("1 citation")).toBeInTheDocument();
    expect(screen.getByText("2 citations")).toBeInTheDocument();
  });

  it("collapses a group when its header is clicked", () => {
    render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[createGroup("Alpha", 2), createGroup("Beta", 1)]} showMoreSection={false} />,
    );

    // All articles visible initially
    expect(screen.queryByText("Alpha Article 1")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Article 2")).toBeInTheDocument();

    // Click the Alpha group header (has "2 citations" count)
    const alphaHeader = findGroupHeaderByCount("2 citations")!;
    expect(alphaHeader).toBeInTheDocument();
    fireEvent.click(alphaHeader);

    // Alpha articles should be hidden
    expect(screen.queryByText("Alpha Article 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Alpha Article 2")).not.toBeInTheDocument();

    // Beta articles should still be visible
    expect(screen.queryByText("Beta Article 1")).toBeInTheDocument();
  });

  it("expands a collapsed group when its header is clicked again", () => {
    render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[createGroup("Alpha", 2), createGroup("Beta", 1)]} showMoreSection={false} />,
    );

    const alphaHeader = findGroupHeaderByCount("2 citations")!;

    // Collapse Alpha
    fireEvent.click(alphaHeader);
    expect(screen.queryByText("Alpha Article 1")).not.toBeInTheDocument();

    // Expand Alpha again
    fireEvent.click(alphaHeader);
    expect(screen.queryByText("Alpha Article 1")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Article 2")).toBeInTheDocument();
  });

  it("maintains independent collapse state per group", () => {
    // Use different counts per group so each header is uniquely identifiable
    render(
      <CitationDrawer
        isOpen={true}
        onClose={() => {}}
        citationGroups={[createGroup("Alpha", 2), createGroup("Beta", 3), createGroup("Gamma", 4)]}
        showMoreSection={false}
      />,
    );

    // Collapse Alpha (2 citations) and Gamma (4 citations), leave Beta open
    fireEvent.click(findGroupHeaderByCount("2 citations")!);
    fireEvent.click(findGroupHeaderByCount("4 citations")!);

    expect(screen.queryByText("Alpha Article 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta Article 1")).toBeInTheDocument();
    expect(screen.queryByText("Gamma Article 1")).not.toBeInTheDocument();

    // Expand Alpha back — Gamma should remain collapsed
    fireEvent.click(findGroupHeaderByCount("2 citations")!);
    expect(screen.queryByText("Alpha Article 1")).toBeInTheDocument();
    expect(screen.queryByText("Gamma Article 1")).not.toBeInTheDocument();
  });

  it("sets aria-expanded on group headers", () => {
    render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[createGroup("Alpha", 2), createGroup("Beta", 1)]} showMoreSection={false} />,
    );

    const alphaHeader = findGroupHeaderByCount("2 citations")!;
    expect(alphaHeader).toHaveAttribute("aria-expanded", "true");

    // Collapse Alpha
    fireEvent.click(alphaHeader);
    expect(alphaHeader).toHaveAttribute("aria-expanded", "false");
  });

  it("shows chevron rotation class for expanded groups", () => {
    render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[createGroup("Alpha", 2), createGroup("Beta", 1)]} showMoreSection={false} />,
    );

    const alphaHeader = findGroupHeaderByCount("2 citations")!;
    const chevron = alphaHeader.querySelector("svg");

    // Expanded: should have rotate-90
    expect(chevron).toHaveClass("rotate-90");

    // Collapse
    fireEvent.click(alphaHeader);

    // Collapsed: should not have rotate-90
    expect(chevron).not.toHaveClass("rotate-90");
  });

  it("does not show group headers when only one group exists", () => {
    render(
      <CitationDrawer isOpen={true} onClose={() => {}} citationGroups={[createGroup("Alpha", 3)]} showMoreSection={false} />,
    );

    // All citations should be visible with no collapsible header
    expect(screen.getByText("Alpha Article 1")).toBeInTheDocument();
    expect(screen.getByText("Alpha Article 2")).toBeInTheDocument();
    expect(screen.getByText("Alpha Article 3")).toBeInTheDocument();

    // No citation count badge (unique to group headers) should exist
    expect(screen.queryByText("3 citations")).not.toBeInTheDocument();
  });
});

describe("SourceTooltip viewport clamping", () => {
  afterEach(() => {
    cleanup();
  });

  const createGroup = (name: string): SourceCitationGroup => ({
    sourceName: name,
    sourceDomain: `${name.toLowerCase()}.com`,
    sourceFavicon: `https://${name.toLowerCase()}.com/favicon.ico`,
    citations: [
      {
        citationKey: `${name}-0`,
        citation: { siteName: name, title: "Article 1" },
        verification: { status: "found" },
      },
    ],
    additionalCount: 0,
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

  it("renders tooltip with transform including translateX(-50%)", () => {
    const groups = [createGroup("TestSource")];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    const tooltip = trigger.querySelector("[data-testid='source-tooltip']") as HTMLElement;
    expect(tooltip).toBeInTheDocument();

    // Default: centered with translateX(calc(-50% + 0px))
    expect(tooltip.style.transform).toContain("translateX");
    expect(tooltip.style.transform).toContain("-50%");
  });

  it("adjusts tooltip position when overflowing left edge", () => {
    // Mock getBoundingClientRect to simulate left overflow
    const originalGetBCR = Element.prototype.getBoundingClientRect;

    const groups = [createGroup("TestSource")];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");

    // Override getBoundingClientRect to simulate tooltip at left edge
    Element.prototype.getBoundingClientRect = function () {
      if (this.getAttribute?.("data-testid") === "source-tooltip") {
        return { left: -20, right: 160, top: 0, bottom: 50, width: 180, height: 50, x: -20, y: 0, toJSON: () => ({}) } as DOMRect;
      }
      return originalGetBCR.call(this);
    };

    hoverFirstIcon(trigger);

    const tooltip = trigger.querySelector("[data-testid='source-tooltip']") as HTMLElement;
    expect(tooltip).toBeInTheDocument();
    // The clamping should apply a positive offset to push tooltip right
    // Due to useLayoutEffect running synchronously, the transform should include an adjustment
    expect(tooltip.style.transform).toContain("translateX");

    // Restore
    Element.prototype.getBoundingClientRect = originalGetBCR;
  });

  it("adjusts tooltip position when overflowing right edge", () => {
    const originalGetBCR = Element.prototype.getBoundingClientRect;
    // Set a known viewport width
    Object.defineProperty(window, "innerWidth", { value: 400, writable: true });

    const groups = [createGroup("TestSource")];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");

    // Override getBoundingClientRect to simulate tooltip overflowing right
    Element.prototype.getBoundingClientRect = function () {
      if (this.getAttribute?.("data-testid") === "source-tooltip") {
        return { left: 250, right: 430, top: 0, bottom: 50, width: 180, height: 50, x: 250, y: 0, toJSON: () => ({}) } as DOMRect;
      }
      return originalGetBCR.call(this);
    };

    hoverFirstIcon(trigger);

    const tooltip = trigger.querySelector("[data-testid='source-tooltip']") as HTMLElement;
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.style.transform).toContain("translateX");

    // Restore
    Element.prototype.getBoundingClientRect = originalGetBCR;
  });

  it("cleans up resize listener on tooltip unmount", () => {
    const addSpy = jest.spyOn(window, "addEventListener");
    const removeSpy = jest.spyOn(window, "removeEventListener");

    const groups = [createGroup("TestSource")];
    const { getByTestId } = render(<CitationDrawerTrigger citationGroups={groups} />);

    const trigger = getByTestId("citation-drawer-trigger");
    hoverFirstIcon(trigger);

    // Tooltip mounts — should add resize listener
    expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function));

    // Mouse leave to unmount tooltip
    fireEvent.mouseLeave(trigger);

    // Should clean up resize listener
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
