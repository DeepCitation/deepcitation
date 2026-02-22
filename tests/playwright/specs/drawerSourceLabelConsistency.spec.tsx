import { expect, test } from "@playwright/experimental-ct-react";
import React, { useState } from "react";
import { CitationDrawer } from "../../../src/react/CitationDrawer";
import type { CitationDrawerItem } from "../../../src/react/CitationDrawer.types";
import { groupCitationsBySource } from "../../../src/react/CitationDrawer.utils";
import { CitationDrawerTrigger } from "../../../src/react/CitationDrawerTrigger";

// =============================================================================
// Test harness — wires trigger + drawer with shared props
// =============================================================================

function TriggerAndDrawer({
  citations,
  sourceLabelMap,
}: {
  citations: CitationDrawerItem[];
  sourceLabelMap?: Record<string, string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const groups = groupCitationsBySource(citations, sourceLabelMap);

  return (
    <div data-testid="harness">
      <CitationDrawerTrigger
        citationGroups={groups}
        onClick={() => setIsOpen(true)}
        isOpen={isOpen}
        sourceLabelMap={sourceLabelMap}
      />
      <CitationDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        citationGroups={groups}
        sourceLabelMap={sourceLabelMap}
      />
    </div>
  );
}

// =============================================================================
// Fixture data
// =============================================================================

const DOC_CITATIONS: CitationDrawerItem[] = [
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

const URL_CITATIONS: CitationDrawerItem[] = [
  {
    citationKey: "u1",
    citation: {
      type: "url",
      url: "https://blog.example.com/post/1",
      siteName: "blog.example.com",
      domain: "blog.example.com",
      anchorText: "latest results",
      fullPhrase: "According to the latest results published online.",
    },
    verification: { status: "found" },
  },
];

const MULTI_SOURCE_CITATIONS: CitationDrawerItem[] = [
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
// Tests
// =============================================================================

test.describe("Drawer ↔ Trigger source label consistency", () => {
  test("document citation: trigger and drawer heading show the same resolved label", async ({ mount, page }) => {
    const resolvedName = "Q4 Financial Report";

    await mount(
      <TriggerAndDrawer
        citations={DOC_CITATIONS}
        sourceLabelMap={{ "att-abc-123": resolvedName }}
      />,
    );

    // Trigger should show the resolved label
    const trigger = page.locator('[data-testid="citation-drawer-trigger"]');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText(resolvedName);

    // Open drawer
    await trigger.click();
    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Drawer heading (h2) should show the same resolved label
    const heading = dialog.locator("h2");
    await expect(heading).toContainText(resolvedName);
  });

  test("url citation: trigger and drawer heading show the same resolved label", async ({ mount, page }) => {
    const resolvedName = "Company Engineering Blog";

    await mount(
      <TriggerAndDrawer
        citations={URL_CITATIONS}
        sourceLabelMap={{ "https://blog.example.com/post/1": resolvedName }}
      />,
    );

    const trigger = page.locator('[data-testid="citation-drawer-trigger"]');
    await expect(trigger).toContainText(resolvedName);

    await trigger.click();
    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const heading = dialog.locator("h2");
    await expect(heading).toContainText(resolvedName);
  });

  test("without sourceLabelMap, trigger and drawer heading still match", async ({ mount, page }) => {
    await mount(<TriggerAndDrawer citations={DOC_CITATIONS} />);

    const trigger = page.locator('[data-testid="citation-drawer-trigger"]');
    await expect(trigger).toBeVisible();

    // Get the label text from the trigger
    const triggerLabel = trigger.locator("span.truncate");
    const triggerText = await triggerLabel.textContent();
    expect(triggerText).toBeTruthy();

    // Open drawer
    await trigger.click();
    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Drawer heading should contain the same text
    const heading = dialog.locator("h2");
    await expect(heading).toContainText(triggerText!);
  });

  test("multi-source: trigger and drawer heading show same resolved primary name", async ({ mount, page }) => {
    const resolvedName = "Annual Report 2024";

    await mount(
      <TriggerAndDrawer
        citations={MULTI_SOURCE_CITATIONS}
        sourceLabelMap={{ "att-first": resolvedName }}
      />,
    );

    const trigger = page.locator('[data-testid="citation-drawer-trigger"]');
    // Multi-source trigger label: "Annual Report 2024 +1"
    await expect(trigger).toContainText(resolvedName);

    await trigger.click();
    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const heading = dialog.locator("h2");
    await expect(heading).toContainText(resolvedName);
  });

  test("drawer group header also uses the resolved label", async ({ mount, page }) => {
    const resolvedName = "Q4 Financial Report";

    // Use multi-citation group so we get a SourceGroupHeader (not compact row)
    const citations: CitationDrawerItem[] = [
      ...DOC_CITATIONS,
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
        sourceLabelMap={{ "att-abc-123": resolvedName }}
      />,
    );

    const trigger = page.locator('[data-testid="citation-drawer-trigger"]');
    await trigger.click();

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // The SourceGroupHeader has role="heading" aria-level=3
    const groupHeader = dialog.locator("[role='heading'][aria-level='3']");
    await expect(groupHeader).toContainText(resolvedName);
  });

  test("compact single-citation row uses the resolved label", async ({ mount, page }) => {
    const resolvedName = "Board Meeting Minutes";

    await mount(
      <TriggerAndDrawer
        citations={DOC_CITATIONS}
        sourceLabelMap={{ "att-abc-123": resolvedName }}
      />,
    );

    const trigger = page.locator('[data-testid="citation-drawer-trigger"]');
    await trigger.click();

    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Single-citation group renders as CompactSingleCitationRow (role="button")
    // which should show the resolved source name
    const compactRow = dialog.locator("[role='button']");
    await expect(compactRow).toContainText(resolvedName);
  });
});
