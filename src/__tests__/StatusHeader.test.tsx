import { afterEach, describe, expect, it } from "@jest/globals";
import { cleanup, render } from "@testing-library/react";
import React from "react";
import { StatusHeader } from "../react/VerificationLog";

describe("StatusHeader", () => {
  afterEach(() => {
    cleanup();
  });

  // ==========================================================================
  // BASIC STATUS DISPLAY TESTS
  // ==========================================================================

  describe("status display", () => {
    it("renders no text for found status (icon is self-explanatory)", () => {
      const { container } = render(<StatusHeader status="found" foundPage={5} />);
      // "Verified" text was removed - the checkmark icon is self-explanatory
      // Just verifies the header renders with page info
      expect(container.textContent).toContain("Pg 5");
    });

    it("renders 'Found on different page' for found_on_other_page", () => {
      const { container } = render(<StatusHeader status="found_on_other_page" foundPage={7} />);
      expect(container.textContent).toContain("Found on different page");
    });

    it("renders no text for not_found status (X icon is self-explanatory)", () => {
      const { container } = render(<StatusHeader status="not_found" />);
      // "Not found" text was removed - the X icon is self-explanatory
      // The header should still render (with icon)
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("renders 'Verifying...' for pending status", () => {
      const { container } = render(<StatusHeader status="pending" />);
      expect(container.textContent).toContain("Verifying...");
    });
  });

  // ==========================================================================
  // PAGE LOCATION DISPLAY TESTS
  // ==========================================================================

  describe("page location display", () => {
    it("shows only foundPage when expectedPage equals foundPage", () => {
      const { container } = render(
        <StatusHeader status="found" foundPage={5} expectedPage={5} />
      );

      // Should show "Pg 5" once (pages match, no arrow)
      expect(container.textContent).toContain("Pg 5");
      // Should NOT have arrow (pages match)
      expect(container.textContent).not.toContain("→");
    });

    it("shows arrow format when found on different page", () => {
      const { container } = render(
        <StatusHeader status="found_on_other_page" foundPage={7} expectedPage={5} />
      );

      // Should show arrow format: Pg 5 → 7
      expect(container.textContent).toContain("Pg 5");
      expect(container.textContent).toContain("→");
      expect(container.textContent).toContain("7");
    });

    it("shows single page for found_on_other_line (same page)", () => {
      const { container } = render(
        <StatusHeader status="found_on_other_line" foundPage={5} expectedPage={5} />
      );

      // For same page but different line, foundPage === expectedPage,
      // so no arrow should appear
      expect(container.textContent).not.toContain("→");
      expect(container.textContent).toContain("Pg 5");
    });

    it("shows only expectedPage when status is not_found (no foundPage)", () => {
      const { container } = render(
        <StatusHeader status="not_found" expectedPage={5} />
      );

      // Should show expected page for not_found
      expect(container.textContent).toContain("Pg 5");
    });

    it("shows nothing when no page info provided", () => {
      const { container } = render(<StatusHeader status="pending" />);

      // Should not contain any Pg text
      expect(container.textContent).not.toContain("Pg");
    });

    it("handles undefined expectedPage gracefully", () => {
      const { container } = render(
        <StatusHeader status="found" foundPage={5} expectedPage={undefined} />
      );

      // Should show foundPage
      expect(container.textContent).toContain("Pg 5");
      // No arrow (no expected page to compare)
      expect(container.textContent).not.toContain("→");
    });
  });

  // ==========================================================================
  // COMBINED HEADER TESTS (with anchorText and fullPhrase)
  // ==========================================================================

  describe("combined header with anchorText and fullPhrase", () => {
    it("renders anchor text inline when status text is empty (icon is self-explanatory)", () => {
      // When status is "found" or "not_found", headerText is empty
      // The anchor text should be shown inline as: [icon] "increased by 15%" Pg 5
      const { container } = render(
        <StatusHeader
          status="found"
          foundPage={5}
          anchorText="increased by 15%"
        />
      );

      // Should show quoted anchor text inline (since "Verified" text is no longer shown)
      expect(container.textContent).toContain('"increased by 15%"');
      expect(container.textContent).toContain("Pg 5");
    });

    it("renders anchor text in combined layout with fullPhrase", () => {
      const { container } = render(
        <StatusHeader
          status="not_found"
          expectedPage={5}
          anchorText="increased by 15%"
          fullPhrase="Revenue increased by 15% in Q4 2024."
        />
      );

      expect(container.textContent).toContain("increased by 15%");
      expect(container.textContent).toContain("Revenue increased by 15% in Q4 2024.");
    });

    it("shows arrow format page badge in combined layout for partial match", () => {
      const { container } = render(
        <StatusHeader
          status="found_on_other_page"
          foundPage={7}
          expectedPage={5}
          anchorText="test anchor"
          fullPhrase="test phrase"
        />
      );

      // Should show arrow format: Pg 5 → 7 (not strikethrough)
      expect(container.textContent).toContain("Pg 5");
      expect(container.textContent).toContain("→");
      expect(container.textContent).toContain("7");
    });
  });

  // ==========================================================================
  // ICON COLOR TESTS
  // ==========================================================================

  describe("icon colors", () => {
    it("uses green icon color for verified status", () => {
      const { container } = render(<StatusHeader status="found" foundPage={5} />);

      const greenIcon = container.querySelector(".text-green-600");
      expect(greenIcon).toBeInTheDocument();
    });

    it("uses amber icon color for partial match status", () => {
      const { container } = render(<StatusHeader status="found_on_other_page" foundPage={7} />);

      const amberIcon = container.querySelector(".text-amber-600");
      expect(amberIcon).toBeInTheDocument();
    });

    it("uses red icon color for not_found status", () => {
      const { container } = render(<StatusHeader status="not_found" />);

      const redIcon = container.querySelector(".text-red-500");
      expect(redIcon).toBeInTheDocument();
    });

    it("uses gray icon color for pending status", () => {
      const { container } = render(<StatusHeader status="pending" />);

      const grayIcon = container.querySelector(".text-gray-400");
      expect(grayIcon).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // NEUTRAL BACKGROUND TESTS (not fully colored headers)
  // ==========================================================================

  describe("neutral background styling", () => {
    it("uses clean neutral background for all statuses (no colored headers)", () => {
      const { container: verifiedContainer } = render(<StatusHeader status="found" foundPage={5} />);
      const { container: partialContainer } = render(<StatusHeader status="found_on_other_page" foundPage={7} />);
      const { container: notFoundContainer } = render(<StatusHeader status="not_found" />);

      // All should NOT have colored backgrounds - headers are clean/neutral
      expect(verifiedContainer.querySelector(".bg-green-50")).not.toBeInTheDocument();
      expect(partialContainer.querySelector(".bg-amber-50")).not.toBeInTheDocument();
      expect(notFoundContainer.querySelector(".bg-red-50")).not.toBeInTheDocument();
    });

    it("does NOT use fully colored backgrounds", () => {
      const { container: verifiedContainer } = render(<StatusHeader status="found" foundPage={5} />);
      const { container: partialContainer } = render(<StatusHeader status="found_on_other_page" foundPage={7} />);
      const { container: notFoundContainer } = render(<StatusHeader status="not_found" />);

      // Should NOT have the old fully-colored background classes
      expect(verifiedContainer.querySelector(".bg-green-50")).not.toBeInTheDocument();
      expect(partialContainer.querySelector(".bg-amber-50")).not.toBeInTheDocument();
      expect(notFoundContainer.querySelector(".bg-red-50")).not.toBeInTheDocument();
    });
  });
});
