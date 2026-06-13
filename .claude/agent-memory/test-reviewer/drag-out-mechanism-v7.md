---
name: drag-out-mechanism-v7
description: Final drag-out implementation using ipcRenderer.sendSync (not send) — sendSync blocks renderer to ensure startDrag executes within dragstart event context
metadata:
  type: project
---

The drag-out mechanism uses `ipcRenderer.sendSync` for the definitive fix:

## Root Cause
`ipcRenderer.send()` is synchronous at the JavaScript level but Electron delivers the message asynchronously — the main process handler executes in the next event loop tick, after the `dragstart` event context has closed. `event.sender.startDrag()` requires being called within the `dragstart` event's synchronous context.

## Current Implementation (v7)

### Call Chain (fully synchronous)
1. **React**: `<tr draggable onDragStart={(e) => handleDragStart(e, track)}>` on all 3 pages
2. **Hook** (`useDragDrop.ts`): `e.preventDefault()` + `e.dataTransfer.effectAllowed = 'copy'` + `window.api.file.dragStart(track.file_path)`
3. **Preload** (`preload.js` L52): `ipcRenderer.sendSync('file:dragStart', filePath)` — blocks renderer, returns `event.returnValue`
4. **Main** (`ipcHandlers.js` L196-209): `ipcMain.on('file:dragStart', ...)` — synchronous handler, calls `event.sender.startDrag()` directly, sets `event.returnValue`
5. **Types** (`types.ts` L93): `dragStart: (filePath: string) => boolean`

### Key Decisions
- `sendSync` blocks the renderer process — acceptable because `dragstart` requires synchronous execution
- `nativeImage.createEmpty()` instead of async `app.getFileIcon()` — avoids breaking the sync chain
- `event.returnValue = false` on both file-not-found and startDrag exception paths

## Evolution
- v1: mousedown+mousemove workaround (SUPERSEDED)
- v2: dragstart + ipcRenderer.send + ipcMain.on ([[drag-out-fix-v5-review]]) — PASSED but had timing bug
- v7: dragstart + ipcRenderer.sendSync + ipcMain.on + event.returnValue — DEFINITIVE FIX

Related: [[drag-out-fix-v7-review]]
