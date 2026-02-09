import { afterEach, describe, expect, it } from "@jest/globals";
import { cleanup, render } from "@testing-library/react";
import type { SourceCitationGroup } from "../react/CitationDrawer.types";
import { CitationDrawerTrigger } from "../react/CitationDrawerTrigger";

afterEach(() => {
  cleanup();
});

// =========
// Test Fixtures
// =========

const createMockCitationGroup = (overrides?: Partial<SourceCitationGroup>): SourceCitationGroup => ({
  sourceName: "Test Source",
  sourceDomain: "test.com",
  sourceFavicon: "https://test.com/favicon.ico",
  citations: [
    {
      citationKey: "test-1",
      citation: {
        type: "url",
        url: "https://test.com/article",
        domain: "test.com",
        siteName: "Test Source",
        title: "Test Article",
        fullPhrase: "Test content",
        anchorText: "content",
        citationNumber: 1,
      },
      verification: { status: "found" },
    },
  ],
  additionalCount: 0,
  ...overrides,
});

const createAllVerifiedGroups = (): SourceCitationGroup[] => [
  createMockCitationGroup({
    sourceName: "Stripe",
    sourceDomain: "stripe.com",
  }),
  createMockCitationGroup({
    sourceName: "GitHub",
    sourceDomain: "github.com",
  }),
  createMockCitationGroup({
    sourceName: "MDN",
    sourceDomain: "mdn.org",
  }),
];

const createMixedStatusGroups = (): SourceCitationGroup[] => [
  createMockCitationGroup({
    sourceName: "React",
    citations: [
      {
        citationKey: "r-1",
        citation: {
          type: "url",
          url: "https://react.dev",
          domain: "react.dev",
          siteName: "React",
          title: "React",
          fullPhrase: "React is a library",
          anchorText: "library",
          citationNumber: 1,
        },
        verification: { status: "found" },
      },
    ],
    additionalCount: 0,
  }),
];

const createAllPendingGroups = (): SourceCitationGroup[] => [
  createMockCitationGroup({
    sourceName: "OpenAI",
    citations: [
      {
        citationKey: "oai-1",
        citation: {
          type: "url",
          url: "https://openai.com",
          domain: "openai.com",
          siteName: "OpenAI",
          title: "OpenAI",
          fullPhrase: "GPT models",
          anchorText: "models",
          citationNumber: 1,
        },
        verification: { status: "pending" },
      },
    ],
    additionalCount: 0,
  }),
];

// =========
// Tests
// =========

describe("CitationDrawerTrigger", () => {
  it("renders when citation groups exist", () => {
    const groups = createAllVerifiedGroups();
    const { container } = render(<CitationDrawerTrigger citationGroups={groups} />);

    expect(container.querySelector("button")).toBeInTheDocument();
  });

  it("does not render when citation groups are empty", () => {
    const { container } = render(<CitationDrawerTrigger citationGroups={[]} />);

    expect(container.querySelector("button")).not.toBeInTheDocument();
  });

  it("displays correct status summary for all verified citations", () => {
    const groups = createAllVerifiedGroups();
    const { getByText } = render(<CitationDrawerTrigger citationGroups={groups} />);

    expect(getByText(/3 verified/)).toBeInTheDocument();
  });

  it("calls onClick handler when clicked", () => {
    const groups = createAllVerifiedGroups();
    let clicked = false;
    const onClick = () => {
      clicked = true;
    };

    const { getByRole } = render(<CitationDrawerTrigger citationGroups={groups} onClick={onClick} />);

    const button = getByRole("button");
    button.click();
    expect(clicked).toBe(true);
  });

  it("displays custom label when provided", () => {
    const groups = createAllVerifiedGroups();
    const customLabel = "Custom Citations Label";
    const { getByText } = render(<CitationDrawerTrigger citationGroups={groups} label={customLabel} />);

    expect(getByText(customLabel)).toBeInTheDocument();
  });

  it("handles aria attributes correctly", () => {
    const groups = createAllVerifiedGroups();
    const { getByRole } = render(<CitationDrawerTrigger citationGroups={groups} isOpen={true} />);

    const button = getByRole("button");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("supports dark mode classes", () => {
    const groups = createAllVerifiedGroups();
    const { container } = render(
      <div className="dark">
        <CitationDrawerTrigger citationGroups={groups} />
      </div>,
    );

    const button = container.querySelector("button");
    expect(button?.className).toContain("dark:bg-gray-800");
  });

  it("applies custom className prop", () => {
    const groups = createAllVerifiedGroups();
    const customClass = "custom-test-class";
    const { container } = render(<CitationDrawerTrigger citationGroups={groups} className={customClass} />);

    const button = container.querySelector("button");
    expect(button?.className).toContain(customClass);
  });

  it("handles citation group with empty citations array", () => {
    const emptyGroup: SourceCitationGroup = {
      sourceName: "Empty Source",
      sourceDomain: "empty.com",
      citations: [],
      additionalCount: 0,
    };

    const { container } = render(<CitationDrawerTrigger citationGroups={[emptyGroup]} />);

    expect(container.querySelector("button")).toBeInTheDocument();
  });

  it("displays status summary for mixed statuses", () => {
    const groups = createMixedStatusGroups();
    const { getByText } = render(<CitationDrawerTrigger citationGroups={groups} />);

    expect(getByText(/sources/)).toBeInTheDocument();
  });

  it("displays status summary for all pending", () => {
    const groups = createAllPendingGroups();
    const { getByText } = render(<CitationDrawerTrigger citationGroups={groups} />);

    expect(getByText(/pending/)).toBeInTheDocument();
  });
});
