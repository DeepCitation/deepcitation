import { afterEach, describe, expect, it } from "@jest/globals";
import { cleanup, render, within } from "@testing-library/react";
import React from "react";
import DiffDisplay from "../react/DiffDisplay";

describe("DiffDisplay", () => {
  afterEach(() => {
    cleanup();
  });

  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = render(
        <DiffDisplay expected="Hello" actual="Hello" />
      );
      expect(container.querySelector('[data-testid="diff-display"]')).toBeInTheDocument();
    });

    it("renders label when provided", () => {
      const { container } = render(
        <DiffDisplay expected="Hello" actual="Hello" label="Comparison" />
      );
      expect(within(container).getByText("Comparison")).toBeInTheDocument();
    });

    it("does not render label when not provided", () => {
      const { container } = render(
        <DiffDisplay expected="Hello" actual="Hello" />
      );
      expect(container.querySelector('[data-testid="diff-label"]')).not.toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <DiffDisplay expected="Hello" actual="Hello" className="custom-class" />
      );
      expect(container.querySelector(".custom-class")).toBeInTheDocument();
    });
  });

  describe("identical texts", () => {
    it("renders unchanged text when texts are identical", () => {
      const { container } = render(
        <DiffDisplay expected="Hello world" actual="Hello world" />
      );

      // When texts are identical, there should be no removed or added parts
      const removedParts = container.querySelectorAll('[data-diff-type="removed"]');
      expect(removedParts.length).toBe(0);

      const addedParts = container.querySelectorAll('[data-diff-type="added"]');
      expect(addedParts.length).toBe(0);

      // Text should still be rendered
      expect(container.textContent).toContain("Hello world");
    });
  });

  describe("text differences", () => {
    it("renders removed text with strikethrough styling", () => {
      const { container } = render(
        <DiffDisplay expected="Hello world" actual="Hello universe" />
      );

      const removedParts = container.querySelectorAll('[data-diff-type="removed"]');
      expect(removedParts.length).toBeGreaterThan(0);
      expect(removedParts[0].textContent).toContain("world");
    });

    it("renders added text", () => {
      const { container } = render(
        <DiffDisplay expected="Hello world" actual="Hello universe" />
      );

      const addedParts = container.querySelectorAll('[data-diff-type="added"]');
      expect(addedParts.length).toBeGreaterThan(0);
      expect(addedParts[0].textContent).toContain("universe");
    });

    it("renders multiple changes correctly", () => {
      const { container } = render(
        <DiffDisplay
          expected="The quick brown fox"
          actual="The slow brown dog"
        />
      );

      const removedParts = container.querySelectorAll('[data-diff-type="removed"]');
      const addedParts = container.querySelectorAll('[data-diff-type="added"]');

      expect(removedParts.length).toBeGreaterThan(0);
      expect(addedParts.length).toBeGreaterThan(0);
    });
  });

  describe("added lines", () => {
    it("handles added lines", () => {
      const { container } = render(
        <DiffDisplay expected="Line 1" actual="Line 1\nLine 2" />
      );

      // Component should render and contain both lines
      expect(container.querySelector('[data-testid="diff-display"]')).toBeInTheDocument();
      expect(container.textContent).toContain("Line 1");
    });
  });

  describe("sanitization", () => {
    it("applies sanitization function when provided", () => {
      const sanitize = (text: string) => text.replace(/\$/g, "USD");
      const { container } = render(
        <DiffDisplay
          expected="Cost: $50"
          actual="Cost: $50"
          sanitize={sanitize}
        />
      );

      expect(container.textContent).toContain("USD50");
      expect(container.textContent).not.toContain("$50");
    });

    it("works without sanitization function", () => {
      const { container } = render(
        <DiffDisplay expected="Cost: $50" actual="Cost: $50" />
      );

      expect(container.textContent).toContain("$50");
    });

    it("sanitizes both expected and actual texts", () => {
      const sanitize = (text: string) => text.toUpperCase();
      const { container } = render(
        <DiffDisplay expected="hello" actual="world" sanitize={sanitize} />
      );

      expect(container.textContent).toContain("HELLO");
      expect(container.textContent).toContain("WORLD");
    });
  });

  describe("empty and null inputs", () => {
    it("handles empty expected text", () => {
      const { container } = render(
        <DiffDisplay expected="" actual="Some text" />
      );
      expect(container.querySelector('[data-testid="diff-display"]')).toBeInTheDocument();
    });

    it("handles empty actual text", () => {
      const { container } = render(
        <DiffDisplay expected="Some text" actual="" />
      );
      expect(container.querySelector('[data-testid="diff-display"]')).toBeInTheDocument();
    });

    it("handles both texts empty", () => {
      const { container } = render(<DiffDisplay expected="" actual="" />);
      expect(container.querySelector('[data-testid="diff-display"]')).toBeInTheDocument();
    });
  });

  describe("multiline texts", () => {
    it("renders multiline diffs correctly", () => {
      const expected = "Line 1\nLine 2\nLine 3";
      const actual = "Line 1\nLine 2 modified\nLine 3";

      const { container } = render(
        <DiffDisplay expected={expected} actual={actual} />
      );

      const diffBlocks = container.querySelector('[data-testid="diff-blocks"]');
      expect(diffBlocks).toBeInTheDocument();
    });

    it("handles line additions in multiline text", () => {
      const expected = "Line 1\nLine 2";
      const actual = "Line 1\nLine 2\nLine 3\nLine 4";

      const { container } = render(
        <DiffDisplay expected={expected} actual={actual} />
      );

      const addedParts = container.querySelectorAll('[data-diff-type="added"]');
      expect(addedParts.length).toBeGreaterThan(0);
    });

    it("handles line removals in multiline text", () => {
      const expected = "Line 1\nLine 2\nLine 3";
      const actual = "Line 1";

      const { container } = render(
        <DiffDisplay expected={expected} actual={actual} />
      );

      const removedParts = container.querySelectorAll('[data-diff-type="removed"]');
      expect(removedParts.length).toBeGreaterThan(0);
    });
  });

  describe("accessibility", () => {
    it("includes title attributes for context", () => {
      const { container } = render(<DiffDisplay expected="old" actual="new" />);

      const removedPart = container.querySelector('[data-diff-type="removed"]');
      const addedPart = container.querySelector('[data-diff-type="added"]');

      expect(removedPart?.getAttribute("title")).toBe("Expected text");
      expect(addedPart?.getAttribute("title")).toBe("Actual text found");
    });
  });

  describe("special characters", () => {
    it("handles special characters in diff", () => {
      const { container } = render(
        <DiffDisplay expected="Price: $100" actual="Price: €100" />
      );

      expect(container.textContent).toContain("$");
      expect(container.textContent).toContain("€");
    });

    it("handles quotes correctly", () => {
      const { container } = render(
        <DiffDisplay expected='"Hello"' actual="'Hello'" />
      );

      const removedPart = container.querySelector('[data-diff-type="removed"]');
      const addedPart = container.querySelector('[data-diff-type="added"]');

      expect(removedPart?.textContent).toContain('"');
      expect(addedPart?.textContent).toContain("'");
    });

    it("handles HTML-like content safely", () => {
      const { container } = render(
        <DiffDisplay expected="<div>Test</div>" actual="<span>Test</span>" />
      );

      // Should render as text, not as HTML - the diff component should render
      expect(container.querySelector('[data-testid="diff-display"]')).toBeInTheDocument();
      // Verify content is present
      expect(container.textContent).toContain("div");
      expect(container.textContent).toContain("span");
    });
  });
});
