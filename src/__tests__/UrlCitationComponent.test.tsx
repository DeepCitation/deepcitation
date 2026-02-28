import { afterEach, describe, expect, it, jest, mock } from "@jest/globals";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type React from "react";
import type { UrlCitationMeta } from "../react/types";
import { UrlCitationComponent } from "../react/UrlCitationComponent";
import { isBlockedStatus, isErrorStatus, isVerifiedStatus } from "../react/urlStatus";
import { extractDomain } from "../react/urlUtils";

// Mock createPortal to render content in place instead of portal.
// Spread the real module AND synthesize a `default` export — bun's ESM wrapper
// for react-dom expects one, and mock.module replaces the entire namespace.
// Without `default`, the mock leaks across files and crashes with
// "Missing 'default' export in module react-dom".
const _realReactDom = require("react-dom");
const _mockedReactDom = { ..._realReactDom, createPortal: (node: React.ReactNode) => node };
mock.module("react-dom", () => ({ ..._mockedReactDom, default: _mockedReactDom }));

describe("UrlCitationComponent", () => {
  afterEach(() => {
    cleanup();
  });

  const createUrlMeta = (overrides: Partial<UrlCitationMeta> = {}): UrlCitationMeta => ({
    url: "https://stripe.com/docs/api/v2/citations",
    fetchStatus: "verified",
    ...overrides,
  });

  it("renders badge variant with favicon", () => {
    const { container, getByRole } = render(<UrlCitationComponent urlMeta={createUrlMeta()} />);

    // Should render as a button (click is handled by component, not native link)
    // Use name filter to distinguish from the nested ExternalLinkButton
    const button = getByRole("button", { name: /Link to/ });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("data-url", "https://stripe.com/docs/api/v2/citations");

    // Should have favicon
    const favicon = container.querySelector("img");
    expect(favicon).toBeInTheDocument();
    expect(favicon).toHaveAttribute("src", expect.stringContaining("stripe.com"));
  });

  it("shows verified checkmark when status is verified", () => {
    const { container } = render(<UrlCitationComponent urlMeta={createUrlMeta({ fetchStatus: "verified" })} />);

    // Should have a green checkmark (CheckIcon renders an SVG)
    const checkIcon = container.querySelector("svg");
    expect(checkIcon).toBeInTheDocument();

    // The wrapper should have green color class
    const statusWrapper = container.querySelector(".text-green-600");
    expect(statusWrapper).toBeInTheDocument();
  });

  it("shows lock icon when blocked", () => {
    const { container } = render(<UrlCitationComponent urlMeta={createUrlMeta({ fetchStatus: "blocked_paywall" })} />);

    // Should have amber lock icon (text-amber-500 - more yellow amber)
    const lockWrapper = container.querySelector(".text-amber-500");
    expect(lockWrapper).toBeInTheDocument();

    // Should have an SVG (the lock icon)
    const svg = lockWrapper?.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("shows X icon when error", () => {
    const { container } = render(<UrlCitationComponent urlMeta={createUrlMeta({ fetchStatus: "error_not_found" })} />);

    // Should have red X icon
    const errorWrapper = container.querySelector(".text-red-500");
    expect(errorWrapper).toBeInTheDocument();

    // Should have an SVG (the close/X icon)
    const svg = errorWrapper?.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("shows pulsing dot when pending", () => {
    const { container } = render(<UrlCitationComponent urlMeta={createUrlMeta({ fetchStatus: "pending" })} />);

    // Should have animate-pulse class for the pending dot
    const pulsingDot = container.querySelector(".animate-pulse");
    expect(pulsingDot).toBeInTheDocument();

    // Should be a rounded dot
    expect(pulsingDot).toHaveClass("rounded-full");
  });

  it("applies wavy underline for broken URLs", () => {
    const { container } = render(<UrlCitationComponent urlMeta={createUrlMeta({ fetchStatus: "error_not_found" })} />);

    // The URL text should have wavy underline styling (applied via inline style)
    // Find the element with the wavy underline style
    const urlElements = container.querySelectorAll("span");
    const hasWavyUnderline = Array.from(urlElements).some(el => {
      const style = el.style;
      return style.textDecorationStyle === "wavy";
    });
    expect(hasWavyUnderline).toBe(true);
  });

  it("handles missing favicon gracefully", () => {
    const { container } = render(
      <UrlCitationComponent
        urlMeta={createUrlMeta({
          fetchStatus: "error_not_found",
          faviconUrl: undefined,
        })}
      />,
    );

    // For broken URLs, should show globe emoji instead of favicon
    const globeEmoji = container.querySelector("span");
    expect(globeEmoji?.textContent).toContain("🌐");
  });

  it("shows globe emoji for broken URLs instead of favicon", () => {
    const { container } = render(<UrlCitationComponent urlMeta={createUrlMeta({ fetchStatus: "error_server" })} />);

    // Should show globe emoji for broken URLs
    expect(container.textContent).toContain("🌐");
  });

  describe("variants", () => {
    it("renders chip variant", () => {
      const { container } = render(<UrlCitationComponent urlMeta={createUrlMeta()} variant="chip" />);

      const chip = container.querySelector("[data-variant='chip']");
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveClass("rounded-full");
    });

    it("renders inline variant", () => {
      const { container } = render(<UrlCitationComponent urlMeta={createUrlMeta()} variant="inline" />);

      const inline = container.querySelector("[data-variant='inline']");
      expect(inline).toBeInTheDocument();
      expect(inline).toHaveClass("border-b");
    });

    it("renders bracket variant", () => {
      const { container } = render(<UrlCitationComponent urlMeta={createUrlMeta()} variant="bracket" />);

      const bracket = container.querySelector("[data-variant='bracket']");
      expect(bracket).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("opens URL on click by default", () => {
      const windowOpenSpy = jest.spyOn(window, "open").mockImplementation(() => null);

      const { getByRole } = render(<UrlCitationComponent urlMeta={createUrlMeta()} />);

      const button = getByRole("button", { name: /Link to/ });
      fireEvent.click(button);

      // Default behavior: click opens URL directly
      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://stripe.com/docs/api/v2/citations",
        "_blank",
        "noopener,noreferrer",
      );

      windowOpenSpy.mockRestore();
    });

    it("calls custom onUrlClick when provided", () => {
      const onUrlClick = jest.fn();

      const { getByRole } = render(<UrlCitationComponent urlMeta={createUrlMeta()} onUrlClick={onUrlClick} />);

      const button = getByRole("button", { name: /Link to/ });
      fireEvent.click(button);

      expect(onUrlClick).toHaveBeenCalledWith("https://stripe.com/docs/api/v2/citations", expect.any(Object));
    });

    it("shows external link icon on hover (visual hint that click opens URL)", () => {
      const { getByLabelText } = render(<UrlCitationComponent urlMeta={createUrlMeta()} />);

      // External link button is always in the DOM but visually hidden via CSS opacity-0
      // It becomes visible on hover via group-hover:opacity-100
      const externalLink = getByLabelText("Open in new tab");
      expect(externalLink).toBeInTheDocument();
      expect(externalLink).toHaveClass("opacity-0");

      // The group-hover CSS class handles visibility — verify the classes are correct
      expect(externalLink).toHaveClass("group-hover:opacity-100");
    });

    it("opens URL via external link button when clicked", () => {
      const windowOpenSpy = jest.spyOn(window, "open").mockImplementation(() => null);

      const { getByLabelText } = render(<UrlCitationComponent urlMeta={createUrlMeta()} />);

      // External link button is always in the DOM (CSS handles visibility)
      const externalLinkButton = getByLabelText("Open in new tab");
      fireEvent.click(externalLinkButton);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://stripe.com/docs/api/v2/citations",
        "_blank",
        "noopener,noreferrer",
      );

      windowOpenSpy.mockRestore();
    });

    it("triggers click handler on Enter key press (keyboard accessibility)", () => {
      const onUrlClick = jest.fn();

      const { getByRole } = render(<UrlCitationComponent urlMeta={createUrlMeta()} onUrlClick={onUrlClick} />);

      const button = getByRole("button", { name: /Link to/ });
      fireEvent.keyDown(button, { key: "Enter" });

      expect(onUrlClick).toHaveBeenCalledWith("https://stripe.com/docs/api/v2/citations", expect.any(Object));
    });

    it("triggers click handler on Space key press (keyboard accessibility)", () => {
      const onUrlClick = jest.fn();

      const { getByRole } = render(<UrlCitationComponent urlMeta={createUrlMeta()} onUrlClick={onUrlClick} />);

      const button = getByRole("button", { name: /Link to/ });
      fireEvent.keyDown(button, { key: " " });

      expect(onUrlClick).toHaveBeenCalledWith("https://stripe.com/docs/api/v2/citations", expect.any(Object));
    });

    it("opens URL on Enter key press", () => {
      const windowOpenSpy = jest.spyOn(window, "open").mockImplementation(() => null);

      const { getByRole } = render(<UrlCitationComponent urlMeta={createUrlMeta()} />);

      const button = getByRole("button", { name: /Link to/ });
      fireEvent.keyDown(button, { key: "Enter" });

      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://stripe.com/docs/api/v2/citations",
        "_blank",
        "noopener,noreferrer",
      );

      windowOpenSpy.mockRestore();
    });

    it("shows external link icon on keyboard focus (accessibility)", () => {
      const { getByLabelText } = render(<UrlCitationComponent urlMeta={createUrlMeta()} />);

      // External link button is always in the DOM but hidden via CSS opacity-0
      // It becomes visible on focus via group-focus-within:opacity-100
      const externalLink = getByLabelText("Open in new tab");
      expect(externalLink).toBeInTheDocument();
      expect(externalLink).toHaveClass("group-focus-within:opacity-100");
    });
  });

  describe("display options", () => {
    it("shows title when showTitle is true", () => {
      const { getByText } = render(
        <UrlCitationComponent urlMeta={createUrlMeta({ title: "Stripe API Documentation" })} showTitle={true} />,
      );

      expect(getByText("Stripe API Documentation")).toBeInTheDocument();
    });

    it("hides favicon when showFavicon is false", () => {
      const { container } = render(<UrlCitationComponent urlMeta={createUrlMeta()} showFavicon={false} />);

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
        />,
      );

      const urlLabel = container.querySelector(".text-ellipsis");
      expect(urlLabel).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has accessible aria-label", () => {
      const { getByRole } = render(<UrlCitationComponent urlMeta={createUrlMeta()} />);

      // Changed from "link" to "button" - click behavior now handled by component
      // External link opens via explicit external link button on hover
      const button = getByRole("button", { name: /Link to/ });
      expect(button).toHaveAttribute("aria-label", expect.stringContaining("stripe.com"));
    });

    it("uses button role with proper tabindex for keyboard accessibility", () => {
      const { getByRole } = render(<UrlCitationComponent urlMeta={createUrlMeta()} />);

      // Component now uses role="button" instead of being a native link
      // This allows click to be handled by parent (e.g., show popover)
      // The external link icon on hover provides explicit external navigation
      const button = getByRole("button", { name: /Link to/ });
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
