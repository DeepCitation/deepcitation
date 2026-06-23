# src/render/

Server-side HTML rendering pipeline: converts verified citation data into a
self-contained HTML report with CDN runtime injected.

**What belongs here**: `renderVerifiedHtml()` and supporting server-side
renderers that produce final HTML output (not React components or terminal output).

**Do not add here**: React components, terminal/ANSI renderers, or shared
rendering utilities — those live in `src/rendering/`.
