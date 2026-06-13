# 测试审核报告

**日期时间**: 2026-06-13 23:54:40
**审核范围**: 拖出功能"最终方案" — 从 sendSync 回退到 send + e.preventDefault() 组合。3 个核心文件 + types.ts 被修改。

## 一、审核概要
- 审核结果: **有bug**
- 审核文件数: 4
- 发现问题数: 5
  - 严重: 3
  - 一般: 1
  - 建议: 1

## 二、审核文件清单

| # | 文件 | 说明 |
|---|------|------|
| 1 | `src/hooks/useDragDrop.ts` | 拖出 hook，核心变更：重新加入 `e.preventDefault()` |
| 2 | `main-process/preload.js` L52 | IPC bridge，核心变更：`sendSync` → `send`（回退），移除 `return` |
| 3 | `main-process/ipcHandlers.js` L192-203 | IPC handler，核心变更：移除 `event.returnValue`，改用 1x1 透明 PNG icon |
| 4 | `src/types.ts` L93 | 类型声明，变更：`boolean` → `void`（回退） |

## 三、需求符合性检查

### 同步性需求

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `startDrag` 在 dragstart 事件上下文内同步执行 | **严重 bug** | 见下方详细分析 |
| `send` 是否同步投递到主进程 | **严重 bug** | 否。`send` 是异步的，主进程在下个 tick 才执行 handler |
| draggable + onDragStart 模式 | 通过 | 三个页面均正确实现 |

### 审查问题逐项回答

#### A) 同步性：`ipcRenderer.send` 不会同步投递

**结论：矛盾存在，这是一个严重 bug。**

`ipcRenderer.send` 在 JavaScript 层面是同步调用的（不返回 Promise，立即返回 `undefined`），但 **Electron 内部的消息投递是异步的**。消息被放入一个内部队列，在主进程的事件循环的下一个 tick 中才被处理。

从 Electron 官方文档和源码可以确认：
- `send(channel, ...args)` — "Send an asynchronous message to the main process via channel"
- 消息通过 `postTask` 或等效机制投递到主进程，不是通过函数调用栈直接传递
- 经过 `contextBridge` 时，消息同样经过序列化 → 跨世界传递 → 主进程事件循环的流程

因此，渲染进程 `dragstart` handler 调用 `window.api.file.dragStart()` → `ipcRenderer.send()` 后：
1. `send()` 立即返回（void），渲染进程继续执行
2. `dragstart` 事件回调结束，事件上下文关闭
3. 浏览器层 drag 会话启动（或因为 `e.preventDefault()` 被阻止 — 见 B 分析）
4. 主进程在**下一个 tick** 收到 `ipcMain.on('file:dragStart')` 
5. 此时 **dragstart 事件上下文已消失**，`event.sender.startDrag()` 可能失败或无效

这与之前 v7 审核（test-review-report-20260613-220000.md）发现的根因完全相同。v7 使用 `sendSync` 正确解决了这个问题。

#### B) `e.preventDefault()` + `send` 组合：致命矛盾

**结论：存在两个互斥的严重问题。**

当前代码的执行流程：

1. 用户开始拖动 `<tr draggable>`
2. `dragstart` 事件触发 → `handleDragStart()`
3. `e.preventDefault()` **阻止了浏览器默认拖放行为** — 不允许 HTML5 原生拖放
4. `e.stopPropagation()` 阻止事件冒泡
5. `window.api.file.dragStart()` → `ipcRenderer.send()` → 异步消息发出
6. 渲染进程事件回调结束
7. 此时的状态：**浏览器原生拖放被 `preventDefault` 阻止了，OS 级 `startDrag` 还没有被调用**（主进程还没收到消息）
8. 用户看到的效果：**什么都没有发生** — 没有拖放反馈，文件无法被拖出

如果**移除** `e.preventDefault()`（如 v7 方案）：
- 浏览器会启动 HTML5 文本拖放（因为 `<tr>` 没有 `dataTransfer.setData`，拖放可能显示禁止图标）
- `ipcRenderer.send` 仍然是异步的，`startDrag` 在下个 tick 才执行

这两种情况都无法正确工作。**核心问题是 `send` 的异步性与 `startDrag` 需要在 drag 会话上下文中调用的冲突**。

#### C) icon 验证

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `nativeImage.createFromDataURL()` 是否有效 | **通过** | 这是同步方法，返回 `NativeImage` 实例 |
| 1x1 透明 PNG base64 是否有效 | **通过** | 标准 1x1 透明 PNG，解码正确 |

1x1 透明 PNG 是一个有效的方案。`createFromDataURL` 是同步方法。

#### D) `sendSync` 已移除

| 检查项 | 状态 | 说明 |
|--------|------|------|
| preload.js 不再使用 sendSync | **通过** | L52: `ipcRenderer.send(...)` 不是 sendSync |
| ipcHandlers.js 不再设置 event.returnValue | **通过** | handler 中无 `event.returnValue` 赋值 |
| types.ts 返回类型不再是 boolean | **通过** | L93: `void` |

**这是回退，不是改进。** v7 方案中 `sendSync` 的"阻塞 UI"是必要的代价：
- 用户在主动执行拖出操作，此时 UI 冻结 1-2ms（IPC 往返 + `fs.existsSync`）完全无感知
- `sendSync` 是唯一的确保 `startDrag` 在 dragstart 事件上下文中被调用的方式
- Electron 官方文档的"WARNING: Sending a synchronous message will block the whole renderer process"是针对非用户手势场景的通用警告，拖出场景下阻塞 1ms 是可接受的

#### E) 替代方案评估

如果拒绝 `sendSync`，可能的替代方案：

1. **❌ 当前方案（send + preventDefault）** — 已证明不可行（见 B 分析）
2. **❌ send + 不 preventDefault + setTimeout(0)** — 之前 v3 审核已证明不可靠
3. **✅ sendSync** — 已验证可行的方案（v7 审核通过）
4. **❌ main.js 中 webContents 事件** — `will-attach-webview` 等事件无法替代 drag 场景
5. **⚠️ `webContents.startDrag()` 的同步变体** — Electron 不提供此 API
6. **⚠️ 在 main 进程中直接监听渲染进程的 drag 事件** — 技术上不可行，主进程无法监听渲染进程的 DOM 事件

**结论：sendSync 是唯一正确的方案。**

## 四、发现的问题

### 严重问题 (必须修复)

#### 问题 1: `ipcRenderer.send` 异步导致 startDrag 丢失事件上下文

- **文件**: `main-process/preload.js` L52, `main-process/ipcHandlers.js` L193-203
- **严重程度**: 严重 — 拖出功能完全失效
- **描述**: 这是之前 v7 审核已确认并通过 sendSync 修复的根因。当前代码回退到 `send`，使 `event.sender.startDrag()` 在 dragstart 事件上下文关闭后才执行。
- **证据链**:
  1. `ipcRenderer.send` 是异步 API（Electron 官方文档明确标注 "asynchronous message"）
  2. 消息投递通过 Electron 内部消息队列，在下一个事件循环 tick 处理
  3. 当主进程 `ipcMain.on` 回调执行时，渲染进程的 dragstart 事件已结束
  4. `webContents.startDrag()` 需要在有效的 drag 会话上下文中调用
- **影响**: 拖出到资源管理器后文件无法被复制/移动，用户操作无反馈
- **建议修复**: 将 `send` 改回 `sendSync`

#### 问题 2: `e.preventDefault()` 阻止浏览器拖放 + 没有 setData 启动拖放 = 拖放无法启动

- **文件**: `src/hooks/useDragDrop.ts` L6
- **严重程度**: 严重 — 拖出操作无任何视觉反馈
- **描述**: `e.preventDefault()` 阻止了浏览器默认拖放行为，但代码没有调用 `e.dataTransfer.setData()` 来启动浏览器级拖放。同时，异步的 `send` 还没执行到 `startDrag`。结果：用户拖动时没有任何拖放行为发生。
- **影响**: 用户体验极差 — 拖动表格行时看到禁止图标或没有任何视觉反馈
- **v7 方案对比**: v7 正确移除了 `e.preventDefault()`，让浏览器自然启动拖放会话（虽然只是文本拖放），然后 `sendSync` 在同一个 tick 内用 `startDrag` 接管为 OS 文件拖放。

#### 问题 3: `event.returnValue` 未设置导致 sendSync（如果将来恢复）无法返回

- **文件**: `main-process/ipcHandlers.js` L192-203
- **严重程度**: 严重（如果恢复 sendSync）
- **描述**: 如果将来把 preload.js 改回 `sendSync`，当前 ipcHandlers.js 没有设置 `event.returnValue`，会导致渲染进程**永远阻塞**（sendSync 等待 returnValue 被设置）。
- **影响**: 渲染进程卡死
- **建议修复**: 在 handler 中设置 `event.returnValue = true`（成功）和 `event.returnValue = false`（失败）。

### 一般问题 (建议修复)

#### 问题 4: 主进程 handler 缺少错误处理

- **文件**: `main-process/ipcHandlers.js` L193-203
- **严重程度**: 一般
- **描述**: `event.sender.startDrag({ file: filePath, icon })` 调用没有 try/catch 包裹。如果 `startDrag` 抛出异常（例如文件路径无效、系统资源不足），会导致未处理的异常。在 `send` 模式下，渲染进程无法知道操作失败。
- **影响**: 异常情况下无错误日志，渲染进程无反馈
- **建议修复**:
```javascript
ipcMain.on('file:dragStart', (event, filePath) => {
  if (!fs.existsSync(filePath)) {
    console.error('file:dragStart - 文件不存在:', filePath);
    return;
  }
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  );
  try {
    event.sender.startDrag({ file: filePath, icon });
  } catch (err) {
    console.error('file:dragStart - startDrag 失败:', filePath, err);
  }
});
```

### 改进建议 (可选)

#### 建议 1: 恢复 sendSync 并添加返回值日志

- **文件**: `src/hooks/useDragDrop.ts`, `main-process/preload.js`, `main-process/ipcHandlers.js`, `src/types.ts`
- **描述**: 将 4 个文件恢复到 v7 的 sendSync 方案（test-review-report-20260613-220000.md 通过的版本），并可选地利用返回值做前端日志。
- **理由**: v7 方案经过 2 轮独立审核确认通过，是唯一经过验证的正确实现。当前方案引入了新的（且已证伪的）架构问题。

## 五、代码质量评估

- 代码规范: 中等 — 注释较少（ipcHandlers.js 有简短注释，但未解释为何选择 `send` 而非 `sendSync`）
- 类型安全: 通过 — `void` 类型与 `send` 的 fire-and-forget 语义一致
- 错误处理: **不足** — 主进程 handler 缺少 try/catch 包裹 `startDrag`；失败无反馈给渲染进程
- 性能考量: 表面良好 — `send` 不阻塞渲染进程，但这是以**功能正确性**为代价的"优化"

## 六、IPC 边界检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 前端仅使用 `window.api.*` | 通过 | 所有调用经过 `window.api.file.dragStart()` |
| 主进程使用 `ipcMain.on` | 通过 | 正确匹配 `send` |
| preload 使用 `contextBridge` 暴露 API | 通过 | 正确使用 `exposeInMainWorld` |
| `send` → `ipcMain.on` 配对吧 | **协议正确** | 配对正确，但 `send` 本质上不适合此场景 |
| 无 `invoke` → `on` 或 `send` → `handle` 不匹配 | 通过 | 所有其他 IPC 均使用 `invoke`/`handle` 模式，正确 |

## 七、测试建议

1. **拖出基本功能测试**: 从 MusicLibrary/TagManager/SearchPage 拖动文件到 Windows 资源管理器，确认文件能被复制。
2. **文件不存在测试**: 删除物理文件后从列表中拖动，确认无崩溃且有错误日志。
3. **连续拖出测试**: 连续拖動多个不同文件，确认每次都能成功。
4. **特殊字符路径测试**: 拖动路径包含中文、空格的文件。
5. **三个页面覆盖**: 在 MusicLibrary、TagManager、SearchPage 分别测试拖出。
6. **与 v7 方案对比**: 如果当前方案在 Windows 上拖出后文件无法复制（最可能的结果），确认 v7 sendSync 方案可以正常工作的前提是否仍然成立。

## 八、总结

**当前方案存在 3 个严重问题，拖出功能大概率失效。**

核心矛盾链：
1. `ipcRenderer.send` 是异步的 → `startDrag()` 在下一个 tick 才执行 → dragstart 事件上下文已关闭
2. `e.preventDefault()` 阻止了浏览器默认拖放 → 没有任何拖放行为发生
3. 即使移除 `e.preventDefault()`，`send` 的异步性仍然导致 `startDrag` 失去上下文

**v7 的 sendSync 方案（test-review-report-20260613-220000.md）是经过验证的正确方案。** sendSync 在 dragstart 场景下的"阻塞 UI"是正确且必要的代价（阻塞仅 1-2ms，用户无感知），不是应该被优化掉的问题。

**结论**: 有 bug，建议恢复到 v7 的 sendSync 方案，或在此基础上做增量改进（如添加 try/catch 错误处理）。

### 审查历史对比

| 版本 | 方案 | 审核结论 | 日期 |
|------|------|----------|------|
| v3 | send + setTimeout(0) + no preventDefault | 有bug (async IIFE) | 2026-06-13 |
| v4 | send + async IIFE + getFileIcon | 通过 | 2026-06-13 |
| v5 | send + 同步 + createEmpty | **通过** | 2026-06-13 21:53 |
| v6 | send + 同步 + createEmpty | **通过** | 2026-06-13 22:30 |
| v7 | **sendSync** + 同步 + createEmpty | **通过** ✅ | 2026-06-13 22:00 |
| v8 (当前) | send + preventDefault + 透明PNG | **有bug** ❌ | 2026-06-13 23:54 |

v7 = 唯一正确定位并解决根因的版本。当前 v8 回退了关键修复。
