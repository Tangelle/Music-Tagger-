---
name: drag-out-fix-v6-review
description: 6th review: sendSync root cause fix, zero findings, pass, 1 minor suggestion
metadata:
  type: project
---

Root cause confirmed: `ipcRenderer.send` is not truly synchronous in Electron's message-passing architecture. The main process `ipcMain.on` handler runs in the next tick, after the `dragstart` event context has closed, so `event.sender.startDrag()` cannot initiate OS-level drag.

**Fix**: 3 files changed:
1. `preload.js` L52: `ipcRenderer.send` → `ipcRenderer.sendSync`, returns the value
2. `ipcHandlers.js` L196-209: All code paths set `event.returnValue` (true on success, false on file-not-found or exception)
3. `types.ts` L93: Return type `void` → `boolean`

`useDragDrop.ts` hook unchanged — still correct. It does not use the boolean return value; a minor suggestion to log on `false` was noted but is non-blocking.

Zero findings. Pass.

**Why**: `sendSync` blocks the renderer until `event.returnValue` is set, guaranteeing `startDrag` executes within the `dragstart` call stack. The blocking is acceptable because the user is actively dragging (UI freeze is expected).

See [[drag-out-fix-v5-review]] for the previous approach that used `ipcRenderer.send` (fire-and-forget) which failed for the async-message-passing reason.
