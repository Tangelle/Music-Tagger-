---
name: drag-in-fix-v3-review
description: Review of drag-in blue overlay fix v3: useState→useRef for dragCounter eliminates stale closure bug
metadata:
  type: project
---

Drag-in blue overlay fix v3 reviewed 2026-06-13. Result: **通过**, zero findings.

**Why**: The dragCounter was a `useState`, causing React closure to capture stale values — dragEnter increments in old closures, dragLeave cannot decrement to 0, so `isDragOver` never clears. v3 fix changes it to `useRef(0)` — refs are mutable and always current regardless of closure age.

**Fix architecture**:
- `dragCounterRef = useRef(0)` — mutable counter immune to stale closures
- `handleDragEnter` — increments counter + setIsDragOver(true) (only for Files type)
- `handleDragOver` — only preventDefault, no counter mutation (avoids dragover flooding count)
- `handleDragLeave` — decrements, clamps to 0, clears isDragOver at 0
- `handleDrop` — forces counter=0 + isDragOver=false
- `onDragOver={handleDragOver}` — separate from dragEnter to prevent counter inflation

**How to apply**: This is the canonical pattern for drag-in overlays in React. When implementing similar features, always use useRef for counters in drag event handlers that use useCallback with empty deps.

See `test-review-report-20260613-dragin-v3.md` for full report.
