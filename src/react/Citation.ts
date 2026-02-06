/**
 * Citation Primitives Namespace
 * @packageDocumentation
 */

import {
  CitationAnchorText,
  CitationBracket,
  CitationIndicator,
  CitationNumber,
  CitationPage,
  CitationPhrase,
  CitationRoot,
  CitationStatusComponent,
  CitationTrigger,
} from "./primitives.js";

/** Citation primitives namespace for composable citation components. */
export const Citation = {
  Root: CitationRoot,
  Trigger: CitationTrigger,
  Bracket: CitationBracket,
  Number: CitationNumber,
  AnchorText: CitationAnchorText,
  Indicator: CitationIndicator,
  Status: CitationStatusComponent,
  Phrase: CitationPhrase,
  Page: CitationPage,
} as const;
