# React Doctor Refactor Delegation

This list captures the large refactor items that should be delegated separately from quick fixes.

## src/react/DefaultPopoverContent.tsx
- `react-hooks-js/set-state-in-effect` at lines 690, 740, 743.
- `react-doctor/prefer-useReducer` (6 `useState` values).
- `react-doctor/no-giant-component` (465 lines).

## src/react/EvidenceTray.tsx
- `react-hooks-js/set-state-in-effect` at lines 404, 414, 514, 588, 1230, 1632, 1703.
- `react-doctor/no-cascading-set-state` at lines 402, 512, 568, 1211, 1631, 1689.
- `react-doctor/prefer-useReducer` for `AnchorTextFocusedImage` and `InlineExpandedImage`.
- `react-doctor/no-giant-component` for `AnchorTextFocusedImage`, `EvidenceTray`, `InlineExpandedImage`.
- `react-doctor/no-derived-useState` at line 1542 (`initialOverlayHidden`).

## src/react/ZoomToolbar.tsx
- `react-doctor/no-cascading-set-state` at line 172 (pulse-stage effect).
