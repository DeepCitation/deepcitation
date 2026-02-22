/**
 * Trace the exact label resolution flow through the drawer system
 * to verify document citations get the resolved sourceLabelMap name
 * at every stage.
 */
import { describe, expect, it } from "@jest/globals";
import type { CitationDrawerItem } from "../react/CitationDrawer.types";
import {
  computeStatusSummary,
  flattenCitations,
  groupCitationsBySource,
  lookupSourceLabel,
  resolveGroupLabels,
  sortGroupsByWorstStatus,
} from "../react/CitationDrawer.utils";

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

const LABEL_MAP = { "att-abc-123": "Q4 Financial Report" };

describe("drawer label flow — document citations", () => {
  it("lookupSourceLabel finds attachmentId match", () => {
    const result = lookupSourceLabel(DOC_CITATIONS[0].citation, LABEL_MAP);
    expect(result).toBe("Q4 Financial Report");
  });

  it("groupCitationsBySource without map gives raw verification.label", () => {
    const groups = groupCitationsBySource(DOC_CITATIONS);
    expect(groups[0].sourceName).toBe("att-abc-123.pdf");
  });

  it("groupCitationsBySource with map gives resolved label", () => {
    const groups = groupCitationsBySource(DOC_CITATIONS, LABEL_MAP);
    expect(groups[0].sourceName).toBe("Q4 Financial Report");
  });

  it("resolveGroupLabels on raw groups resolves correctly", () => {
    const raw = groupCitationsBySource(DOC_CITATIONS);
    const resolved = resolveGroupLabels(raw, LABEL_MAP);
    expect(resolved[0].sourceName).toBe("Q4 Financial Report");
  });

  it("double resolution is idempotent", () => {
    const groups = groupCitationsBySource(DOC_CITATIONS, LABEL_MAP);
    const again = resolveGroupLabels(groups, LABEL_MAP);
    expect(again[0].sourceName).toBe("Q4 Financial Report");
  });

  it("flattenCitations preserves resolved name", () => {
    const groups = groupCitationsBySource(DOC_CITATIONS, LABEL_MAP);
    const flat = flattenCitations(groups);
    expect(flat[0].sourceName).toBe("Q4 Financial Report");
  });

  it("sortGroupsByWorstStatus preserves resolved name", () => {
    const groups = groupCitationsBySource(DOC_CITATIONS, LABEL_MAP);
    const sorted = sortGroupsByWorstStatus(groups);
    expect(sorted[0].sourceName).toBe("Q4 Financial Report");
  });

  it("full drawer flow: raw groups + resolve in component", () => {
    // Simulate: consumer calls groupCitationsBySource() without map (old API)
    const rawGroups = groupCitationsBySource(DOC_CITATIONS);
    expect(rawGroups[0].sourceName).toBe("att-abc-123.pdf"); // raw

    // CitationDrawer internally does: resolveGroupLabels(citationGroups, sourceLabelMap)
    const resolvedGroups = resolveGroupLabels(rawGroups, LABEL_MAP);
    expect(resolvedGroups[0].sourceName).toBe("Q4 Financial Report"); // resolved

    // DrawerSourceHeading reads:
    const primaryName = resolvedGroups[0].sourceName?.trim() || "Citations";
    expect(primaryName).toBe("Q4 Financial Report");

    // sortGroupsByWorstStatus for the actual rendered list:
    const sorted = sortGroupsByWorstStatus(resolvedGroups);
    expect(sorted[0].sourceName).toBe("Q4 Financial Report");

    // CompactSingleCitationRow reads group.sourceName:
    expect(sorted[0].sourceName).toBe("Q4 Financial Report");
  });
});
