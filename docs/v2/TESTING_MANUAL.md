# 测试手册 - Team Templates 功能

**测试日期**: 2026-05-09  
**测试范围**: Phase 1-3 核心功能  
**预计时间**: 15-20 分钟

---

## 准备工作

1. 启动开发服务器：`npm run dev`
2. 打开浏览器：`http://localhost:1420`
3. 打开浏览器控制台（F12）查看日志

---

## Phase 1: 模板系统 ✅ 已测试

### 测试 1.1: 从模板创建 Task

**操作步骤**:
1. 点击"新建 Task"按钮
2. 应该直接显示模板选择界面（不是选择对话框）
3. 点击任意系统模板卡片（如 "Full-Stack Development"）
4. 卡片应该显示蓝色边框（选中状态）
5. 点击底部"Continue with Template"按钮
6. 进入草稿编辑器，显示模板的角色列表

**预期效果**:
- ✅ 模板卡片网格布局，第一个是"Blank Task"
- ✅ 点击卡片显示选中状态
- ✅ 草稿编辑器显示所有角色配置
- ✅ 控制台显示日志：`[templates] listAllTemplateSummaries`

### 测试 1.2: 查看模板详情

**操作步骤**:
1. 在模板选择界面，点击任意模板的"ℹ️ Details"按钮
2. 弹出模态框显示模板详细信息

**预期效果**:
- ✅ 显示模板名称、描述、所有角色配置
- ✅ 控制台显示日志：`[templates] getSystemTemplate`

### 测试 1.3: 空白创建 Task

**操作步骤**:
1. 点击"新建 Task"
2. 点击"Blank Task"卡片（第一个，带 ➕ 号）
3. 点击"Create Blank Task"按钮

**预期效果**:
- ✅ 进入空白 Task 创建流程
- ✅ 不显示草稿编辑器

### 测试 1.4: 保存为模板

**操作步骤**:
1. 创建或打开一个 Task
2. 点击右上角"💾 保存为模板"按钮
3. 输入模板名称和描述
4. 点击"Save Template"

**预期效果**:
- ✅ 显示成功提示
- ✅ 控制台显示日志：`[TaskModeLayout] handleSaveAsTemplate`
- ✅ 下次创建 Task 时，在"User Templates"分组中看到新模板

---

## Phase 2: 动态角色管理 🔄 待测试

### 测试 2.1: 添加角色

**操作步骤**:
1. 打开一个 Task
2. 点击"➕ 添加成员"按钮
3. 填写表单：
   - 角色名称：`Alice`
   - 角色身份：`Frontend Developer`
   - Archetype：选择 `assistant`
   - Provider：选择第一个可用的
   - Model：选择默认的
4. 点击"Add Role"

**预期效果**:
- ✅ 显示成功提示
- ✅ 角色列表中出现新角色"Alice"
- ✅ 控制台显示日志：`[TaskModeLayout] handleAddRole: Adding role "Alice"`
- ✅ 控制台显示日志：`[api] addTaskRole: Adding role to task`

**失败情况**:
- ❌ 如果后端未实现 `add_task_role` 命令，会显示错误
- ❌ 检查控制台是否有 `Command add_task_role not found` 错误

### 测试 2.2: 编辑角色

**操作步骤**:
1. 在角色卡片上点击"✏️"按钮
2. 修改角色名称为 `Alice Updated`
3. 修改角色身份为 `Senior Frontend Developer`
4. 点击"Save Changes"

**预期效果**:
- ✅ 显示成功提示
- ✅ 角色卡片显示更新后的信息
- ✅ 控制台显示日志：`[TaskModeLayout] handleUpdateRole: Updating role`
- ✅ 控制台显示日志：`[api] updateTaskRole: Updating role`

### 测试 2.3: 删除角色

**操作步骤**:
1. 在角色卡片上点击"🗑️"按钮
2. 在确认对话框中点击"Delete Role"

**预期效果**:
- ✅ 显示成功提示
- ✅ 角色从列表中消失
- ✅ 控制台显示日志：`[TaskModeLayout] handleDeleteRole: Deleting role`
- ✅ 控制台显示日志：`[api] deleteTaskRole: Deleting role`

**边界测试**:
- 尝试删除最后一个角色，应该被阻止（按钮禁用）

---

## Phase 3: 拖拽排序 🔄 待测试

### 测试 3.1: 拖拽角色排序

**操作步骤**:
1. 打开一个有 3+ 角色的 Task
2. 鼠标悬停在角色卡片上，应该看到"⋮⋮"拖拽手柄
3. 按住拖拽手柄，拖动角色到新位置
4. 松开鼠标

**预期效果**:
- ✅ 拖拽时卡片半透明、有阴影
- ✅ 松开后角色顺序立即更新（乐观更新）
- ✅ 控制台显示日志：`[TaskModeLayout] handleDragEnd: Drag ended`
- ✅ 控制台显示日志：`[TaskModeLayout] handleDragEnd: Reordering roles`
- ✅ 控制台显示日志：`[api] reorderTaskRoles: Reordering roles`

**失败情况**:
- ❌ 如果后端保存失败，角色顺序会回滚
- ❌ 控制台显示日志：`[TaskModeLayout] handleDragEnd: Failed to save order, rolling back`

---

## 关键日志检查点

在测试过程中，控制台应该显示以下关键日志：

### Phase 1 日志
```
[templates] listAllTemplateSummaries: Fetching all templates
[templates] getSystemTemplate: Finding template "xxx"
[TaskModeLayout] handleSaveAsTemplate: Saving task as template
```

### Phase 2 日志
```
[TaskModeLayout] handleAddRole: Adding role "Alice" to task xxx
[api] addTaskRole: Adding role to task xxx with config: {...}
[TaskModeLayout] handleUpdateRole: Updating role "Alice" in task xxx
[api] updateTaskRole: Updating role "Alice" in task xxx
[TaskModeLayout] handleDeleteRole: Deleting role "Alice" from task xxx
[api] deleteTaskRole: Deleting role "Alice" from task xxx
```

### Phase 3 日志
```
[TaskModeLayout] handleDragEnd: Drag ended, from index X to Y
[TaskModeLayout] handleDragEnd: Reordering roles: [...]
[api] reorderTaskRoles: Reordering roles in task xxx
[TaskModeLayout] handleDragEnd: Roles reordered successfully
```

---

## 后端依赖检查

如果测试失败，检查后端是否实现了以下命令：

```bash
# 搜索后端命令
grep -r "add_task_role" src-tauri/
grep -r "update_task_role" src-tauri/
grep -r "delete_task_role" src-tauri/
grep -r "reorder_task_roles" src-tauri/
```

**如果命令不存在**:
- Phase 2 和 Phase 3 功能无法正常工作
- 需要等待后端实现相应的命令

---

## 测试结果记录

| 功能 | 状态 | 备注 |
|------|------|------|
| 1.1 从模板创建 | ⬜ 未测试 | |
| 1.2 查看模板详情 | ⬜ 未测试 | |
| 1.3 空白创建 | ⬜ 未测试 | |
| 1.4 保存为模板 | ⬜ 未测试 | |
| 2.1 添加角色 | ⬜ 未测试 | |
| 2.2 编辑角色 | ⬜ 未测试 | |
| 2.3 删除角色 | ⬜ 未测试 | |
| 3.1 拖拽排序 | ⬜ 未测试 | |

**状态说明**:
- ✅ 通��
- ❌ 失败
- ⚠️ 部分通过
- ⬜ 未测试

---

## 常见问题

### Q1: 点击"新建 Task"没有反应
- 检查控制台是否有 JavaScript 错误
- 检查开发服务器是否正常运行

### Q2: 模板列表为空
- 检查后端是否返回了模板数据
- 查看控制台日志：`[templates] listAllTemplateSummaries`

### Q3: Phase 2/3 功能报错
- 检查后端是否实现了相应的命令
- 查看控制台错误信息

### Q4: 拖拽不工作
- 检查是否安装了 `@dnd-kit` 依赖
- 检查控制台是否有错误

---

**测试完成后，请更新文档中的测试状态！**
