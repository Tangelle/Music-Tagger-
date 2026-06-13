# 测试审核报告

**日期时间**: 2026-06-13 15:06:31
**审核范围**: 排序功能 2 个严重问题的修复终审 — setDbPath 列迁移、AudioPlayer useEffect 依赖数组

## 一、审核概要
- 审核结果: 通过
- 审核文件数: 2
- 发现问题数: 0
  - 严重: 0
  - 一般: 0
  - 建议: 0

## 二、审核文件清单

| # | 文件 | 说明 |
|---|------|------|
| 1 | `main-process/database.js` | 确认 setDbPath 中有列迁移代码 |
| 2 | `src/components/AudioPlayer.tsx` | 确认 useEffect 依赖数组有 track.id |

## 三、需求符合性检查

### 问题 1: setDbPath 列迁移

| 检查项 | 状态 | 说明 |
|--------|------|------|
| CREATE TABLE IF NOT EXISTS 之后是否有迁移代码 | **通过** | L300-313，在 tracks 表创建之后立即执行迁移 |
| 是否使用 PRAGMA table_info(tracks) | **通过** | L302: `sqlDb.exec("PRAGMA table_info(tracks)")` |
| sqlDb.exec 返回值解析是否正确 | **通过** | 使用 `colResult[0].values` 逐行取 `row[1]`（即 name 字段） |
| ALTER TABLE 语句是否正确 | **通过** | L308-309: `ALTER TABLE tracks ADD COLUMN last_used_at DATETIME`; L311-312: `ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0` |
| 检查 last_used_at 列 | **通过** | L308: `!trackCols.includes('last_used_at')` |
| 检查 play_count 列 | **通过** | L311: `!trackCols.includes('play_count')` |

**sql.js exec() 解析逻辑验证：**

`sqlDb.exec("PRAGMA table_info(tracks)")` 的返回值结构：
```
[{ columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'],
   values: [[0, 'id', 'INTEGER', 1, null, 1],
            [1, 'file_path', 'TEXT', 1, null, 0],
            ...
            [8, 'last_used_at', 'DATETIME', 0, null, 0],   // row[1] = 'last_used_at'
            [9, 'play_count', 'INTEGER', 0, '0', 0]] }]      // row[1] = 'play_count'
```

`row[1]` 固定为 `name` 字段（PRAGMA table_info 的列顺序是 SQLite 规范定义的，不随平台变化）。解析方式与 `initDb()` 中 L152-158 使用的 `db.prepare(...).all().map(r => r.name)` 功能等价，只是使用原生 sql.js API（因为此时 `db` 尚未重新创建）。逻辑正确。

与 `initDb()` 中 L152-158 的迁移代码对比：`initDb` 使用 Statement 包装器（`db.prepare("PRAGMA table_info(tracks)").all().map(r => r.name)`），`setDbPath` 使用原生 `sqlDb.exec()` 直接解析。功能等价，处理方式符合各自的上下文（setDbPath 在创建 Database 实例前需使用裸 sqlDb）。

### 问题 2: AudioPlayer useEffect 依赖数组

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 依赖数组是否包含 track.id | **通过** | L58: `[audioSrc, track.duration, volume, track.id]` |
| onPlay 回调是否使用最新的 track.id | **通过** | track.id 在依赖数组中，track 切换时 useEffect 重新执行，注册新的 onPlay 监听器 |

## 四、发现的问题

无问题发现。两个修复均已正确实现。

## 五、代码质量评估

- 代码规范: 通过 — 迁移代码格式与 initDb 保持一致
- 类型安全: 通过 — track.id 为 number 类型，依赖数组使用正确
- 错误处理: 通过 — PRAGMA table_info 结果有 null 安全检查；ALTER TABLE 仅当列缺失时执行
- 性能考量: 通过 — 迁移检查仅在 setDbPath 时执行一次，开销可忽略

## 六、IPC 边界检查

本次审查的两个文件不涉及 IPC 边界变更。

## 七、测试建议

1. **setDbPath 迁移测试**：
   - 准备一个旧数据库文件（不含 last_used_at/play_count 列）
   - 在设置中更改数据库位置，选择「复制数据」
   - 验证新数据库中 tracks 表有 last_used_at 和 play_count 列
   - 切换到 最后使用时间 或 使用次数 排序，确认无 SQL 错误

2. **AudioPlayer track 切换测试**：
   - 播放曲目 A
   - 在播放过程中切换到曲目 B（不关闭播放器）
   - 确认 recordPlay 记录到曲目 B 而非曲目 A
   - 验证 最后使用时间 排序显示曲目 B 在顶部

## 八、总结

两个修复均正确实现：

1. **setDbPath 列迁移**：在 `CREATE TABLE IF NOT EXISTS tracks` 之后，通过 `sqlDb.exec("PRAGMA table_info(tracks)")` 检查列存在性，缺失时执行 `ALTER TABLE ADD COLUMN`。解析方式正确（`row[1]` 为 PRAGMA table_info 的 name 字段），与 initDb 中的迁移逻辑功能等价。

2. **AudioPlayer useEffect 依赖数组**：`track.id` 已添加到依赖数组中（L58），确保 track 切换时 onPlay 回调捕获正确的 track ID。

零问题。建议通过。
