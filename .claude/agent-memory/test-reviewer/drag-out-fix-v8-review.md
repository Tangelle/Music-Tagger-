---
name: drag-out-fix-v8-review
description: 8th review: send + preventDefault reverted from sendSync, 3 critical bugs found, fail
metadata:
  type: project
---

# Drag-Out Fix v8 Review

Current code (2026-06-13) reverted from v7's working `sendSync` to `send` + `e.preventDefault()`.

**Why:** Unknown — possibly an attempt to avoid sendSync's "blocking" behavior.

**How to apply:** The v8 review found 3 critical bugs:
1. `ipcRenderer.send` is asynchronous — `startDrag()` runs in next tick, losing dragstart event context
2. `e.preventDefault()` blocks browser drag without `setData()` — nothing happens visually
3. No `event.returnValue` set — would hang if sendSync is restored

v7 (sendSync) is the only verified-correct solution. sendSync's 1-2ms block is acceptable during user drag gesture.

**Verdict:** 有bug — revert to v7 sendSync.

Linked: [[drag-out-mechanism-v7]]
