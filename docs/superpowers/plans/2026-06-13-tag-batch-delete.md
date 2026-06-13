# TagManager 批量删除标签 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 TagManager 页面添加批量选择标签并一次性删除多个标签的功能，包含全选 checkbox、选中工具栏、确认对话框和完整的 IPC 链路。

**Architecture:** 参照 MusicLibrary 的曲目批量删除模式（`selectedIds: Set<number>` + IPC `tags:deleteBatch`），在 TagManager 左侧标签列表中为每行添加 checkbox、表头添加全选 checkbox、选中后显示浮动操作栏，新增 `tags:deleteBatch` IPC 通道在后端统一处理确认对话框和批量删除。

**Tech Stack:** React 18 + TypeScript (renderer), Electron IPC (preload + main), sql.js (DB), Tailwind CSS

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `music-tagger/src/types.ts` | 修改 | 添加 `tags.deleteBatch` 类型声明 |
| `music-tagger/main-process/tagService.js` | 修改 | 添加 `deleteTags(ids)` 批量删除函数 |
| `music-tagger/main-process/ipcHandlers.js` | 修改 | 添加 `tags:deleteBatch` handler（含确认对话框） |
| `music-tagger/main-process/preload.js` | 修改 | 暴露 `tags.deleteBatch` 到渲染进程 |
| `music-tagger/src/pages/TagManager.tsx` | 修改 | 添加 checkbox 列、全选、选中工具栏 |

---

### Task 1: 类型声明 — types.ts

**Files:**
- Modify: `music-tagger/src/types.ts`

- [ ] **Step 1: 在 `tags` 命名空间添加 `deleteBatch` 方法签名**

在 `Window.api.tags` 接口中，`delete` 方法之后添加：

```typescript
deleteBatch: (ids: number[]) => Promise<{
  success: boolean;
  cancelled?: boolean;
  total?: number;
  deleted?: number;
  failures?: Array<{ id: number; name: string; error: string }>;
}>;
```

完整修改位置是 `src/types.ts` 第79-90行的 `tags` 块。在 `delete: (id: number) => Promise<{ success: boolean }>;` 行之后插入上面的代码。

---

### Task 2: 批量删除服务 — tagService.js

**Files:**
- Modify: `music-tagger/main-process/tagService.js`

- [ ] **Step 1: 添加 `deleteTags(ids)` 函数**

在 `deleteTag` 函数定义之后（第53行后）添加，并在 `module.exports` 中导出：

```javascript
function deleteTags(ids) {
  const db = getDb();
  const results = [];
  for (const id of ids) {
    try {
      const tag = db.prepare('SELECT name FROM tags WHERE id = ?').get(id);
      if (!tag) {
        results.push({ id, name: `ID ${id}`, error: '标签不存在' });
        continue;
      }
      db.prepare('DELETE FROM tags WHERE id = ?').run(id);
      results.push({ id, name: tag.name, deleted: true });
    } catch (err) {
      results.push({ id, name: `ID ${id}`, error: err.message });
    }
  }
  return results;
}
```

- [ ] **Step 2: 在 `module.exports` 中导出 `deleteTags`**

在 `module.exports` 对象中添加 `deleteTags,`（与 `deleteTag,` 相邻放置）。

**Why this design:** 与 `trackService.removeTrack` 逐项处理模式一致，返回每个 ID 的结果便于前端展示部分失败信息。`ON DELETE CASCADE` 由数据库外键自动处理 track_tags 清理，无需在 JS 层额外操作。

---

### Task 3: IPC 处理器 — ipcHandlers.js

**Files:**
- Modify: `music-tagger/main-process/ipcHandlers.js`

- [ ] **Step 1: 在 `tags:delete` handler 之后添加 `tags:deleteBatch` handler**

在第167行 `tags:delete` handler 的 `});` 之后插入：

```javascript
  ipcMain.handle('tags:deleteBatch', async (_event, ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      return { success: false, error: '无效的标签 ID 列表' };
    }

    // 弹出一次确认对话框
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '批量删除标签',
      message: `确定要删除 ${ids.length} 个标签吗？`,
      detail: '删除标签不会影响曲目文件，仅解除标签与曲目的关联关系。',
      buttons: ['删除', '取消'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 1) return { success: false, cancelled: true };

    // 逐项删除
    const results = tagService.deleteTags(ids);
    const failures = results.filter(r => !r.deleted);
    const deleted = results.filter(r => r.deleted).length;

    saveNow();

    return {
      success: true,
      total: ids.length,
      deleted,
      failures: failures.length > 0 ? failures : undefined,
    };
  });
```

**设计要点:**
- 与 `tracks:removeBatch` 结构一致：确认对话框 → 逐项处理 → 返回汇总结果
- 标签删除的确认对话框比曲目简单（不需要"删除文件"选项），只有两个按钮
- detail 文案明确告知用户"不影响曲目文件"，消除用户顾虑

---

### Task 4: Preload 桥接 — preload.js

**Files:**
- Modify: `music-tagger/main-process/preload.js`

- [ ] **Step 1: 在 `tags` 对象中添加 `deleteBatch` 方法**

在 `delete: (id) => ipcRenderer.invoke('tags:delete', id),` 行之后添加：

```javascript
    deleteBatch: (ids) => ipcRenderer.invoke('tags:deleteBatch', ids),
```

完整修改位置：`preload.js` 第21行之后。

---

### Task 5: TagManager UI — TagManager.tsx

**Files:**
- Modify: `music-tagger/src/pages/TagManager.tsx`

这是最大的修改文件，分步骤进行。

- [ ] **Step 1: 添加选中状态管理**

在现有 state 声明区域（第20行 `const [tags, setTags]` 附近）添加：

```typescript
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
```

- [ ] **Step 2: 添加选中/全选切换函数**

在 `handleDelete` 函数（第78行）之后添加：

```typescript
const toggleSelect = (id: number) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const selectAll = () => {
  if (selectedIds.size === tags.length && tags.length > 0) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(tags.map(t => t.id)));
  }
};
```

- [ ] **Step 3: 添加批量删除处理函数**

在 `toggleSelect` / `selectAll` 之后继续添加：

```typescript
const handleDeleteBatch = async () => {
  const result = await window.api.tags.deleteBatch([...selectedIds]);
  if (result.cancelled) return;
  setSelectedIds(new Set());
  // 如果当前选中的标签被删除，清除右侧详情
  if (selectedTag && selectedIds.has(selectedTag.id)) {
    setSelectedTag(null);
  }
  if (result.failures && result.failures.length > 0) {
    console.error('部分标签删除失败:', result.failures);
  }
  onDataChange();
  loadTags();
};
```

- [ ] **Step 4: 修改标签列表区域 — 标题栏改为含全选 checkbox 和批量操作栏**

替换现有的 `<div className="flex items-center justify-between">` 标题栏（第104-109行）为：

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={selectedIds.size === tags.length && tags.length > 0}
      onChange={selectAll}
      className="rounded bg-surface-700 border-surface-600 cursor-pointer"
      title="全选"
    />
    <h2 className="text-lg font-bold text-slate-900 dark:text-white">标签管理</h2>
  </div>
  <button onClick={openCreate} className="btn-primary btn-xs">
    <Plus className="w-3 h-3" /> 新建
  </button>
</div>
```

- [ ] **Step 5: 在标题栏下方添加选中工具栏**

在 Step 4 的标题栏 div 和标签列表 `<div className="space-y-1">` 之间插入：

```tsx
{selectedIds.size > 0 && (
  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-800/60 border border-surface-600 animate-fade-in">
    <span className="text-xs text-slate-400 flex-1">{selectedIds.size} 个已选</span>
    <button
      onClick={handleDeleteBatch}
      className="btn-danger btn-xs flex items-center gap-1"
      title="批量删除选中标签"
    >
      <Trash2 className="w-3 h-3" /> 删除选中
    </button>
  </div>
)}
```

- [ ] **Step 6: 在每个标签行前面添加 checkbox**

修改单个标签行的 JSX（第120-161行），在颜色圆点之前插入 checkbox。将现有的 `<span className="w-3 h-3 rounded-full...">` 之前加入：

```tsx
<input
  type="checkbox"
  checked={selectedIds.has(tag.id)}
  onChange={() => toggleSelect(tag.id)}
  onClick={(e) => e.stopPropagation()}
  className="rounded bg-surface-700 border-surface-600 cursor-pointer flex-shrink-0"
/>
```

标签行的完整结构变为：
```
div (row container)
  ├── checkbox (new)
  ├── color dot (existing)
  ├── tag name (existing)
  ├── track count (existing)
  └── edit/delete buttons (existing, visible on hover)
```

- [ ] **Step 7: 调整标签行的 gap 和布局**

将行容器的 `gap-3` 改为 `gap-2`（因为多了 checkbox），确保布局紧凑。修改第124行的 `gap-3` 为 `gap-2`：

```tsx
className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer group ${
```

- [ ] **Step 8: 修正行点击行为 — 点击 checkbox 时不触发标签选中**

行容器已有 `onClick={() => setSelectedTag(tag)}`（第123行）。checkbox 的 `onClick` 已经调用了 `e.stopPropagation()`（Step 6），这已经阻止了事件冒泡，无需额外修改。

---

### Task 6: 验证与构建

**Files:**
- None (verification only)

- [ ] **Step 1: 验证 TypeScript 编译**

```bash
cd e:/vs_project2/music-tagger && npx tsc --noEmit
```

Expected: No errors related to the modified files.

- [ ] **Step 2: 验证 Vite 构建**

```bash
cd e:/vs_project2/music-tagger && npm run vite:build
```

Expected: Build succeeds without errors.

- [ ] **Step 3: 手动验证清单**

启动应用后验证：
1. TagManager 页面左侧标签列表每行前面出现 checkbox
2. 表头出现全选 checkbox
3. 点击全选 → 所有行 checkbox 选中，工具栏出现
4. 再次点击全选 → 全部取消选中，工具栏消失
5. 单独点选若干标签 → 工具栏显示已选数量
6. 点击「删除选中」→ 弹出确认对话框，文案正确
7. 确认删除 → 标签从列表消失，右侧详情清除（如果被删标签是当前选中标签）
8. 取消删除 → 选中状态保持不变
9. 单个删除按钮仍然正常工作
10. 被删除标签关联的曲目不受影响（曲目文件完整，仅 track_tags 解除关联）

---

## 设计决策总结

| 决策点 | 选择 | 理由 |
|--------|------|------|
| IPC 通道名 | `tags:deleteBatch` | 遵循现有 `tags:delete` + `tracks:removeBatch` 命名模式 |
| 确认对话框位置 | IPC handler 中（后端） | 与 `tracks:removeBatch` 一致，使用 Electron 原生 dialog，用户体验更统一 |
| 批量删除返回值 | `{ success, total, deleted, failures }` | 与 `tracks:removeBatch` 保持一致的结构 |
| 选中状态管理 | `Set<number>` state | 与 MusicLibrary 的 `selectedIds` 模式完全一致 |
| 级联删除 | 依赖 DB 外键 `ON DELETE CASCADE` | 无需 JS 层手动清理 track_tags，数据库自动处理 |
| 单次 saveNow | 批量操作后调用一次 | 比每个标签都 save 高效，`deleteTags` 内部逐项操作但在一个调用中完成 |

## 风险与注意事项

1. **TypeScript strict mode** — 确保 `selectedIds.has(selectedTag.id)` 在 `selectedTag` 可能为 null 时正确处理（已在 `handleDeleteBatch` 中用 `selectedTag &&` 保护）
2. **选中状态残留** — 删除操作完成后必须 `setSelectedIds(new Set())` 清除选中状态
3. **右侧详情同步** — 如果被删除的标签是当前选中的标签，必须清除 `selectedTag` 及 `tagTracks`
4. **checkbox 事件冒泡** — checkbox 的 `onClick` 需要 `e.stopPropagation()` 防止触发行点击（选中标签查看曲目）
5. **全选逻辑边界** — `tags.length === 0` 时全选 checkbox 不应被勾选（已在 `selectAll` 条件中处理）
