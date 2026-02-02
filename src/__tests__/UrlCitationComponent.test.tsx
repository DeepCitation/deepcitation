import { afterEach, describe, expect, it, jest, mock } from "@jest/globals";
import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import {
  UrlCitationComponent,
  extractDomain,
  isBlockedStatus,
  isErrorStatus,
  isVerifiedStatus,
} from "../react/UrlCitationComponent";
import type { UrlCitationMeta } from "../react/types";

// Mock createPortal to render content in place instead of portal
mock.module("react-dom", () => ({
  createPortal: (node: React.ReactNode) => node,
}));

describe("UrlCitationComponent", () => {
  afterEach(() => {
    cleanup();
  });

  const createUrlMeta = (
    overrides: Partial<UrlCitationMeta> = {}
  ): UrlCitationMeta => ({
    url: "https://stripe.com/docs/api/v2/citations",
    fetchStatus: "verified",
    ...overrides,
  });

  it("renders badge variant with favicon", () => {
    const { container, getByRole } = render(
      <UrlCitationComponent urlMeta={createUrlMeta()} />
    );

    // Should render as a button (click is handled by component, not native link)
    const button = getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("data-url", "https://stripe.com/docs/api/v2/citations");

    // Should have favicon
    const favicon = container.querySelector("img");
    expect(favicon).toBeInTheDocument();
    expect(favicon).toHaveAttribute(
      "src",
      expect.stringContaining("stripe.com")
    );
  });

  it("shows verified checkmark when status is verified", () => {
    const { container } = render(
      <UrlCitationComponent urlMeta={createUrlMeta({ fetchStatus: "verified" })} />
    );

    // Should have a green checkmark (CheckIcon renders an SVG)
    const checkIcon = container.querySelector("svg");
    expect(checkIcon).toBeInTheDocument();

    // The wrapper should have green color class
    const statusWrapper = container.querySelector(".text-green-600");
    expect(statusWrapper).toBeInTheDocument();
  });

  it("shows lock icon when blocked", () => {
    const { container } = render(
      <UrlCitationComponent
        urlMeta={createUrlMeta({ fetchStatus: "blocked_paywall" })}
      />
    );

    // Should have amber lock icon
    const lockWrapper = container.querySelector(".text-amber-600");
    expect(lockWrapper).toBeInTheDocument();

    // Should have an SVG (the lock icon)
    const svg = lockWrapper?.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("shows X icon when error", () => {
    const { container } = render(
      <UrlCitationComponent
        urlMeta={createUrlMeta({ fetchStatus: "error_not_found" })}
      />
    );

    // Should have red X icon
    const errorWrapper = container.querySelector(".text-red-500");
    expect(errorWrapper).toBeInTheDocument();

    // Should have an SVG (the close/X icon)
    const svg = errorWrapper?.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("shows pulsing dot when pending", () => {
    const { container } = render(
      <UrlCitationComponent urlMeta={createUrlMeta({ fetchStatus: "pending" })} />
    );

    // Should have animate-pulse class for the pending dot
    const pulsingDot = container.querySelector(".animate-pulse");
    expect(pulsingDot).toBeInTheDocument();

    // Should be a rounded dot
    expect(pulsingDot).toHaveClass("rounded-full");
  });

  it("applies line-through for broken URLs", () => {
    const { container } = render(
      <UrlCitationComponent
        urlMeta={createUrlMeta({ fetchStatus: "error_not_found" })}
      />
    );

    // The URL text should have line-through
    const urlLabel = container.querySelector(".line-through");
    expect(urlLabel).toBeInTheDocument();
  });

  it("handles missing favicon gracefully", () => {
    const { container } = render(
      <UrlCitationComponent
        urlMeta={createUrlMeta({
          fetchStatus: "error_not_found",
          faviconUrl: undefined,
        })}
      />
    );

    // For broken URLs, should show globe emoji instead of favicon
    const globeEmoji = container.querySelector("span");
    expect(globeEmoji?.textContent).toContain("🌐");
  });

  it("shows globe emoji for broken URLs instead of favicon", () => {
    const { container } = render(
      <UrlCitationComponent
        urlMeta={createUrlMeta({ fetchStatus: "error_server" })}
      />
    );

    // Should show globe emoji for broken URLs
    expect(container.textContent).toContain("🌐");
  });

  describe("variants", () => {
    it("renders chip variant", () => {
      const { container } = render(
        <UrlCitationComponent
          urlMeta={createUrlMeta()}
          variant="chip"
        />
      );

      const chip = container.querySelector("[data-variant='chip']");
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveClass("rounded-full");
    });

    it("renders inline variant", () => {
      const { container } = render(
        <UrlCitationComponent
          urlMeta={createUrlMeta()}
          variant="inline"
        />
      );

      const inline = container.querySelector("[data-variant='inline']");
      expect(inline).toBeInTheDocument();
      expect(inline).toHaveClass("border-b");
    });

    it("renders bracket variant", () => {
      const { container } = render(
        <UrlCitationComponent
          urlMeta={createUrlMeta()}
          variant="bracket"
        />
      );

      const bracket = container.querySelector("[data-variant='bracket']");
      expect(bracket).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("does not open URL on click by default (openUrlOnClick=false)", () => {
      const windowOpenSpy = jest.spyOn(window, "open").mockImplementation(() => null);

      const { getByRole } = render(
        <UrlCitationComponent urlMeta={createUrlMeta()} />
      );

      const button = getByRole("button");
      fireEvent.click(button);

      // Default behavior: click does NOT open URL (allows parent to handle, e.g., show popover)
      expect(windowOpenSpy).not.toHaveBeenCalled();

      windowOpenSpy.mockRestore();
    });

    it("opens URL on click when openUrlOnClick=true", () => {
      const windowOpenSpy = jest.spyOn(window, "open").mockImplementation(() => null);

      const { getByRole } = render(
        <UrlCitationComponent urlMeta={createUrlMeta()} openUrlOnClick={true} />
      );

      const button = getByRole("button");
      fireEvent.click(button);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://stripe.com/docs/api/v2/citations",
        "_blank",
        "noopener,noreferrer"
      );

      windowOpenSpy.mockRestore();
    });

    it("calls custom onUrlClick when provided", () => {
      const onUrlClick = jest.fn();

      const { getByRole } = render(
        <UrlCitationComponent
          urlMeta={createUrlMeta()}
          onUrlClick={onUrlClick}
        />
      );

      const button = getByRole("button");
      fireEvent.click(button);

      expect(onUrlClick).toHaveBeenCalledWith(
        "https://stripe.com/docs/api/v2/citations",
        expect.any(Object)
      );
    });

    it("shows external link icon on hover when openUrlOnClick is false", () => {
      const { getByRole, queryByLabelText } = render(
        <UrlCitationComponent urlMeta={createUrlMeta()} />
      );

      const button = getByRole("button");

      // No external link icon initially
      expect(queryByLabelText("Open in new tab")).not.toBeInTheDocument();

      // Shows on hover
      fireEvent.mouseEnter(button);
      expect(queryByLabelText("Open in new tab")).toBeInTheDocument();

      // Hides on leave
      fireEvent.mouseLeave(button);
      expect(queryByLabelText("Open in new tab")).not.toBeInTheDocument();
    });

    it("does not show external link icon on hover when openUrlOnClick is true", () => {
      const { getByRole, queryByLabelText } = render(
        <UrlCitationComponent urlMeta={createUrlMeta()} openUrlOnClick={true} />
      );

      const button = getByRole("button");

      // Hover should not show external link (clicking opens URL directly)
      fireEvent.mouseEnter(button);
      expect(queryByLabelText("Open in new tab")).not.toBeInTheDocument();
    });

    it("opens URL via external link button when clicked", () => {
      const windowOpenSpy = jest.spyOn(window, "open").mockImplementation(() => null);

      const { getByRole, getByLabelText } = render(
        <UrlCitationComponent urlMeta={createUrlMeta()} />
      );

      const button = getByRole("button");
      fireEvent.mouseEnter(button);

      const externalLinkButton = getByLabelText("Open in new tab");
      fireEvent.click(externalLinkButton);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://stripe.com/docs/api/v2/citations",
        "_blank",
        "noopener,noreferrer"
      );

      windowOpenSpy.mockRestore();
    });

    it("triggers click handler on Enter key press (keyboard accessibility)", () => {
      const onUrlClick = jest.fn();

      const { getByRole } = render(
        <UrlCitationComponent urlMeta={createUrlMeta()} onUrlClick={onUrlClick} />
      );

      const button = getByRole("button");
      fireEvent.keyDown(button, { key: "Enter" });

      expect(onUrlClick).toHaveBeenCalledWith(
        "https://stripe.com/docs/api/v2/citations",
        expect.any(Object)
      );
    });

    it("triggers click handler on Space key press (keyboard accessibility)", () => {
      const onUrlClick = jest.fn();

      const { getByRole } = render(
        <UrlCitationComponent urlMeta={createUrlMeta()} onUrlClick={onUrlClick} />
      );

      const button = getByRole("button");
      fireEvent.keyDown(button, { key: " " });

      expect(onUrlClick).toHaveBeenCalledWith(
        "https://stripe.com/docs/api/v2/citations",
        expect.any(Object)
      );
    });

    it("opens URL on Enter key when openUrlOnClick is true", () => {
      const windowOpenSpy = jest.spyOn(window, "open").mockImplementation(() => null);

      const { getByRole } = render(
        <UrlCitationComponent urlMeta={createUrlMeta()} openUrlOnClick={true} />
      );

      const button = getByRole("button");
      fireEvent.keyDown(button, { key: "Enter" });

      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://stripe.com/docs/api/v2/citations",
        "_blank",
        "noopener,noreferrer"
      );

      windowOpenSpy.mockRestore();
    });
  });

  describe("display options", () => {
    it("shows title when showTitle is true", () => {
      const { getByText } = render(
        <UrlCitationComponent
          urlMeta={createUrlMeta({ title: "Stripe API Documentation" })}
          showTitle={true}
        />
      );

      expect(getByText("Stripe API Documentation")).toBeInTheDocument();
    });

    it("hides favicon when showFavicon is false", () => {
      const { container } = render(
        <UrlCitationComponent
          urlMeta={createUrlMeta()}
          showFavicon={false}
        />
      );

      const favicon = container.querySelector("img");
      expect(favicon).not.toBeInTheDocument();
    });

    it("truncates long URLs", () => {
      const { container } = render(
        <UrlCitationComponent
          urlMeta={createUrlMeta({
            url: "https://example.com/very/long/path/that/exceeds/the/maximum/display/length",
          })}
          maxDisplayLength={20}
        />
      );

      const urlLabel = container.querySelector(".text-ellipsis");
      expect(urlLabel).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has accessible aria-label", () => {
      const { getByRole } = render(
        <UrlCitationComponent urlMeta={createUrlMeta()} />
      );

      // Changed from "link" to "button" - click behavior now handled by component
      // External link opens via explicit external link button on hover
      const button = getByRole("button");
      expect(button).toHaveAttribute("aria-label", expect.stringContaining("stripe.com"));
    });

    it("uses button role with proper tabindex for keyboard accessibility", () => {
      const { getByRole } = render(
        <UrlCitationComponent urlMeta={createUrlMeta()} />
      );

      // Component now uses role="button" instead of being a native link
      // This allows click to be handled by parent (e.g., show popover)
      // The external link icon on hover provides explicit external navigation
      const button = getByRole("button");
      expect(button).toHaveAttribute("tabindex", "0");
    });
  });
});

describe("URL utility functions", () => {
  describe("extractDomain", () => {
    it("extracts domain from URL", () => {
      expect(extractDomain("https://www.example.com/path")).toBe("example.com");
      expect(extractDomain("https://stripe.com/docs")).toBe("stripe.com");
      expect(extractDomain("http://sub.domain.org/page")).toBe("sub.domain.org");
    });

    it("removes www prefix", () => {
      expect(extractDomain("https://www.google.com")).toBe("google.com");
    });

    it("handles invalid URLs gracefully", () => {
      expect(extractDomain("not-a-url")).toBe("not-a-url");
    });
  });

  describe("isBlockedStatus", () => {
    it("returns true for blocked statuses", () => {
      expect(isBlockedStatus("blocked_paywall")).toBe(true);
      expect(isBlockedStatus("blocked_login")).toBe(true);
      expect(isBlockedStatus("blocked_geo")).toBe(true);
    });

    it("returns false for non-blocked statuses", () => {
      expect(isBlockedStatus("verified")).toBe(false);
      expect(isBlockedStatus("error_not_found")).toBe(false);
      expect(isBlockedStatus("pending")).toBe(false);
    });
  });

  describe("isErrorStatus", () => {
    it("returns true for error statuses", () => {
      expect(isErrorStatus("error_not_found")).toBe(true);
      expect(isErrorStatus("error_server")).toBe(true);
      expect(isErrorStatus("error_timeout")).toBe(true);
    });

    it("returns false for non-error statuses", () => {
      expect(isErrorStatus("verified")).toBe(false);
      expect(isErrorStatus("blocked_paywall")).toBe(false);
      expect(isErrorStatus("pending")).toBe(false);
    });
  });

  describe("isVerifiedStatus", () => {
    it("returns true for verified statuses", () => {
      expect(isVerifiedStatus("verified")).toBe(true);
      expect(isVerifiedStatus("partial")).toBe(true);
      expect(isVerifiedStatus("redirected_valid")).toBe(true);
    });

    it("returns false for non-verified statuses", () => {
      expect(isVerifiedStatus("pending")).toBe(false);
      expect(isVerifiedStatus("error_not_found")).toBe(false);
      expect(isVerifiedStatus("blocked_paywall")).toBe(false);
    });
  });
});
