# 统一 Session 存储迁移方案

## 背景

当前系统使用双重存储机制：
- **普通 AI sessions**：存储在 `~/.microcompany/conversations/` 目录下的 JSON 文件
- **Task AI sessions**：存储在 SQLite 数据库 `~/Library/Application Support/com.microcompany.desktop/.mc/data.db`

这种分离的存储方式带来以下问题：
1. 数据分散，备份和迁移复杂
2. 无法统一查询和管理所有 sessions
3. 文件存储缺乏事务保证，可能出现写入冲突
4. 难以建立 normal sessions 和 task sessions 之间的关联

## 目标

将所有 AI session 数据统一存储到 SQLite 数据库中，使用不同的表来管理不同类型的 session。

## 核心价值

1. **一致性**：所有 session 数据在一个地方，备份和迁移更简单
2. **查询能力**：可以高效查询、过滤、统计所有 sessions（例如："找出所有使用 claude-opus 的会话"）
3. **关系管理**：可以建立 task sessions 和 normal sessions 之间的关联
4. **事务安全**：数据库提供 ACID 保证，避免文件写入冲突或部分写入
5. **性能优化**：索引和查询优化比扫描 JSON 文件快得多

## 数据库设计

### 新增表结构

#### 1. normal_sessions 表
存储普通 AI 会话的元数据。

```sql
CREATE TABLE normal_sessions (
    id TEXT PRIMARY KEY,
    working_directory TEXT NOT NULL,
    title TEXT NOT NULL,
    provider_id TEXT,
    provider_name TEXT,
    model TEXT,
    base_url TEXT,
    created_at INTEGER NOT NULL,
    last_activity INTEGER NOT NULL,
    message_count INTEGER DEFAULT 0,
    INDEX idx_working_directory (working_directory),
    INDEX idx_last_activity (last_activity),
    INDEX idx_model (model)
);
```

#### 2. normal_messages 表
存储普通 AI 会话的消息历史。

```sql
CREATE TABLE normal_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES normal_sessions(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_timestamp (timestamp)
);
```

### 现有表（Task AI sessions）

保持现有的 task 相关表不变：
- `tasks`
- `roles`
- `sessions`（task sessions）
- `messages`（task messages）

## 实施计划

### Phase 1: 数据库 Schema 更新

1. 创建新的 migration 文件
2. 添加 `normal_sessions` 和 `normal_messages` 表
3. 添加必要的索引

**文件**：`src-tauri/src/database/migration.rs`

### Phase 2: 数据迁移脚本

编写迁移脚本，将现有 JSON 文件导入数据库：

1. 扫描 `~/.microcompany/conversations/` 目录
2. 读取每个 JSON 文件
3. 解析 session 元数据和 messages
4. 插入到 `normal_sessions` 和 `normal_messages` 表
5. 验证数据完整性
6. 可选：备份原始 JSON 文件到 `~/.microcompany/conversations.backup/`

**文件**：`src-tauri/src/commands/migrate.rs`

### Phase 3: 修改 ConversationStorage

重构 `ConversationStorage` 实现，从文件存储改为数据库存储：

1. 修改 `create_session()` - 插入到 `normal_sessions` 表
2. 修改 `save_message()` - 插入到 `normal_messages` 表
3. 修改 `load_session()` - 从数据库查询
4. 修改 `list_sessions()` - 从数据库查询
5. 修改 `delete_session()` - 从数据库删除（级联删除 messages）

**文件**：`src-tauri/src/storage/mod.rs`

### Phase 4: 添加导出功能

提供导出功能，允许用户将数据库中的 sessions 导出为 JSON 文件：

1. 添加 `export_session` 命令
2. 添加 `export_all_sessions` 命令
3. 支持导出到指定目录

**文件**：`src-tauri/src/commands/export.rs`

### Phase 5: 测试和验证

1. 单元测试：测试数据库操作
2. 集成测试：测试完整的 session 生命周期
3. 迁移测试：验证 JSON 到数据库的迁移正确性
4. 性能测试：对比文件存储和数据库存储的性能

## 迁移策略

### 自动迁移（推荐）

应用启动时自动检测并迁移：

1. 检查 `~/.microcompany/conversations/` 是否存在 JSON 文件
2. 如果存在且数据库中没有对应记录，触发自动迁移
3. 迁移完成后，将 JSON 文件移动到 `.backup` 目录
4. 在日志中记录迁移结果

### 手动迁移

提供 Tauri 命令供用户手动触发：

```rust
#[tauri::command]
pub async fn migrate_sessions_to_database() -> Result<MigrationReport, String>
```

返回迁移报告：
- 成功迁移的 session 数量
- 失败的 session 列表
- 错误信息

## 向后兼容性

### 保留文件存储作为备份

在迁移到数据库后，保留原始 JSON 文件作为备份：
- 移动到 `~/.microcompany/conversations.backup/`
- 添加时间戳标记迁移时间

### 导出功能

用户可以随时将数据库中的 sessions 导出为 JSON 文件，用于：
- 手动备份
- 数据审查
- 跨设备迁移

## 风险和缓解措施

### 风险 1：迁移失败导致数据丢失

**缓解措施**：
- 迁移前自动备份所有 JSON 文件
- 使用数据库事务，失败时回滚
- 迁移后验证数据完整性
- 保留原始 JSON 文件直到用户确认迁移成功

### 风险 2：数据库损坏

**缓解措施**：
- 启用 SQLite WAL 模式（已启用）
- 定期运行 `PRAGMA integrity_check`
- 提供数据库修复工具
- 支持从备份恢复

### 风险 3：性能下降

**缓解措施**：
- 添加适当的索引
- 使用连接池（已实现）
- 批量插入优化
- 性能测试和基准对比

## 成功标准

1. 所有现有 JSON 文件成功迁移到数据库，数据完整性 100%
2. 普通 AI sessions 的所有功能正常工作（创建、加载、删除、列表）
3. 迁移过程对用户透明，无需手动干预
4. 查询性能优于或等于文件存储
5. 提供完整的导出功能，用户可以随时导出数据

## 时间估算

- Phase 1: 数据库 Schema 更新 - 2 小时
- Phase 2: 数据迁移脚本 - 4 小时
- Phase 3: 修改 ConversationStorage - 6 小时
- Phase 4: 添加导出功能 - 3 小时
- Phase 5: 测试和验证 - 5 小时

**总计**：约 20 小时（2.5 个工作日）

## 后续优化

迁移完成后可以考虑的优化：

1. **全文搜索**：添加 FTS5 虚拟表，支持消息内容全文搜索
2. **统计分析**：添加 session 使用统计（token 消耗、响应时间等）
3. **关联查询**：建立 normal sessions 和 task sessions 之间的关联
4. **自动清理**：定期清理过期或无用的 sessions
5. **增量备份**：基于数据库的增量备份机制
