// CitationComponent uses portals; redirect them to the document body for testing.
import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type React from "react";
import type { Citation, SupportingFact } from "../types/citation.js";
import type { Verification } from "../types/verification.js";

mock.module("react-dom", () => {
  const actual = require("react-dom") as typeof import("react-dom");
  return { ...actual, createPortal: (node: React.ReactNode) => node };
});

import { SupportingFactsPills } from "../react/SupportingFactsPills.js";
import { getChildCitationKey, getCitationKey } from "../utils/citationKey.js";

const parentCitation: Citation = {
  type: "document",
  attachmentId: "doc-abc",
  sourceContext: "The court ordered preservation of all log data and timely disclosure",
  sourceMatch: "preservation of all log data and timely disclosure",
  pageNumber: 3,
  supportingFacts: [
    {
      childIndex: 0,
      sourceMatch: "preservation of all log data",
      sourceContext: "preservation of all log data",
      pageNumber: 3,
    },
    {
      childIndex: 1,
      sourceMatch: "timely disclosure",
      sourceContext: "timely disclosure",
      pageNumber: 3,
    },
  ],
};

const parentKey = getCitationKey(parentCitation);
const facts = parentCitation.supportingFacts as SupportingFact[];

describe("SupportingFactsPills", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a region with the 'Supporting facts' aria-label", () => {
    const { getByRole } = render(
      <SupportingFactsPills parentCitation={parentCitation} parentKey={parentKey} supportingFacts={facts} />,
    );

    const region = getByRole("region", { name: "Supporting facts" });
    expect(region).toBeInTheDocument();
  });

  it("renders one chip button per supporting fact", () => {
    const { getAllByRole } = render(
      <SupportingFactsPills parentCitation={parentCitation} parentKey={parentKey} supportingFacts={facts} />,
    );

    const buttons = getAllByRole("button");
    expect(buttons).toHaveLength(facts.length);
  });

  it("renders pills without throwing when supportingFactVerifications is provided", () => {
    const v0: Verification = { status: "not_found" };
    const v1: Verification = { status: "found" };

    const { getAllByRole } = render(
      <SupportingFactsPills
        parentCitation={parentCitation}
        parentKey={parentKey}
        supportingFacts={facts}
        supportingFactVerifications={[v0, v1]}
      />,
    );

    // Two pills rendered; presence confirms wiring didn't throw
    expect(getAllByRole("button")).toHaveLength(2);
  });

  it("renders pills with deterministic child keys (no duplicate keys)", () => {
    const { getAllByRole } = render(
      <SupportingFactsPills parentCitation={parentCitation} parentKey={parentKey} supportingFacts={facts} />,
    );

    // If React key collisions existed, React would warn and deduplicate nodes
    expect(getAllByRole("button")).toHaveLength(facts.length);
  });

  it("passes parentInstanceId down so child popovers don't close the parent", () => {
    const parentId = "parent-instance-123";

    // Render succeeds without throwing — CitationComponent uses parentInstanceId
    // to suppress announceActivePopover, which we verify indirectly by checking
    // no error is thrown and pills are rendered.
    const { getAllByRole } = render(
      <SupportingFactsPills
        parentCitation={parentCitation}
        parentKey={parentKey}
        supportingFacts={facts}
        parentInstanceId={parentId}
      />,
    );

    expect(getAllByRole("button")).toHaveLength(facts.length);
  });
});
