import { describe, expect, it } from "bun:test";
import { parseCitationResponse } from "../parsing/parseCitationResponse.js";

describe("parseCitationResponse claim_text preservation", () => {
  it("preserves parent citation claim_text as claimText", () => {
    const result = parseCitationResponse(`The patient can walk independently[1].

<<<CITATION_DATA>>>
[
  {
    "id": 1,
    "attachment_id": "att-1",
    "source_context": "The patient required assistance to ambulate.",
    "source_match": "ambulate",
    "claim_text": "walk independently",
    "page_id": "page_number_1_index_0"
  }
]
<<<END_CITATION_DATA>>>`);

    const citation = result.citations[result.markerMap[1]];
    expect(citation?.claimText).toBe("walk independently");
  });
});
