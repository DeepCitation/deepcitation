import { expect, test } from "@playwright/experimental-ct-react";
import type { CitationDrawerItem } from "../../../src/react/CitationDrawer.types";
import { TriggerAndDrawer } from "../../../src/react/testing/TriggerAndDrawerHarness";

// =============================================================================
// Fixture data
// =============================================================================

const DOC_CITATION: CitationDrawerItem[] = [
  {
    citationKey: "c1",
    citation: {
      type: "document",
      attachmentId: "att-abc-123",
      anchorText: "revenue grew 25%",
      fullPhrase: "In Q4, revenue grew 25% year-over-year.",
      pageNumber: 3,
    },
    verification: { status: "found", label: "att-abc-123.pdf" },
  },
];

const URL_CITATION: CitationDrawerItem[] = [
  {
    citationKey: "u1",
    citation: {
      type: "url",
      url: "https://blog.example.com/post/1",
      siteName: "Example Blog",
      domain: "blog.example.com",
      anchorText: "latest results",
      fullPhrase: "According to the latest results published online.",
    },
    verification: { status: "found" },
  },
];

const TWO_DOC_SOURCES: CitationDrawerItem[] = [
  {
    citationKey: "m1",
    citation: {
      type: "document",
      attachmentId: "att-first",
      anchorText: "first claim",
      fullPhrase: "This is the first claim from the report.",
      pageNumber: 1,
    },
    verification: { status: "found", label: "att-first.pdf" },
  },
  {
    citationKey: "m2",
    citation: {
      type: "document",
      attachmentId: "att-second",
      anchorText: "second claim",
      fullPhrase: "This is a different claim from another file.",
      pageNumber: 7,
    },
    verification: { status: "found", label: "att-second.pdf" },
  },
];

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract the visible label text from the trigger button.
 * The trigger renders: [status icons] [label span] [chevron]
 * The label span has class "truncate" and "max-w-[200px]".
 */
async function getTriggerLabelText(page: import("@playwright/test").Page): Promise<string> {
  const trigger = page.locator('[data-testid="citation-drawer-trigger"]');
  await expect(trigger).toBeVisible();
  // The label is the truncate span inside the trigger
  const labelSpan = trigger.locator("span.truncate");
  const text = await labelSpan.textContent();
  return text?.trim() ?? "";
}

/**
 * Click the trigger, wait for the drawer dialog, then extract the heading text.
 * The heading is rendered as an <h2> inside the dialog.
 */
async function openDrawerAndGetHeadingText(page: import("@playwright/test").Page): Promise<string> {
  const trigger = page.locator('[data-testid="citation-drawer-trigger"]');
  await trigger.click();

  const dialog = page.locator("[role='dialog']");
  await expect(dialog).toBeVisible({ timeout: 5000 });

  const heading = dialog.locator("h2");
  const text = await heading.textContent();
  return text?.trim() ?? "";
}

// =============================================================================
// Tests — all tests extract real rendered text and compare
// =============================================================================

test.describe("Drawer ↔ Trigger source label consistency", () => {
  test("document citation without sourceLabelMap: labels match", async ({ mount, page }) => {
    await mount(<TriggerAndDrawer citations={DOC_CITATION} />);

    const triggerLabel = await getTriggerLabelText(page);
    const drawerHeading = await openDrawerAndGetHeadingText(page);

    expect(triggerLabel).toBeTruthy();
    expect(drawerHeading).toContain(triggerLabel);
  });

  test("document citation with sourceLabelMap: labels match", async ({ mount, page }) => {
    await mount(
      <TriggerAndDrawer
        citations={DOC_CITATION}
        sourceLabelMap={{ "att-abc-123": "Q4 Financial Report" }}
      />,
    );

    const triggerLabel = await getTriggerLabelText(page);
    const drawerHeading = await openDrawerAndGetHeadingText(page);

    expect(triggerLabel).toBe("Q4 Financial Report");
    expect(drawerHeading).toContain(triggerLabel);
  });

  test("url citation without sourceLabelMap: labels match", async ({ mount, page }) => {
    await mount(<TriggerAndDrawer citations={URL_CITATION} />);

    const triggerLabel = await getTriggerLabelText(page);
    const drawerHeading = await openDrawerAndGetHeadingText(page);

    expect(triggerLabel).toBeTruthy();
    expect(drawerHeading).toContain(triggerLabel);
  });

  test("url citation with sourceLabelMap: labels match", async ({ mount, page }) => {
    await mount(
      <TriggerAndDrawer
        citations={URL_CITATION}
        sourceLabelMap={{ "https://blog.example.com/post/1": "Engineering Blog" }}
      />,
    );

    const triggerLabel = await getTriggerLabelText(page);
    const drawerHeading = await openDrawerAndGetHeadingText(page);

    expect(triggerLabel).toBe("Engineering Blog");
    expect(drawerHeading).toContain(triggerLabel);
  });

  test("multi-source documents: primary name matches", async ({ mount, page }) => {
    await mount(<TriggerAndDrawer citations={TWO_DOC_SOURCES} />);

    const triggerLabel = await getTriggerLabelText(page);
    const drawerHeading = await openDrawerAndGetHeadingText(page);

    // Trigger shows "att-first.pdf +1", heading shows "att-first.pdf" + styled "+1"
    // The heading h2 textContent includes both, so it should contain the trigger label
    expect(triggerLabel).toContain("+1");
    expect(drawerHeading).toContain("+1");

    // Extract just the source name (before " +")
    const triggerName = triggerLabel.split(" +")[0];
    expect(drawerHeading).toContain(triggerName);
  });

  test("multi-source with sourceLabelMap: resolved name matches", async ({ mount, page }) => {
    await mount(
      <TriggerAndDrawer
        citations={TWO_DOC_SOURCES}
        sourceLabelMap={{ "att-first": "Annual Report 2024" }}
      />,
    );

    const triggerLabel = await getTriggerLabelText(page);
    const drawerHeading = await openDrawerAndGetHeadingText(page);

    expect(triggerLabel).toContain("Annual Report 2024");
    const triggerName = triggerLabel.split(" +")[0];
    expect(drawerHeading).toContain(triggerName);
  });

  test("multi-citation single source: group header uses resolved label", async ({ mount, page }) => {
    // Two citations from the same source → triggers SourceGroupHeader (not CompactSingleCitationRow)
    const citations: CitationDrawerItem[] = [
      ...DOC_CITATION,
      {
        citationKey: "c2",
        citation: {
          type: "document",
          attachmentId: "att-abc-123",
          anchorText: "net income doubled",
          fullPhrase: "Net income doubled compared to the prior year.",
          pageNumber: 5,
        },
        verification: { status: "found", label: "att-abc-123.pdf" },
      },
    ];

    await mount(
      <TriggerAndDrawer
        citations={citations}
        sourceLabelMap={{ "att-abc-123": "Q4 Financial Report" }}
      />,
    );

    const triggerLabel = await getTriggerLabelText(page);
    expect(triggerLabel).toBe("Q4 Financial Report");

    // Open drawer and check the drawer heading (h2) shows the resolved label.
    // Single-source drawers omit per-group headers (SourceGroupHeader/aria-level=3) —
    // the drawer's own h2 is the sole source identity for single-source views.
    const trigger = page.locator('[data-testid="citation-drawer-trigger"]');
    await trigger.click();
    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const heading = dialog.locator("h2");
    await expect(heading).toContainText("Q4 Financial Report");
  });
});
