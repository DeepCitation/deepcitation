import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER } from "../prompts/citationPrompts.js";
/** Build a numeric-format LLM response from visible text + citation data array. */
export function makeNumericResponse(visibleText, citations) {
    return `${visibleText}\n\n${CITATION_DATA_START_DELIMITER}\n${JSON.stringify(citations)}\n${CITATION_DATA_END_DELIMITER}`;
}
