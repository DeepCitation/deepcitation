# CitationList Component — Implementation Plan

## Context

The deepcitation package has two citation display extremes:
- **CitationDrawerTrigger** — one-line summary bar (icons + label). No detail without clicking.
- **CitationDrawer** — full overlay (portal, backdrop, scroll lock, drag gestures, accordion). Heavy commitment.

**Need**: An inline, always-visible list that shows each citation's status, source, and anchor text directly in the page flow. No expand/collapse — WYSIWYG. Each row has a clickable status indicator that opens the standard citation popover for evidence details.

## Design Decisions (from user)

- **Independent component** — not tied to CitationDrawerTrigger
- **WYSIWYG** — all content visible, no accordion/collapse
- **Flat list** — no source grouping headers; source info per-row; sorted worst-status-first
- **Configurable maxHeight** — optional internal scrolling
- **Clickable indicator → popover** — reuses existing `CitationComponent` with `content="indicator"` for free popover integration

## Proposed API

```tsx
interface CitationListProps {
  /** Citation groups — same data model as CitationDrawer/Trigger */
  citationGroups: SourceCitationGroup[];
  /** Optional max height; enables internal scrolling (e.g., "400px", "50vh", 300) */
  maxHeight?: string | number;
  /** Additional class name */
  className?: string;
  /** Status indicator style (default: "icon") */
  indicatorVariant?: IndicatorVariant;
  /** Map of attachmentId/URL to friendly display label */
  sourceLabelMap?: Record<string, string>;
  /** Page images keyed by attachmentId (passed to popover) */
  pageImagesByAttachmentId?: Record<string, PageImage[]>;
  /** Custom empty-state render */
  renderEmpty?: () => React.ReactNode;
}
```

## Component Structure

```
CitationList (outer div, optional maxHeight scroll)
└── CitationListRow (per citation, flat)
    ├── CitationComponent content="indicator"  ← clickable, opens popover
    ├── FaviconImage + source name             ← source identity
    └── Anchor text (truncated)                ← what was cited
```

Each row is a single horizontal line: `[✓] [favicon] SourceName  anchor text preview...`

## Key Reuse Points

| What | From | How |
|------|------|-----|
| Clickable indicator + popover | `CitationComponent` with `content="indicator"` | Embed directly per row |
| Source favicon | `FaviconImage` from `VerificationLog.tsx` | Import and render |
| Flatten groups → sorted items | `flattenCitations` + `sortGroupsByWorstStatus` from `CitationDrawer.utils.tsx` | Call in `useMemo` |
| Resolve source labels | `resolveGroupLabels` from `CitationDrawer.utils.tsx` | Call before flattening |
| Tailwind utilities | `cn` from `utils.js` | Standard pattern |

## Implementation Steps

### Step 1: Create `src/react/CitationList.tsx`

New file with:
- `CitationListProps` interface
- `CitationListRow` internal component (one row)
- `CitationList` main component
- `MemoizedCitationList` export (`React.memo` wrapper)

**Pseudo-implementation:**

```tsx
export function CitationList({
  citationGroups, maxHeight, className, indicatorVariant = "icon",
  sourceLabelMap, pageImagesByAttachmentId, renderEmpty,
}: CitationListProps) {
  const resolvedGroups = useMemo(
    () => resolveGroupLabels(citationGroups, sourceLabelMap),
    [citationGroups, sourceLabelMap],
  );
  const flatItems = useMemo(
    () => flattenCitations(sortGroupsByWorstStatus(resolvedGroups)),
    [resolvedGroups],
  );

  if (flatItems.length === 0) return renderEmpty ? renderEmpty() : null;

  const scrollStyle = maxHeight ? {
    maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
    overflowY: "auto" as const,
  } : undefined;

  return (
    <div className={cn("divide-y divide-dc-border", className)} style={scrollStyle}>
      {flatItems.map(flat => (
        <CitationListRow key={flat.item.citationKey} flat={flat} ... />
      ))}
    </div>
  );
}

function CitationListRow({ flat, indicatorVariant, pageImagesByAttachmentId }) {
  const { item, sourceName, sourceFavicon } = flat;
  const anchorText = item.citation.anchorText?.toString() || item.citation.fullPhrase || "";

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm min-w-0">
      {/* Clickable status indicator — opens standard popover */}
      <CitationComponent
        citation={item.citation}
        verification={item.verification}
        content="indicator"
        indicatorVariant={indicatorVariant}
        popoverPosition="top"
        pageImagesByAttachmentId={pageImagesByAttachmentId}
      />
      {/* Source identity */}
      <span className="flex items-center gap-1 shrink-0">
        <FaviconImage faviconUrl={sourceFavicon} domain={item.citation.url} alt={sourceName} />
        <span className="text-xs text-dc-muted-foreground truncate max-w-[120px]">{sourceName}</span>
      </span>
      {/* Anchor text */}
      <span className="text-dc-foreground truncate min-w-0 flex-1">{anchorText}</span>
    </div>
  );
}
```

### Step 2: Export from barrel (`src/react/index.ts`)

Add near CitationDrawer exports:
```typescript
export { CitationList, MemoizedCitationList, type CitationListProps } from "./CitationList.js";
```

### Step 3: Tests

- Verify rendering with 0, 1, N citations
- Verify flat ordering (worst status first)
- Verify maxHeight creates scrollable container
- Verify CitationComponent indicator is rendered per row

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/react/CitationList.tsx` | **Create** — new component |
| `src/react/index.ts` | **Modify** — add exports |

## Edge Cases

- **Empty**: Returns `renderEmpty()` or `null`
- **Single citation**: One row, no scroll
- **Many citations**: `maxHeight` enables `overflow-y: auto`
- **Pending verifications**: CitationComponent handles spinner internally
- **Mixed sources**: Each row shows its own favicon/name
- **React 19 fiber safety**: No conditional mount/unmount — every row has identical component tree

## Verification

```bash
bun test          # existing tests pass
bun run lint      # no new lint errors
bun run build     # builds cleanly
```

Visual: component renders inline rows with clickable indicators that open popovers.
