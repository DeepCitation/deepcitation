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
    it("renders 'Verified Match' text for found status", () => {
      const { container } = render(<StatusHeader status="found" foundPage={5} />);
      expect(container.textContent).toContain("Verified Match");
    });

    it("renders 'Citation Found (Unexpected Location)' for found_on_other_page", () => {
      const { container } = render(<StatusHeader status="found_on_other_page" foundPage={7} />);
      expect(container.textContent).toContain("Citation Found (Unexpected Location)");
    });

    it("renders 'Citation Unverified' for not_found status", () => {
      const { container } = render(<StatusHeader status="not_found" />);
      expect(container.textContent).toContain("Citation Unverified");
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

      // Should show "PG 5" once
      expect(container.textContent).toContain("PG 5");
      // Should NOT have strikethrough (pages match)
      const strikethrough = container.querySelector(".line-through");
      expect(strikethrough).not.toBeInTheDocument();
    });

    it("shows expected page with strikethrough when found on different page", () => {
      const { container } = render(
        <StatusHeader status="found_on_other_page" foundPage={7} expectedPage={5} />
      );

      // Should have strikethrough element with expected page
      const strikethrough = container.querySelector(".line-through");
      expect(strikethrough).toBeInTheDocument();
      expect(strikethrough?.textContent).toContain("PG 5");

      // Should also show found page
      expect(container.textContent).toContain("PG 7");
    });

    it("shows expected page with strikethrough for found_on_other_line status", () => {
      const { container } = render(
        <StatusHeader status="found_on_other_line" foundPage={5} expectedPage={5} />
      );

      // For same page but different line, foundPage === expectedPage,
      // so no strikethrough should appear
      const strikethrough = container.querySelector(".line-through");
      expect(strikethrough).not.toBeInTheDocument();
    });

    it("shows only expectedPage when status is not_found (no foundPage)", () => {
      const { container } = render(
        <StatusHeader status="not_found" expectedPage={5} />
      );

      // Should show expected page for not_found
      expect(container.textContent).toContain("PG 5");
    });

    it("shows nothing when no page info provided", () => {
      const { container } = render(<StatusHeader status="pending" />);

      // Should not contain any PG text
      expect(container.textContent).not.toContain("PG");
    });

    it("handles undefined expectedPage gracefully", () => {
      const { container } = render(
        <StatusHeader status="found" foundPage={5} expectedPage={undefined} />
      );

      // Should show foundPage
      expect(container.textContent).toContain("PG 5");
      // No strikethrough (no expected page to compare)
      const strikethrough = container.querySelector(".line-through");
      expect(strikethrough).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // COMBINED HEADER TESTS (with anchorText and fullPhrase)
  // ==========================================================================

  describe("combined header with anchorText and fullPhrase", () => {
    it("renders anchor text in combined layout", () => {
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

    it("shows strikethrough expected page in combined layout for partial match", () => {
      const { container } = render(
        <StatusHeader
          status="found_on_other_page"
          foundPage={7}
          expectedPage={5}
          anchorText="test anchor"
          fullPhrase="test phrase"
        />
      );

      // Should have strikethrough for expected page
      const strikethrough = container.querySelector(".line-through");
      expect(strikethrough).toBeInTheDocument();
      expect(strikethrough?.textContent).toContain("PG 5");

      // Should show found page
      expect(container.textContent).toContain("PG 7");
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
    it("uses neutral gray background for all statuses", () => {
      const { container: verifiedContainer } = render(<StatusHeader status="found" foundPage={5} />);
      const { container: partialContainer } = render(<StatusHeader status="found_on_other_page" foundPage={7} />);
      const { container: notFoundContainer } = render(<StatusHeader status="not_found" />);

      // All should have the neutral gray background class
      expect(verifiedContainer.querySelector(".bg-gray-50")).toBeInTheDocument();
      expect(partialContainer.querySelector(".bg-gray-50")).toBeInTheDocument();
      expect(notFoundContainer.querySelector(".bg-gray-50")).toBeInTheDocument();
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
