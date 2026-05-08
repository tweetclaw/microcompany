# Team Templates Phase 2 任务文档

**文档版本**: v1.0  
**创建日期**: 2026-05-08  
**项目**: MicroCompany  
**文档性质**: Phase 2 开发任务说明

---

## 1. Phase 1 完成情况总结

### ✅ 已完成的 MVP 功能

根据 `team-templates-mvp-scope.md` 的要求，Phase 1 已完成以下所有功能：

#### A. 系统模板只读能力 ✅
- ✅ 系统模板数据结构定义
- ✅ 系统模板列表查询 API
- ✅ 模板详情预览界面
- ✅ 模板角色信息展示

#### B. 从模板生成 Task Draft ✅
- ✅ 模板选择界面
- ✅ 模板复制为可编辑 draft
- ✅ Draft 字段可编辑（task 名称、role 名称、archetype、provider/model）

#### C. 创建前确认页 ✅
- ✅ 创建前确认界面
- ✅ 配置检查与修改
- ✅ Provider/model 缺失阻断
- ✅ 配置完整性校验

#### D. 保存当前 Task 为用户模板 ✅
- ✅ "保存为模板"入口（TaskModeLayout）
- ✅ 保存模板弹窗（SaveTemplateModal）
- ✅ 保存内容：名称、描述、角色结构、配置

#### E. 用户模板复用 ✅
- ✅ 用户模板列表展示
- ✅ 与系统模板并列显示
- ✅ 用户模板进入创建流程

### 🎉 额外完成的优化

- ✅ 简化创建流程（移除"选择创建方式"对话框）
- ✅ 改进交互方式（选中 + 详情按钮）
- ✅ 现代化视觉设计（渐变背景、网格布局、卡片式设计）
- ✅ Blank Task 选项（Word 风格的空白创建）

---

## 2. Phase 2 目标

Phase 2 的核心目标是：**增强 Task 运行时的团队管理能力**

根据 `team-templates-user-guide.md` 第 3.3 节的要求，Phase 2 需要实现：

> **在 task 运行时，用户可以动态调整团队组成，无需重新创建 task。**

这包括三个核心能力：
1. **动态添加角色成员**
2. **动态删除角色成员**
3. **动态更新角色配置**

---

## 3. Phase 2 功能范围

### 3.1 动态添加角色成员

#### 功能描述
在 task 运行时，用户可以随时添加新的角色成员到团队中。

#### 使用场景
- 任务执行中发现需要增加专家角色（如安全审计、性能优化）
- 测试 handoff 流程时发现缺少某个角色
- 临时添加角色进行特定阶段的工作

#### 操作流程
1. 在任务详情页或 Team Brief 界面��击 **"添加成员"** 按钮
2. 填写角色配置（与创建任务时相同）：
   - 角色名称
   - 选择 archetype
   - 配置 provider/model
3. 确认后，系统创建角色并自动创建空会话
4. 新角色立即可用于 handoff 推荐

#### 业务规则
- 角色名称在任务内必须唯一
- 新角色的 `display_order` 可以指定，或自动设置为当前最大值 + 1
- 添加后立即出现在 Team Brief 和 handoff 推荐列表中

#### 技术要求
- **前端**：
  - 在 TaskModeLayout 或 Team Brief 界面添加"添加成员"按钮
  - 创建 AddRoleMemberModal 组件（复用 TaskBuilder 的角色配置 UI）
  - 调用后端 API 创建角色
  - 更新本地状态，刷新 Team Brief 和 handoff 列表
  
- **后端**：
  - 新增 `add_task_role` 命令
  - 参数：`task_id`, `role_name`, `identity`, `archetype_id`, `provider`, `model`, `display_order`
  - 创建 TaskRole 记录
  - 创建空 Session 记录
  - 返回新创建的角色信息

---

### 3.2 动态删除角色成员

#### 功能描述
在 task 运行时，用户可以删除不再需要的角色成员。

#### 使用场景
- 某个角色的工作已完成，希望从团队中移除
- 发现某个角色不需要，想要精简团队
- 调整团队结构以优化协作流程

#### 操作流程
1. 在角色卡片上点击 **"删除"** 按钮
2. 系统弹出确认对话框，提示：
   - 该角色的会话历史将被保留但不可访问
   - 如果有其他角色推荐交接给该角色，推荐列表会更新
3. 用户确认后删除
4. 其他角色的 handoff 推荐列表自动更新

#### 业务规则
- **不能删除当前激活的角色** - 必须先切换到其他角色
- **软删除机制** - 删除角色时，该角色的会话历史保留但标记为已删除
- **至少保留一个角色** - 不能删除最后一个角色
- 删除后，其他角色的 handoff 推荐列表会自动更新

#### 特殊情况处理
- 尝试删除当前激活角色 → 提示"请先切换到其他角色"
- 尝试删除最后一个角色 → 提示"任务至少需要一个角色"
- 角色 A 推荐交接给角色 B，但角色 B 被删除 → 返回"目标角色已被删除，请选择其他角色"

#### 技术要求
- **前端**：
  - 在角色卡片上添加"删除"按钮
  - 创建确认对话框（DeleteRoleConfirmModal）
  - 调用后端 API 删除角色
  - 更新本地状态，刷新 Team Brief 和 handoff 列表
  - 如果删除的是当前角色，自动切换到其他角色
  
- **后端**：
  - 新增 `delete_task_role` 命令
  - 参数：`task_id`, `role_id`
  - 校验：不能删除当前激活角色、不能删除最后一个角色
  - 软删除：标记 TaskRole 为已删除（`is_deleted = true`）
  - 保留 Session 记录但标记为不可访问
  - 返回删除结果

---

### 3.3 动态更新角色配置

#### 功能描述
在 task 运行时，用户可以更新角色的配置信息。

#### 使用场景
- 调整角色顺序以优化协作流程
- 修改角色名称以更准确地反映职责
- 启用或禁用角色的 handoff 功能

#### 操作流程
1. 在角色配置界面选择要更新的角色
2. 修改以下配置：
   - `display_order`（角色顺序）
   - `handoff_enabled`（是否启用 handoff）
   - `name`（角色名称，可选）
3. 确认后，系统更新角色配置

#### 业务规则
- 更新 `display_order` 时，自动调整其他角色的顺序以避免冲突
- 重命名角色时，新名称必须在任务内唯一
- **不能修改角色的 `archetype_id`**（这会改变角色的本质）

#### 调整角色顺序的方式
- 拖拽排序（drag & drop）- **推荐实现**
- 或在角色配置中手动修改 `display_order`

#### 技术要求
- **前端**：
  - 在 Team Brief 界面添加角色编辑功能
  - 实现拖��排序（使用 react-beautiful-dnd 或类似库）
  - 创建 EditRoleModal 组件
  - 调用后端 API 更新角色配置
  - 更新本地状态，刷新 Team Brief
  
- **后端**：
  - 新增 `update_task_role` 命令
  - 参数：`task_id`, `role_id`, `name?`, `display_order?`, `handoff_enabled?`
  - 校验：名称唯一性、display_order 合法性
  - 更新 TaskRole 记录
  - 返回更新后的角色信息

---

## 4. 实施顺序建议

为了降低风险并快速验证，建议按以下顺序实施：

### Step 1: 动态添加角色成员（优先级最高）
**原因**：
- 用户价值最直接（扩展团队能力）
- 技术风险最低（类似创建 task 时添加角色）
- 不涉及删除操作，不会破坏现有数据

**预计工作量**：2-3 天

---

### Step 2: 动态更新角色配置（优先级中等）
**原因**：
- 提升用户体验（优化团队结构）
- 技术复杂度中等（需要处理顺序冲突）
- 拖拽排序需要额外的 UI 工作

**预计工作量**：3-4 天

---

### Step 3: 动态删除角色成员（优先级较低）
**原因**：
- 涉及软删除机制，需要仔细设计
- 需要处理多种边界情况
- 需要更新 handoff 推荐逻辑

**预计工作量**：3-4 天

---

## 5. ���术设计要点

### 5.1 数据库 Schema 变更

#### TaskRole 表增加字段
```sql
ALTER TABLE task_roles ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE task_roles ADD COLUMN deleted_at TIMESTAMP NULL;
```

#### 查询逻辑调整
- 所有查询 TaskRole 的地方需要过滤 `is_deleted = false`
- Handoff 推荐列表需要排除已删除角色

### 5.2 前端状态管理

#### 新增 API 调用
```typescript
// src/api/tasks.ts
export async function addTaskRole(
  taskId: string,
  config: RoleConfig
): Promise<TaskRole>;

export async function deleteTaskRole(
  taskId: string,
  roleId: string
): Promise<void>;

export async function updateTaskRole(
  taskId: string,
  roleId: string,
  updates: Partial<RoleConfig>
): Promise<TaskRole>;
```

#### 组件设计
- `AddRoleMemberModal.tsx` - 添加角色弹窗
- `DeleteRoleConfirmModal.tsx` - 删除确认弹窗
- `EditRoleModal.tsx` - 编辑角色弹窗
- `TeamBriefWithActions.tsx` - 增强版 Team Brief（带操作按钮）

### 5.3 后端命令设计

#### 新增 Tauri 命令
```rust
#[tauri::command]
async fn add_task_role(
    task_id: String,
    role_name: String,
    identity: String,
    archetype_id: Option<String>,
    provider: String,
    model: String,
    display_order: Option<i32>,
) -> Result<TaskRole, String>;

#[tauri::command]
async fn delete_task_role(
    task_id: String,
    role_id: String,
) -> Result<(), String>;

#[tauri::command]
async fn update_task_role(
    task_id: String,
    role_id: String,
    name: Option<String>,
    display_order: Option<i32>,
    handoff_enabled: Option<bool>,
) -> Result<TaskRole, String>;
```

---

## 6. 测试要点

### 6.1 添加角色测试
- ✅ 成功添加角色
- ✅ 角色名称唯一性校验
- ✅ 新角色出现在 Team Brief
- ✅ 新角色可用于 handoff
- ✅ Display order 自动分配

### 6.2 删除角色测试
- ✅ 成功删除角色
- ✅ 不能删除当前激活角色
- ✅ 不能删除最后一个角色
- ✅ 软删除机制生效
- ✅ Handoff 推荐列表更新
- ✅ 删除后自动切换角色

### 6.3 更新角色测试
- ✅ 成功更新角色名称
- ✅ 成功更新 display_order
- ✅ 成功更新 handoff_enabled
- ✅ 名称唯一性校验
- ✅ 拖拽排序功能
- ✅ 不能修改 archetype_id

---

## 7. UI/UX 设计要点

### 7.1 添加成员按钮位置
**推荐位置**：
- Team Brief 界面的右上角
- 或角色列表的底部（"+ Add Member" 卡片）

**设计风格**：
- 与现有按钮风格一致
- 使用 "+" 图标 + "Add Member" 文字
- 悬停时显示提示

### 7.2 删除按钮位置
**推荐位置**：
- 角色卡片的右上角（悬停时显示）
- 或角色卡片的操作菜单中（三个点图标）

**设计风格**：
- 使用红色或警告色
- 图标：🗑️ 或 ✕
- 需要二次确认

### 7.3 编辑/排序交互
**推荐方式**：
- 拖拽排序：鼠标悬停时显示拖拽手柄（⋮⋮）
- 编辑按钮：角色卡片的操作菜单中
- 内联编辑：双击角色名称直接编辑

---

## 8. 风险与注意事项

### 8.1 数据一致性风险
- **风险**：删除角色后，handoff 推荐可能指向已删除角色
- **缓解**：实现软删除机制，查询时过滤已删除角色

### 8.2 并发操作风险
- **风险**：多个用户同时操作同一个 task 的角色
- **缓解**：前端乐观更新 + 后端事务保护

### 8.3 用户体验风险
- **风险**：误删除角色导致数据丢失
- **缓解**：二次确认 + 软删除 + 未来可实现恢复功能

---

## 9. 未来扩展（Phase 3+）

根据 `team-templates-user-guide.md` 第 12 节，未来可以考虑：

### 9.1 角色模板（快速添加常用角色组合）
- 预定义常用的角色组合，一键添加
- 示例："软件交付团队"、"设计评审团队"、"安全审计团队"

### 9.2 角色权限管理
- 限制某些角色的操作权限
- 示例：QA 只能查看代码，PM 可以添加/删除角色

### 9.3 角色恢复
- 恢复已删除的角色及其会话历史
- 在"已删除角色"列表中选择角色并恢复

### 9.4 模板市场（远期）
- 分享和导入社区模板
- 模板版本历史、标签、搜索、收藏

---

## 10. 验收标准

Phase 2 完成的标准：

1. ✅ 用户能在 task 运行时添加新角色
2. ✅ 新角色立即可用于 handoff
3. ✅ 用户能删除不需要的角色
4. ✅ 删除角色时有明确的确认和提示
5. ✅ 软删除机制生效，会话历史保留
6. ✅ 用户能更新角色名称和顺序
7. ✅ 拖拽排序功能正常工作
8. ✅ 所有边界情况都有合理的错误提示

---

## 11. 工作交接

### 11.1 交给后端开发
- 实现 `add_task_role` 命令
- 实现 `delete_task_role` 命令（软删除）
- 实现 `update_task_role` 命令
- 更新 TaskRole 查询逻辑（过滤已删除角色）
- 更新 handoff 推荐逻辑（排除已删除角色）

### 11.2 交给前端开发
- 创建 AddRoleMemberModal 组件
- 创建 DeleteRoleConfirmModal 组件
- 创建 EditRoleModal 组件
- 在 Team Brief 界面添加操作按钮
- 实现拖拽排序功能
- 更新本地状态管理

### 11.3 交给 QA
- 测试添加/删除/更新角色的完整流程
- 测试所有边界情况和错误提示
- 测试软删除机制
- 测试 handoff 推荐列表更新
- 测试拖拽排序功能

---

## 12. 总结

Phase 2 的核心价值是：

> **让用户在 task 运行时灵活调整团队结构，而不必重新创建 task。**

这将大大提升用户体验，使 MicroCompany 的团队协作更加灵活和高效。

**预计总工作量**：8-11 天

**建议实施顺序**：
1. 动态添加角色（2-3 天）
2. 动态更新角色（3-4 天）
3. 动态删除角色（3-4 天）

---

**文档维护**：
- 实施过程中如有变更，及时更新本文档
- 实施完成后，补充实际实现细节和遇到的问题
