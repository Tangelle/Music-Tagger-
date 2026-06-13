# 测试审核报告

**日期时间**: 2026-06-13 15:04:34
**审核范围**: 排序方式选择器功能完整实现 — 数据库迁移、后端排序字段扩展、IPC 通路、前端排序 UI、播放统计自动记录

## 一、审核概要
- 审核结果: 有bug
- 审核文件数: 7
- 发现问题数: 4
  - 严重: 2
  - 一般: 1
  - 建议: 1

## 二、审核文件清单

| # | 文件 | 说明 |
|---|------|------|
| 1 | `main-process/database.js` | 数据库初始化、schema 定义、迁移逻辑、setDbPath |
| 2 | `main-process/trackService.js` | 排序字段白名单、recordPlay 函数 |
| 3 | `main-process/ipcHandlers.js` | tracks:recordPlay handler 注册 |
| 4 | `main-process/preload.js` | contextBridge 暴露 recordPlay API |
| 5 | `src/types.ts` | Track 接口、Window.api.tracks 类型声明 |
| 6 | `src/pages/MusicLibrary.tsx` | SortField 类型、SORT_OPTIONS、排序 UI 控件 |
| 7 | `src/components/AudioPlayer.tsx` | onPlay 事件中调用 recordPlay |

## 三、需求符合性检查

| # | 需求 | 状态 | 说明 |
|---|------|------|------|
| 1 | 添加时间排序（从新到旧/旧到新） | 满足 | `added_at` 字段 + SORT_OPTIONS + getDefaultSortDir('added_at')='DESC' |
| 2 | 最后使用时间排序（从新到旧/旧到新） | 满足 | `last_used_at` 字段 + SORT_OPTIONS + getDefaultSortDir |
| 3 | 使用次数排序（从多到少/少到多） | 满足 | `play_count` 字段 + SORT_OPTIONS + getDefaultSortDir |
| 4 | 标题、艺术家、专辑、时长、格式（原有排序保留） | 满足 | 5 个原有字段均在 SortField 和 validSortCols 中 |
| 5 | 播放音乐时自动记录最后使用时间和播放次数 | 满足 | AudioPlayer.tsx onPlay 调用 recordPlay，trackService 使用 COALESCE |
| 6 | 数据库 schema 包含新列 | 部分满足 | initDb 正确，setDbPath 缺失迁移逻辑（见严重问题 #1） |
| 7 | 旧数据库自动迁移 | 部分满足 | initDb 有迁移，setDbPath 无迁移（见严重问题 #1） |

## 四、发现的问题

### 严重问题 (必须修复)

#### 问题 1: `setDbPath` 缺少列迁移逻辑

- **文件**: `main-process/database.js`，行 258-298，`setDbPath` 函数
- **描述**: `initDb()` (行 152-158) 通过 `PRAGMA table_info(tracks)` 检查列是否存在并执行 `ALTER TABLE ADD COLUMN` 迁移。但 `setDbPath()` (行 258-272) 只用 `CREATE TABLE IF NOT EXISTS` 重建了包含新列的 tracks 表，没有执行相同的迁移检查。
- **影响场景**: 用户使用「更改数据库位置」功能将旧数据库（无 `last_used_at` 和 `play_count` 列）复制到新位置时：
  1. 旧 DB 有 `tracks` 表但无新列
  2. `CREATE TABLE IF NOT EXISTS` 发现表已存在，跳过
  3. `PRAGMA table_info` 检查缺失 → **此处未执行**
  4. 后续 `sortBy='last_used_at'` 或 `sortBy='play_count'` 的查询将触发 SQL 错误 "no such column: last_used_at"
- **建议修复**: 在 `setDbPath` 中 `CREATE TABLE IF NOT EXISTS tracks` 之后，添加与 `initDb` 相同的迁移检查代码：

```javascript
// 迁移：为通过 setDbPath 打开的旧数据库添加新列
const trackCols = [];
const colResult = sqlDb.exec("PRAGMA table_info(tracks)");
if (colResult.length > 0 && colResult[0].values.length > 0) {
  // sql.js raw exec returns columns+values — extract column names from the first row
}
// Alternative: use the Statement wrapper
const stmt = new Statement(sqlDb, "PRAGMA table_info(tracks)");
const cols = stmt.all().map(r => r.name);
if (!cols.includes('last_used_at')) {
  sqlDb.run('ALTER TABLE tracks ADD COLUMN last_used_at DATETIME');
}
if (!cols.includes('play_count')) {
  sqlDb.run('ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0');
}
```

注意: 直接在 sqlDb 上调用 `db.exec()` 不可行，因为 `db = new Database(sqlDb, newPath)` 在第 300 行才创建。但可以在创建 Database 实例之后再执行迁移，方法是将迁移逻辑移到 `db = new Database(sqlDb, newPath)` 之后，使用 `db.prepare()` 来查询和修改。另一个更简洁的方案是：在 `setDbPath` 的 `sqlDb.run(...)` 块最后，也复制 `initDb` 中的迁移代码，通过 sqlDb 原生 API 执行迁移。

#### 问题 2: `AudioPlayer` useEffect 依赖数组缺失 `track.id`

- **文件**: `src/components/AudioPlayer.tsx`，行 58
- **描述**: useEffect 的依赖数组是 `[audioSrc, track.duration, volume]`，但 `onPlay` 回调 (行 37-42) 中使用了 `track.id`。当用户切换播放曲目时：
  1. 新 track 传入 → `audioSrc` 更新 → useEffect cleanup 移除旧事件监听器 → 注册新监听器
  2. 但如果 `audioSrc` 相同（同一文件的多个数据库条目）或 audioSrc 更新延迟导致 audio 元素尚未重新加载，旧 `onPlay` 持有的是前一个 track 的 ID
- **实际风险**: 在一般场景中，切换 track 时 audioSrc 变化驱动 re-run，所以风险较低。但在严格 TypeScript/react-hooks/exhaustive-deps lint 规则下这是一个违规项。
- **影响**: 罕见的竞态条件：如果用户在 audio element 重新加载 src 之前快速触发 play 事件，可能记录到错误的 track ID。
- **建议修复**: 将 `track.id` 加入依赖数组：`[audioSrc, track.duration, volume, track.id]`。或者使用 `useRef(track.id)` 在回调中访问最新值。

### 一般问题 (建议修复)

#### 问题 3: `searchService.search` 不支持自定义排序

- **文件**: `main-process/searchService.js`，行 15
- **描述**: `search()` 函数硬编码了 `ORDER BY t.title ASC`。虽然 `SearchPage` 前端组件调用 `window.api.search.all()` 而非 `window.api.tracks.getAll()`，但如果未来 SearchPage 也需要使用排序选择器，searchService 无法支持排序参数传递。
- **影响**: 当前 SearchPage 不需要排序功能，不影响正常运行。但设计不一致。
- **建议修复**: 为 `search()` 添加可选的 `sortBy`/`sortDir` 参数，保持与 `getAllTracks` 一致的 validSortCols 验证。或者随 SearchPage 排序需求一起实现。

### 改进建议 (可选)

#### 建议 4: COALESCE 排序一致性

- **文件**: `main-process/trackService.js`，行 167
- **描述**: `recordPlay` 使用 `COALESCE(play_count, 0) + 1` 更新，但排序查询 `ORDER BY t.play_count DESC` 不会自动应用 COALESCE。`play_count` 的 DEFAULT 已设为 0，所以对新 track 没问题，但旧迁移 track 的 play_count 为 NULL 时，SQLite 的 ORDER BY 会将 NULL 排在非 NULL 值之前（升序）或之后（降序），取决于 SQLite 版本行为。
- **影响**: 旧迁移行的 NULL play_count 在排序结果中的位置可能与用户预期不一致（NULL 被视为小于任何值或大于任何值，取决于 SQLite 版本和 ASC/DESC）。
- **建议修复**: 在 `recordPlay` 和排序查询中统一使用 `COALESCE(play_count, 0)`。要么在 recordPlay 中保留 COALESCE，要么在排序查询中也使用 `ORDER BY COALESCE(t.play_count, 0) ASC`。

## 五、代码质量评估

- **代码规范**: 8/10 — 命名一致、缩进规范、中文注释恰当。MusicLibrary.tsx 的 SortField 类型定义清晰。
- **类型安全**: 9/10 — types.ts 中 Track 接口正确包含 `last_used_at: string | null` 和 `play_count: number | null`。AudioPlayer 的 useEffect 依赖数组使用了完整对象属性作为依赖，Close 但不完美（track.id 缺失）。
- **错误处理**: 8/10 — recordPlay 的 IPC handler 有 try-catch 模式的替代（audioPlayer 用 .catch）。trackService.recordPlay 函数自身没有检查 trackId 是否存在。但这是一个增量 UPDATE，对不存在的 ID 静默无操作也是合理的设计。
- **性能考量**: 9/10 — COALESCE 的使用合理，避免 NULL 运算错误。排序字段在 validSortCols 白名单中验证防止 SQL 注入。没有 N+1 查询问题。

## 六、IPC边界检查

| 检查项 | 结果 |
|--------|------|
| 前端仅通过 `window.api.tracks.recordPlay()` 调用 | 通过 |
| preload.js 暴露了 `tracks.recordPlay` | 通过 |
| ipcHandlers.js 注册了 `tracks:recordPlay` handler | 通过 |
| handler 调用了 trackService 且正确保存 | 通过 |
| 没有直接使用 Node API | 通过 |

## 七、测试建议

1. **旧数据库迁移测试 (initDb)**：用没有 `last_used_at` 和 `play_count` 列的旧数据库文件启动应用，验证 migration 成功，按 `添加时间`/`最后使用时间`/`使用次数` 排序不报错。

2. **setDbPath 迁移测试 (严重问题 #1 相关)**：
   - 创建一个旧版本数据库文件（无新列）
   - 在设置中更改数据库位置 → 选择「复制数据」
   - 切换到 最后使用时间 或 使用次数 排序 → 应无 SQL 错误

3. **播放记录测试**：
   - 播放一首曲目 → 切换到 `最后使用时间` 降序排列 → 该曲目应在列表顶部
   - 多次播放同一曲目 → 切换到 `使用次数` 降序排列 → 次数最多的在顶部
   - 切换播放曲目 → 确认 play 事件不会记录到错误的 track

4. **排序 UI 测试**：
   - 在 MusicLibrary 页面选择不同的排序字段 → 确认排序方式自动切换（时间类默认降序，文本类默认升序）
   - 点击排序方向切换按钮 → 确认 ASC/DESC 正确切换
   - 验证排序选择器在所有 8 个字段之间切换正常

5. **边界条件测试**：
   - 空库排序 → 不报错
   - `play_count` 为 NULL 的旧数据 → 排序不报错，位置合理
   - 搜索 + 排序组合 → 正确过滤并排序

## 八、总结

整体实现质量较高，排序功能的核心路径（schema、后端白名单、IPC 通路、前端 UI、播放统计记录）均已正确实现。**存在一个严重问题**：`setDbPath()` 函数未包含与 `initDb()` 相同的列迁移逻辑。当用户通过「更改数据库位置」功能迁移旧数据库时，新列将缺失，导致按 `last_used_at` 或 `play_count` 排序时 SQL 报错。修复方法是将 initDb 中的 `PRAGMA table_info` + `ALTER TABLE` 迁移代码复制到 `setDbPath` 的相应位置。

另外，AudioPlayer 的 useEffect 依赖数组缺少 `track.id`，建议补充以符合 React hooks 最佳实践，尽管实际触发风险较低。
