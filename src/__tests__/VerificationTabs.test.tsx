import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { VerificationTabs } from "../react/VerificationTabs";

describe("VerificationTabs", () => {
  afterEach(() => {
    cleanup();
  });

  describe("exact match state", () => {
    it("displays exact match badge when texts are identical", () => {
      const { container } = render(
        <VerificationTabs expected="Hello world" actual="Hello world" />
      );

      expect(within(container).getByText("Exact match")).toBeInTheDocument();
    });

    it("shows check icon for exact match", () => {
      const { container } = render(
        <VerificationTabs expected="Test" actual="Test" />
      );

      // CheckIcon is rendered inside the exact match badge as an svg
      const exactMatchBadge = container.querySelector(
        '[data-testid="exact-match-badge"]'
      );
      expect(exactMatchBadge).toBeInTheDocument();
      const checkIcon = exactMatchBadge?.querySelector("svg");
      expect(checkIcon).toBeInTheDocument();
    });

    it("does not show tabs for exact match", () => {
      const { container } = render(
        <VerificationTabs expected="Same" actual="Same" />
      );

      const tabsNav = container.querySelector('[data-testid="tabs-nav"]');
      expect(tabsNav).not.toBeInTheDocument();
    });

    it("displays the matched text content", () => {
      const { container } = render(
        <VerificationTabs expected="Matched text" actual="Matched text" />
      );

      expect(within(container).getByText("Matched text")).toBeInTheDocument();
    });
  });

  describe("tab navigation", () => {
    it("renders all three tabs when texts differ", () => {
      const { container } = render(
        <VerificationTabs expected="Hello world" actual="Hello universe" />
      );

      // Query within the tabs navigation to avoid matching diff content
      const tabsNav = container.querySelector('[data-testid="tabs-nav"]');
      expect(tabsNav).toBeInTheDocument();
      expect(
        within(tabsNav as HTMLElement).getByText("Expected")
      ).toBeInTheDocument();
      expect(
        within(tabsNav as HTMLElement).getByText("Diff")
      ).toBeInTheDocument();
      expect(
        within(tabsNav as HTMLElement).getByText("Found")
      ).toBeInTheDocument();
    });

    it("defaults to Diff tab for low variance", () => {
      const { container } = render(
        <VerificationTabs expected="Hello world" actual="Hello universe" />
      );

      const diffTab = container.querySelector('button[data-active="true"]');
      expect(diffTab?.textContent).toBe("Diff");
    });

    it("stays on Diff tab with split view for high variance", async () => {
      // Use texts with very different lengths to trigger high variance
      // New behavior: stays on Diff tab but uses split view mode
      const expected = "A";
      const actual = "Something entirely different and much longer text here";

      const { container } = render(
        <VerificationTabs expected={expected} actual={actual} />
      );

      await waitFor(() => {
        const activeTab = container.querySelector('button[data-active="true"]');
        expect(activeTab?.textContent).toBe("Diff");
        // Should use split view mode (indicated by the split view button being active)
        const splitViewButton = container.querySelector(
          'button[aria-label="Split view"]'
        );
        expect(splitViewButton).toHaveClass("bg-gray-200");
      });
    });

    it("switches to Expected tab when clicked", () => {
      const { container } = render(
        <VerificationTabs expected="Hello world" actual="Hello universe" />
      );

      // Get the Expected tab button from the navigation
      const tabsNav = container.querySelector(
        '[data-testid="tabs-nav"]'
      ) as HTMLElement;
      const expectedTab = within(tabsNav).getByText("Expected");
      fireEvent.click(expectedTab);

      expect(expectedTab).toHaveAttribute("data-active", "true");
    });

    it("switches to Found tab when clicked", () => {
      const { container } = render(
        <VerificationTabs expected="Hello world" actual="Hello universe" />
      );

      const tabsNav = container.querySelector(
        '[data-testid="tabs-nav"]'
      ) as HTMLElement;
      const foundTab = within(tabsNav).getByText("Found");
      fireEvent.click(foundTab);

      expect(foundTab).toHaveAttribute("data-active", "true");
    });

    it("stops event propagation on tab click", () => {
      const onClick = jest.fn();
      const { container } = render(
        <div onClick={onClick}>
          <VerificationTabs expected="Hello world" actual="Hello universe" />
        </div>
      );

      const tabsNav = container.querySelector(
        '[data-testid="tabs-nav"]'
      ) as HTMLElement;
      const expectedTab = within(tabsNav).getByText("Expected");
      fireEvent.click(expectedTab);

      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("Expected tab content", () => {
    it("displays expected text when Expected tab is active", () => {
      const { container } = render(
        <VerificationTabs expected="Hello world" actual="Hello universe" />
      );

      const tabsNav = container.querySelector(
        '[data-testid="tabs-nav"]'
      ) as HTMLElement;
      const expectedTab = within(tabsNav).getByText("Expected");
      fireEvent.click(expectedTab);

      const tabContent = container.querySelector(
        '[data-testid="tab-content-expected"]'
      );
      expect(tabContent).toBeInTheDocument();
      expect(tabContent?.textContent).toContain("Hello world");
    });

    it("renders copy button for expected text when provided", () => {
      const renderCopyButton = jest.fn((_text, position) => (
        <button>Copy {position}</button>
      ));

      const { container } = render(
        <VerificationTabs
          expected="Hello world"
          actual="Hello universe"
          renderCopyButton={renderCopyButton}
        />
      );

      const tabsNav = container.querySelector(
        '[data-testid="tabs-nav"]'
      ) as HTMLElement;
      const expectedTab = within(tabsNav).getByText("Expected");
      fireEvent.click(expectedTab);

      expect(renderCopyButton).toHaveBeenCalledWith("Hello world", "expected");
    });
  });

  describe("Diff tab content", () => {
    it("displays diff visualization when Diff tab is active", () => {
      const { container } = render(
        <VerificationTabs expected="Hello world" actual="Hello universe" />
      );

      // Diff tab should be active by default for low variance
      const diffResult = container.querySelector('[data-testid="diff-result"]');
      expect(diffResult).toBeInTheDocument();
    });

    it("shows removed and added text in diff", () => {
      const { container } = render(
        <VerificationTabs expected="old text" actual="new text" />
      );

      const removedParts = container.querySelectorAll(
        '[data-diff-type="removed"]'
      );
      const addedParts = container.querySelectorAll('[data-diff-type="added"]');

      expect(removedParts.length).toBeGreaterThan(0);
      expect(addedParts.length).toBeGreaterThan(0);
    });

    it("displays Exact Match indicator when no diff but tab is viewed", () => {
      // Force the component to show tabs by making initial texts different
      // then switching them to identical
      const { rerender, container } = render(
        <VerificationTabs expected="Different" actual="Text" />
      );

      // Click diff tab to make sure it's active
      const diffTab = within(container).getByText("Diff");
      fireEvent.click(diffTab);

      // Now make them identical via rerender
      rerender(<VerificationTabs expected="Same" actual="Same" />);

      // Should show exact match in the overall component
      expect(within(container).getByText("Exact match")).toBeInTheDocument();
    });
  });

  describe("Found tab content", () => {
    it("displays actual text when Found tab is active", () => {
      const { container } = render(
        <VerificationTabs expected="Expected" actual="Found content" />
      );

      const foundTab = within(container).getByText("Found");
      fireEvent.click(foundTab);

      const tabContent = container.querySelector(
        '[data-testid="tab-content-found"]'
      );
      expect(tabContent).toBeInTheDocument();
      expect(tabContent?.textContent).toContain("Found content");
    });

    it("shows empty text message when actual is empty", () => {
      const { container } = render(
        <VerificationTabs
          expected="Expected"
          actual=""
          emptyText="Nothing found"
        />
      );

      const foundTab = within(container).getByText("Found");
      fireEvent.click(foundTab);

      expect(within(container).getByText("Nothing found")).toBeInTheDocument();
    });

    it("uses default empty text when not provided", () => {
      const { container } = render(
        <VerificationTabs expected="Expected" actual="" />
      );

      const foundTab = within(container).getByText("Found");
      fireEvent.click(foundTab);

      const emptyElement = container.querySelector(
        '[data-testid="empty-text"]'
      );
      expect(emptyElement).toBeInTheDocument();
      expect(emptyElement?.textContent).toBe("No text found");
    });

    it("renders copy button for found text when provided", () => {
      const renderCopyButton = jest.fn((_text, position) => (
        <button>Copy {position}</button>
      ));

      const { container } = render(
        <VerificationTabs
          expected="Expected"
          actual="Actual"
          renderCopyButton={renderCopyButton}
        />
      );

      const foundTab = within(container).getByText("Found");
      fireEvent.click(foundTab);

      expect(renderCopyButton).toHaveBeenCalledWith("Actual", "found");
    });
  });

  describe("label prop", () => {
    it("displays label when provided", () => {
      const { container } = render(
        <VerificationTabs
          expected="Expected"
          actual="Actual"
          label="Verification Results"
        />
      );

      expect(
        within(container).getByText("Verification Results")
      ).toBeInTheDocument();
    });

    it("does not display label when not provided", () => {
      const { container } = render(
        <VerificationTabs expected="Expected" actual="Actual" />
      );

      const label = container.querySelector(
        '[data-testid="verification-label"]'
      );
      expect(label).not.toBeInTheDocument();
    });
  });

  describe("renderCopyButton prop", () => {
    it("does not render copy buttons when prop not provided", () => {
      const { container } = render(
        <VerificationTabs expected="Hello world" actual="Hello universe" />
      );

      // Need to click a tab to see if copy button would appear
      const tabsNav = container.querySelector(
        '[data-testid="tabs-nav"]'
      ) as HTMLElement;
      const expectedTab = within(tabsNav).getByText("Expected");
      fireEvent.click(expectedTab);

      // Copy button wrapper shouldn't exist since renderCopyButton wasn't provided
      const copyButtons = container.querySelectorAll("button");
      // Only tab buttons should exist (Expected, Diff, Found)
      expect(copyButtons.length).toBe(3);
    });

    it("renders custom copy button for expected tab", () => {
      const renderCopyButton = jest.fn((text) => (
        <button data-testid="custom-copy">{text}</button>
      ));

      const { container } = render(
        <VerificationTabs
          expected="Hello world"
          actual="Hello universe"
          renderCopyButton={renderCopyButton}
        />
      );

      const tabsNav = container.querySelector(
        '[data-testid="tabs-nav"]'
      ) as HTMLElement;
      const expectedTab = within(tabsNav).getByText("Expected");
      fireEvent.click(expectedTab);

      expect(renderCopyButton).toHaveBeenCalledWith("Hello world", "expected");
    });

    it("renders custom copy button for found tab", () => {
      const renderCopyButton = jest.fn((text) => (
        <button data-testid="custom-copy">{text}</button>
      ));

      const { container } = render(
        <VerificationTabs
          expected="Hello world"
          actual="Hello universe"
          renderCopyButton={renderCopyButton}
        />
      );

      const tabsNav = container.querySelector(
        '[data-testid="tabs-nav"]'
      ) as HTMLElement;
      const foundTab = within(tabsNav).getByText("Found");
      fireEvent.click(foundTab);

      expect(renderCopyButton).toHaveBeenCalledWith("Hello universe", "found");
    });
  });

  describe("tab content transitions", () => {
    it("shows different content when switching tabs", () => {
      const { container } = render(
        <VerificationTabs expected="Hello world" actual="Hello universe" />
      );

      // Initially on Diff tab
      expect(
        container.querySelector('[data-testid="tab-content-diff"]')
      ).toBeInTheDocument();

      // Switch to Expected tab
      const tabsNav = container.querySelector(
        '[data-testid="tabs-nav"]'
      ) as HTMLElement;
      const expectedTab = within(tabsNav).getByText("Expected");
      fireEvent.click(expectedTab);
      expect(
        container.querySelector('[data-testid="tab-content-expected"]')
      ).toBeInTheDocument();

      // Switch to Found tab
      const foundTab = within(tabsNav).getByText("Found");
      fireEvent.click(foundTab);
      expect(
        container.querySelector('[data-testid="tab-content-found"]')
      ).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("handles empty expected text", () => {
      const { container } = render(
        <VerificationTabs expected="" actual="Some text" />
      );

      expect(
        container.querySelector('[data-testid="verification-tabs"]')
      ).toBeInTheDocument();
    });

    it("handles empty actual text", () => {
      const { container } = render(
        <VerificationTabs expected="Some text" actual="" />
      );

      const foundTab = within(container).getByText("Found");
      fireEvent.click(foundTab);

      expect(
        container.querySelector('[data-testid="empty-text"]')
      ).toBeInTheDocument();
    });

    it("handles both texts empty", () => {
      const { container } = render(<VerificationTabs expected="" actual="" />);

      // Empty strings with no content - check that component renders
      // The isExactMatch condition requires both actual and expected to be truthy
      expect(
        container.querySelector('[data-testid="verification-tabs"]')
      ).toBeInTheDocument();
    });

    it("handles very long texts", () => {
      const longText = "Lorem ipsum ".repeat(100);
      const { container } = render(
        <VerificationTabs expected={longText} actual={longText} />
      );

      expect(within(container).getByText("Exact match")).toBeInTheDocument();
    });

    it("handles multiline texts", () => {
      const expected = "Line 1\nLine 2\nLine 3";
      const actual = "Line 1\nLine 2 modified\nLine 3";

      const { container } = render(
        <VerificationTabs expected={expected} actual={actual} />
      );

      expect(
        container.querySelector('[data-testid="verification-tabs"]')
      ).toBeInTheDocument();
    });

    it("handles special characters", () => {
      const expected = 'Text with "quotes" and $pecial chars!';
      const actual = "Text with 'quotes' and $pecial chars!";

      const { container } = render(
        <VerificationTabs expected={expected} actual={actual} />
      );

      expect(
        container.querySelector('[data-testid="verification-tabs"]')
      ).toBeInTheDocument();
    });
  });

  describe("data attributes", () => {
    it("applies correct data-testid to tab wrapper", () => {
      const { container } = render(
        <VerificationTabs expected="A" actual="B" />
      );

      expect(
        container.querySelector('[data-testid="verification-tabs"]')
      ).toBeInTheDocument();
    });

    it("applies exact match data attribute", () => {
      const { container } = render(
        <VerificationTabs expected="Same" actual="Same" />
      );

      expect(
        container.querySelector('[data-exact-match="true"]')
      ).toBeInTheDocument();
    });

    it("applies active data attribute to selected tab", () => {
      const { container } = render(
        <VerificationTabs expected="A" actual="B" />
      );

      const diffTab = container.querySelector('button[data-active="true"]');
      expect(diffTab?.textContent).toBe("Diff");
    });
  });

  describe("accessibility", () => {
    it("renders buttons with type='button'", () => {
      const { container } = render(
        <VerificationTabs expected="A" actual="B" />
      );

      const buttons = container.querySelectorAll("button");
      buttons.forEach((button) => {
        expect(button.getAttribute("type")).toBe("button");
      });
    });

    it("provides semantic structure with proper nesting", () => {
      const { container } = render(
        <VerificationTabs expected="A" actual="B" />
      );

      expect(
        container.querySelector('[data-testid="tabs-container"]')
      ).toBeInTheDocument();
      expect(
        container.querySelector('[data-testid="tabs-nav"]')
      ).toBeInTheDocument();
      expect(
        container.querySelector('[data-testid="tabs-content"]')
      ).toBeInTheDocument();
    });
  });
});
