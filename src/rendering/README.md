# src/rendering/

Rendering adapters and shared IR (Intermediate Representation) layer.

**What belongs here**: `prepareCitations()` (the parse→IR port), `walkCitationSegments()`
(shared segment loop), terminal/ANSI renderer, testing utilities, and shared types
consumed by multiple rendering targets.

**Do not add here**: Final HTML report generation or React components — HTML output
lives in `src/render/`; React components live in `src/react/`.
