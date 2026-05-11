# Team Templates Phase 3 任务文档

**文档版本**: v1.2  
**创建日期**: 2026-05-09  
**更新日期**: 2026-05-09  
**项目**: MicroCompany  
**文档性质**: Phase 3 开发任务说明  
**状态**: 🔄 部分完成 — 后端 CRUD 命令缺失，不可测试

---

## ⚠️ 重要：当前实际开发状态

### 已完成（代码存在）

| 模块 | 状态 |
|------|------|
| 前端 UI 组件：`SortableRoleCard`（拖拽排序卡片） | ✅ 已完成 |
| 前端 UI 组件：`AddRoleMemberModal`（添加角色弹窗，含 provider 字段） | ✅ 已完成 |
| 前端 UI 组件：`EditRoleMemberModal`（编辑角色弹窗，含 provider 字段） | ✅ 已完成 |
| 前端 UI 组件：`DeleteRoleMemberModal`（删除角色确认弹窗） | ✅ 已完成 |
| 前端 API 函数：`addTaskRole`, `updateTaskRole`, `deleteTaskRole`, `reorderTaskRoles` | ✅ 已完成 |
| 前端集成：`TaskModeLayout` 中集成了拖拽排序和增/删/改按钮 | ✅ 已完成 |
| @dnd-kit 依赖包安装 | ✅ 已安装 |

### 未完成（后端缺失 — 阻塞测试）

| 后端命令 | 状态 |
|----------|------|
| `add_task_role` | ❌ 不存在 |
| `update_task_role` | ❌ 不存在 |
| `delete_task_role` | ❌ 不存在 |
| `reorder_task_roles` | ❌ 不存在 |

> **结论**：前端调用 `invoke('add_task_role', ...)` 等会**失败**，因为后端 `lib.rs` 中没有注册这些 Tauri 命令。目前**无法进行 Phase 3 测试**。

---

## 1. Phase 2 完成情况总结

### ✅ 已完成的功能

Phase 2 大部分功能已完成：

#### A. 模板另存为（Save as Template）✅
- ✅ `SaveTemplateModal` 组件
- ✅ 选择预设名称/图标，或自定义
- ✅ 后端 `save_task_as_template` 命令 — 从现有任务克隆角色到 `task_template_roles` 表
- ✅ **provider 信息正确保存**到模板

#### B. 用户模板编辑 ✅
- ✅ `TemplatePicker` 组件（浏览系统模板 + 用户模板）
- ✅ `EditTemplateModal` 组件（编辑名称、描述、图标、角色列表）
- ✅ 角色编辑子组件：`AddRoleMemberModal`、`EditRoleMemberModal`、`DeleteRoleMemberModal`
- ✅ 后端 `update_template` 命令 — 完整替换角色列表（含 provider、model）
- ✅ **provider 信息完整支持**：添加/编辑角色时可选择 provider，保存到数据库

#### C. 运行中任务的动态角色管理 ⚠️ 仅前端完成
- ✅ 前端 `AddRoleMemberModal`（provider 字段存在）
- ✅ 前端 `EditRoleMemberModal`（provider 字段存在）
- ✅ 前端 `DeleteRoleMemberModal`
- ✅ 前端 API 函数：`addTaskRole`, `updateTaskRole`, `deleteTaskRole`
- ❌ **后端命令缺失**：`add_task_role`, `update_task_role`, `delete_task_role` 均未实现
- ❌ 因此这些操作在运行中的任务上**无法使用**

---

## 2. Phase 3 目标

Phase 3 的核心目标是：**增强团队协作的高级功能和用户体验**

根据 Phase 2 文档第 9 节的未来扩展方向，Phase 3 需要实现：

1. **角色拖拽排序** - 通过拖拽调整角色顺序
2. **Handoff 配置管理** - 可视化配置角色间的交接关系
3. **批量操作** - 批量添加、删除、更新角色
4. **角色恢复功能** - 恢复已删除的角色及其会话历史

---

## 3. Phase 3 功能范围

### 3.1 角色拖拽排序 ⚠️ 前端已完成

**完成日期**: 2026-05-09  
**状态**: ⚠️ 前端已完成 — 后端 `reorder_task_roles` 命令未实现

#### 功能描述
用户可以通过拖拽的方式调整角色在团队中的显示顺序。

#### 使用场景
- 调整角色顺序以反映实际工作流程
- 将常用角色放在前面，提高访问效率
- 优化团队结构的视觉呈现

#### 操作流程
1. 在 Team Brief 界面，鼠标悬停在角色卡片上
2. 显示拖拽手柄（⋮⋮ 图标）
3. 按住拖拽手柄，拖动角色卡片到目标位置
4. 松开鼠标，系统自动保存新的顺序
5. 其他角色的 `display_order` 自动调整

#### 技术要求
- **前端**：
  - 使用 `@dnd-kit/core` 和 `@dnd-kit/sortable` 库（推荐）
  - 或使用 `react-beautiful-dnd` 库
  - 在 TaskModeLayout 的角色列表中实现拖拽功能
  - 拖拽时显示视觉反馈（半透明、阴影）
  - 拖拽结束后调用后端 API 批量更新 `display_order`
  
- **后端**：
  - 新增 `reorder_task_roles` 命令
  - 参数：`task_id`, `role_orders: Vec<(role_id, display_order)>`
  - 批量更新所有角色的 `display_order`
  - 使用事务确保原子性

#### 预计工作量
2-3 天

---

### 3.2 Handoff 配置管理 ⏳ 待开发

**状态**: ⏳ 待开发

#### 功能描述
可视化配置和管理角色之间的交接关系。

#### 使用场景
- 查看当前团队的交接关系图
- 启用或禁用某个角色的 handoff 功能
- 配置角色的默认交接目标
- 查看哪些角色可以交接给当前角色

#### 操作流程
1. 在 Team Brief 界面点击 **"Handoff 配置"** 按钮
2. 显示交接关系图（节点 = 角色，边 = 交接关系）
3. 点击角色节点，显示配置选项：
   - 启用/禁用 handoff
   - 设置默认交接目标
   - 查看可交接的角色列表
4. 修改配置后自动保存

#### 可视化方案
**方案 1：流程图（推荐）**
- 使用 `reactflow` 库绘制节点和连线
- 节点 = 角色卡片（显示名称、图标）
- 连线 = 交接关系（箭头方向表示交接方向）
- 支持缩放、拖拽、自动布局

**方案 2：列表视图**
- 每个角色显示一行
- 显示"可交接给"和"可接收自"的角色列表
- 使用开关控制 handoff 启用状态

#### 技术要求
- **前端**：
  - 创建 HandoffConfigModal 组件
  - 使用 `reactflow` 或类似库绘制交接关系图
  - ���现节点点击、连线编辑功能
  - 调用后端 API 更新 handoff 配置
  
- **后端**：
  - 新增 `update_role_handoff_config` 命令
  - 参数：`task_id`, `role_id`, `handoff_enabled`, `default_handoff_target?`
  - 更新 TaskRole 的 handoff 配置
  - 返回更新后的配置

#### 预计工作量
3-4 天

---

### 3.3 批量操作 ⏳ 待开发

**状态**: ⏳ 待开发

#### 功能描述
支持批量添加、删除、更新角色，提高操作效率。

#### 使用场景
- 从模板快速添加多个角色
- 批量删除测试角色
- 批量更新角色的 provider/model
- 批量启用/禁用 handoff

#### 操作流程

**批量添加：**
1. 点击 **"批量添加"** 按钮
2. 选择一个角色模板或手动输入多个角色配置
3. 预览将要添加的角色列表
4. 确认后批量创建

**批量删除：**
1. 在角色列表中勾选多个角色
2. 点击 **"批量删除"** 按钮
3. 确认对话框显示将要删除的角色列表
4. 确认后批量删除

**批量更新：**
1. 在角色列表中勾选多个角色
2. 点击 **"批量更新"** 按钮
3. 选择要更新的字段（provider、model、handoff_enabled）
4. 输入新值，确认后批量更新

#### 技术要求
- **前端**：
  - 在角色卡片上添加复选框（多选模式）
  - 创建 BatchOperationToolbar 组件（显示批量操作按钮）
  - 创建 BatchAddRolesModal 组件
  - 创建 BatchUpdateRolesModal 组件
  - 调用后端 API 批量操作
  
- **后端**：
  - 新增 `batch_add_task_roles` 命令
  - 新增 `batch_delete_task_roles` 命令
  - 新增 `batch_update_task_roles` 命令
  - 使用事务确保原子性
  - 返回操作结果（成功数量、失败数量、错误信息）

#### 预计工作量
3-4 天

---

### 3.4 角色恢复功能 ⏳ 待开发

**状态**: ⏳ 待开发

#### 功能描述
恢复已删除的角色及其会话历史。

#### 使用场景
- 误删除角色后需要恢复
- 临时删除角色后需要重新启用
- 查看已删除角色的历史会话

#### 操作流程
1. 在 Team Brief 界面点击 **"已删除角色"** 按钮
2. 显示已删除角色列表（包括删除时间、删除原因）
3. 选择要恢复的角色
4. 点击 **"恢复"** 按钮
5. 角色恢复到团队中，会话历史重新可访问

#### 业务规则
- 恢复角色时，角色名称可能与现有角色冲突 → 提示用户重命名
- 恢复角色时，`display_order` 自动设置为当前最大值 + 1
- 恢复后，角色的 `is_deleted` 标记为 `false`，`deleted_at` 清空

#### 技术要求
- **前端**：
  - 创建 DeletedRolesModal 组件
  - 显示已删除角色列表（名称、删除时间、会话数量）
  - 实现恢复功能（调用后端 API）
  - 处理名称冲突（弹出重命名对话框）
  
- **后端**：
  - 新增 `list_deleted_task_roles` 命令
  - 新增 `restore_task_role` 命令
  - 参数：`task_id`, `role_id`, `new_name?`
  - 恢复角色：`is_deleted = false`, `deleted_at = NULL`
  - 处理名称冲突
  - 返回恢复后的角色信息

#### 预计工作量
2-3 天

---

## 4. 实施顺序建议

为了降低风险并快速验证，建议按以下顺序实施：

### Step 1: 角色拖拽排序（优先级最高）
**原因**：
- 用户价值直接（提升操作效率）
- 技术风险低（成熟的拖拽库）
- 不涉及复杂的业务逻辑

**预计工作量**：2-3 天

---

### Step 2: 角色恢复功能（优先级中等）
**原因**：
- 补充删除功能的完整性
- 技术复杂度低（主要是 UI 工作）
- 提升用户信心（误删除可恢复）

**预计工作量**：2-3 天

---

### Step 3: Handoff 配置管理（优先级中等）
**原因**：
- 提升高级用户体验
- 技术复杂度中等（需要可视化库）
- 需要更多的 UI/UX 设计

**预计工作量**：3-4 天

---

### Step 4: 批量操作（优先级较低）
**原因**：
- 适用于高级用户和大型团队
- 技术复杂度高（需要处理多种边界情况）
- 可以作为未来优化项

**预计工作量**：3-4 天

---

## 5. 技术设计要点

### 5.1 拖拽排序实现

#### 推荐库：@dnd-kit
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

#### 核心代码结构
```typescript
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';

function TeamBriefWithDragDrop() {
  const [roles, setRoles] = useState<TaskRole[]>([]);
  
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = roles.findIndex(r => r.id === active.id);
      const newIndex = roles.findIndex(r => r.id === over.id);
      const newRoles = arrayMove(roles, oldIndex, newIndex);
      setRoles(newRoles);
      
      // 调用后端 API 保存新顺序
      await reorderTaskRoles(taskId, newRoles.map((r, i) => ({
        role_id: r.id,
        display_order: i
      })));
    }
  };
  
  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={roles} strategy={verticalListSortingStrategy}>
        {roles.map(role => (
          <SortableRoleCard key={role.id} role={role} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
```

### 5.2 Handoff 可视化实现

#### 推荐库：reactflow
```bash
npm install reactflow
```

#### 核心代码结构
```typescript
import ReactFlow, { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';

function HandoffConfigModal() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  
  useEffect(() => {
    // 将角色转换为节点
    const roleNodes = roles.map((role, i) => ({
      id: role.id,
      type: 'custom',
      position: { x: i * 200, y: 100 },
      data: { label: role.name, handoff_enabled: role.handoff_enabled }
    }));
    
    // 根据 handoff 关系生成边
    const handoffEdges = /* 根据业务逻辑生成 */;
    
    setNodes(roleNodes);
    setEdges(handoffEdges);
  }, [roles]);
  
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={handleNodeClick}
      fitView
    />
  );
}
```

### 5.3 批量操作实现

#### 状态管理
```typescript
const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
const [batchMode, setBatchMode] = useState(false);

const toggleRoleSelection = (roleId: string) => {
  setSelectedRoleIds(prev => {
    const next = new Set(prev);
    if (next.has(roleId)) {
      next.delete(roleId);
    } else {
      next.add(roleId);
    }
    return next;
  });
};

const handleBatchDelete = async () => {
  const roleIds = Array.from(selectedRoleIds);
  await batchDeleteTaskRoles(taskId, roleIds);
  setSelectedRoleIds(new Set());
  setBatchMode(false);
  refreshTask();
};
```

### 5.4 角色恢复实现

#### 后端 SQL 查询
```sql
-- 查询已删除角色
SELECT * FROM task_roles
WHERE task_id = ? AND is_deleted = TRUE
ORDER BY deleted_at DESC;

-- 恢复角色
UPDATE task_roles
SET is_deleted = FALSE, deleted_at = NULL, display_order = ?
WHERE id = ? AND task_id = ?;
```

---

## 6. 测试要点

### 6.1 拖拽排序测试（🔴 阻塞于后端）
- 🔴 成功拖拽角色到新位置
- 🔴 拖拽时显示视觉反馈
- 🔴 拖拽结束后顺序保存成功
- 🔴 其他角色的 display_order 自动调整
- 🔴 拖拽失败时回滚到原位置

### 6.2 Handoff 配置测试（⏳ 待开发）
- 🔴 正确显示交接关系图
- 🔴 点击节点显示配置选项
- 🔴 启用/禁用 handoff 功能
- 🔴 设置默认交接目标
- 🔴 配置保存成功

### 6.3 批量操作测试（⏳ 待开发）
- 🔴 批量添加多个角色
- 🔴 批量删除多个角色
- 🔴 批量更新多个角色
- 🔴 部分成功、部分失败的情况处理
- 🔴 事务回滚测试

### 6.4 角色恢复测试（⏳ 待开发）
- 🔴 正确显示已删除角色列表
- 🔴 成功恢复角色
- 🔴 恢复后会话历史可访问
- 🔴 名称冲突时提示重命名
- 🔴 恢复后 display_order 正确

---

## 7. UI/UX 设计要点

### 7.1 拖拽排序 UI
- 拖拽手柄：⋮⋮ 图标，悬停时显示
- 拖拽时：半透明 + 阴影效果
- 放置位置：显示插入线（蓝色虚线）
- 拖拽结束：平滑动画过渡到新位置

### 7.2 Handoff 配置 UI
- 节点样式：圆角矩形，显示角色名称和图标
- 连线样式：箭头，颜色区分启用/禁用状态
- 交互：点击节点弹出配置面板，拖拽节点调整位置
- 工具栏：缩放、自动布局、导出图片

### 7.3 批量操作 UI
- 批量模式开关：右上角"批量操作"按钮
- 复选框：角色卡片左上角
- 工具栏：底部固定，显示已选数量和操作按钮
- 操作按钮：批量删除（红色）、批量更新（紫色）

### 7.4 角色恢复 UI
- 入口：Team Brief 右上角"已删除角色"按钮（灰色）
- 列表：显示角色名称、删除时间、会话数量
- 恢复按钮：每个角色右侧，绿色"恢复"按钮
- 重命名对话框：名称冲突时弹出

---

## 8. 风险与注意事项

### 8.1 拖拽性能风险
- **风险**：大量角色时拖拽可能卡顿
- **缓解**：使用虚拟滚动、限制最大角色数量

### 8.2 Handoff 可视化复杂度
- **风险**：复杂的交接关系图难以理解
- **缓解**：提供多种布局算法、支持筛选和搜索

### 8.3 批量操作事务风险
- **风险**：批量操作部分失败时的状态不一致
- **缓解**：使用数据库事务、提供详细的错误报告

### 8.4 角色恢复数据完整性
- **风险**：恢复角色后会话历史可能不完整
- **缓解**：软删除机制确保数据不丢失、恢复前显示预览

---

## 9. 未来扩展（Phase 4+）

### 9.1 角色模板市场
- 分享和导入社区角色模板
- 模板评分、评论、收藏
- 模板版本历史和更新

### 9.2 角色权限管理
- 限制某些角色的操作权限
- 角色级别的访问控制
- 审计日志

### 9.3 AI 辅助配置
- AI 推荐最佳角色组合
- AI 优化 handoff 流程
- AI 生成角色描述和配置

### 9.4 团队协作增强
- 多人同时编辑团队配置
- 实时同步和冲突解决
- 团队配置版本控制

---

## 10. 验收标准

Phase 3 完成的标准（全部阻塞于后端 command 缺失）：

1. ❌ 用户能通过拖拽调整角色顺序 — 阻塞于 `reorder_task_roles`
2. ❌ 拖拽时有明显的视觉反馈 — 前端已做，但无法端到端验证
3. ❌ 拖拽结束后顺序自动保存 — 阻塞于 `reorder_task_roles`
4. ❌ 用户能查看和配置 handoff 关系 — 待开发
5. ❌ Handoff 配置界面直观易用 — 待开发
6. ❌ 用户能批量添加、删除、更新角色 — 待开发
7. ❌ 批量操作有明确的进度和结果反馈 — 待开发
8. ❌ 用户能查看和恢复已删除角色 — 待开发
9. ❌ 恢复角色后会话历史完整可访问 — 待开发
10. ❌ 所有功能都有完善的错误处理和用户提示 — 阻塞于集成

---

## 11. 工作交接

### 11.1 交给后端开发
- 实现 `reorder_task_roles` 命令
- 实现 `update_role_handoff_config` 命令
- 实现 `batch_add_task_roles` 命令
- 实现 `batch_delete_task_roles` 命令
- 实现 `batch_update_task_roles` 命令
- 实现 `list_deleted_task_roles` 命令
- 实现 `restore_task_role` 命令

### 11.2 交给前端开发
- 集成 @dnd-kit 库实现拖拽排序
- 创建 HandoffConfigModal 组件（使用 reactflow）
- 创建批量操作相关组件
- 创建 DeletedRolesModal 组件
- 更新 TaskModeLayout 集成所有新功能

### 11.3 交��� QA
- 测试拖拽排序的完整流程和边界情况
- 测试 Handoff 配置的可视化和交互
- 测试批量操作的事务性和错误处理
- 测试角色恢复的数据完整性
- 性能测试（大量角色时的表现）

---

## 12. 总结

Phase 3 的核心价值是：

> **提供高级的团队管理功能，让用户能够更灵活、更高效地配置和优化团队结构。**

这将使 MicroCompany 的团队协作功能更加完善和强大。

**预计总工作量**：10-14 天

**建议实施顺序**：
1. 角色拖拽排序（2-3 天）- 最高优先级
2. 角色恢复功能（2-3 天）- 中等优先级
3. Handoff 配置管理（3-4 天）- 中等优先级
4. 批量操作（3-4 天）- 较低优先级

---

**文档维护**：
- 实施过程中如有变更，及时更新本文档
- 实施完成后，补充实际实现细节和遇到的问题

## 13. Phase 3 完成总结 ⚠️

**完成日期**: 2026-05-09  
**状态**: ⚠️ 部分完成 — 后端命令缺失，**无法进行功能测试**

### 已实现的文件清单

**新增文件（2个）：**
- `src/components/SortableRoleCard.tsx` - 可拖拽的角色卡片组件 ✅ 已完成待测试
- 依赖包：`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` ✅ 已安装

**修改文件（3个）：**
- `src/api/index.ts` - 添加 reorderTaskRoles 函数 ✅ 已完成待测试
- `src/components/TaskModeLayout.tsx` - 集成拖拽排序功能 ✅ 已完成待测试
- `src/components/TaskModeLayout.css` - 添加拖拽相关样式 ✅ 已完成待测试

### 已完成的功能

#### 1. 角色拖拽排序 ⚠️ 前端已完成（后端 `reorder_task_roles` 命令缺失）

**功能特点：**
- ✅ 使用 @dnd-kit 库实现拖拽功能
- ✅ 拖拽手柄（⋮⋮ 图标），悬停时显示
- ✅ 拖拽至少移动 8px 才激活，避免误触
- ✅ 拖拽时卡片半透明、有阴影、略微放大
- ✅ 乐观更新 UI，立即响应用户操作
- ✅ 后端保存失败时自动回滚
- ✅ AI 工作时禁用拖拽功能
- ✅ 完整的错误处理和用户提示
- ⚠️ **后端 `reorder_task_roles` 命令未实现，实际调用会失败**

**待测试项：**
- [ ] 拖拽功能是否正常工作
- [ ] 拖拽手柄是否正确显示
- [ ] 拖拽时的视觉反馈是否明显
- [ ] 拖拽结束后顺序是否正确保存
- [ ] 拖拽失败时是否正确回滚
- [ ] AI 工作时是否正确禁用拖拽
- [ ] 大量角色时拖拽是否流畅

**需要后端支持：**
- [ ] `reorder_task_roles` 命令是否已实现
- [ ] 批量更新 display_order 是否支持事务

### 待开发的功能

#### 2. Handoff 配置管理 ⏳ 待开发
- ⏳ 可视化配置角色间的交接关系
- ⏳ 使用 reactflow 绘制交接关系图
- ⏳ 启用/禁用 handoff 功能
- ⏳ 设置默认交接目标

**预计工作量**: 3-4 天

#### 3. 批量操作 ⏳ 待开发
- ⏳ 批量添加角色
- ⏳ 批量删除角色
- ⏳ 批量更新角色配置
- ⏳ 批量操作的事务性和错误处理

**预计工作量**: 3-4 天

#### 4. 角色恢复功能 ⏳ 待开发
- ⏳ 查看已删除角色列表
- ⏳ 恢复已删除角色及其会话历史
- ⏳ 处理名称冲突
- ⏳ 恢复后的数据完整性验证

**预计工作量**: 2-3 天

### 下一步建议

**🔴 阻塞项：必须先完成 Phase 2 的 4 个后端命令**

Phase 3 的拖拽排序依赖 `reorder_task_roles`，而 Phase 2 的添加/编辑/删除角色依赖 `add_task_role`、`update_task_role`、`delete_task_role`。这些后端命令都没有实现，需要优先完成。

**建议优先级：**
1. 🔴 **Phase 2 后端命令** — `add_task_role`、`update_task_role`、`delete_task_role`（2-3 天）
2. 🔴 **Phase 3 后端命令** — `reorder_task_roles`（1 天）
3. 🟡 角色恢复功能（2-3 天）
4. 🟡 Handoff 配置管理（3-4 天）
5. 🟢 批量操作（3-4 天）

**测试建议：**
- ⚠️ 当前由于后端命令缺失，**无法进行功能测试**
- 后端命令完成后，可以在浏览器中测试完整流程

---

**文档维护记录**：
- 2026-05-09: 创建初始版本
- 2026-05-09: 标注角色拖拽排序已完成待测试，添加完成总结
- 2026-05-12: 代码审计 — 确认后端 `reorder_task_roles` 命令缺失，更新状态为 ⚠️ 后端阻塞
