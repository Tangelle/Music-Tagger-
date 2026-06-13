---
name: audioplayer-drag-fix-review
description: Review of AudioPlayer volume/progress bar mousedown-drag fix — pass, zero bugs
metadata:
  type: project
---

AudioPlayer drag fix review completed on 2026-06-13. Result: **pass**, zero bugs found.

Pattern: `onMouseDown` + `document.addEventListener('mousemove/mouseup')` replacing `onClick` for both seek bar and volume bar. Uses `useRef` for dragging flags (`isDraggingSeek`, `isDraggingVolume`). DOM elements located via `document.getElementById('progress-bar')` / `'volume-bar'`.

Defense layers confirmed:
- `calcSeek`/`calcVolume` guard: `if (!bar) return undefined`
- `seekTo`/`setVolumeTo` guard: `if (time/ratio !== undefined)`
- Listener cleanup in both mouseup handlers (normal + external release)

One minor suggestion noted: `getBoundingClientRect()` called every mousemove frame without throttle, but overhead negligible for this use case.
