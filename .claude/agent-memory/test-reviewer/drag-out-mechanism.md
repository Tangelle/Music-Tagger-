---
name: drag-out-mechanism
description: How the mousedown+mousemove drag-out pattern works (replacing dragStart events)
metadata:
  type: reference
---

The drag-out mechanism replaces the old `draggable` + `dragStart` event pattern with a manual mousedown/mousemove/mouseup pattern to avoid IPC race conditions.

**Hook**: `src/hooks/useDragOutTrack.ts`
- Uses `useRef` to track mousedown position and the Track being dragged
- On mousemove, if movement exceeds 5px threshold, calls `window.api.file.dragStart()` (IPC to main process, which calls `event.sender.startDrag()`)
- Clears `mouseDownRef` immediately upon triggering to prevent re-trigger
- Also clears on mouseup

**Three pages** consistently use this pattern: MusicLibrary, TagManager, SearchPage
- `<tr>` elements use `onMouseDown`/`onMouseMove`/`onMouseUp` instead of `draggable={true}` + `onDragStart`
- CSS rule `tr[draggable="true"]` removed from index.css
- Cursor set via `style={{ cursor: 'grab' }}`

**Potential issue**: Child element clicks (buttons, checkboxes) on the `<tr>` bubble mousedown up to the row, which can cause accidental drag triggers if the user moves slightly while clicking.
