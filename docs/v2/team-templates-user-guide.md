# Team Templates 管理指南

**文档版本**: v1.0  
**创建日期**: 2026-05-03  
**项目**: MicroCompany  
**文档性质**: 用户使用指南

---

## 1. 概述

### 1.1 什么是 Team Templates

Team Templates 是 MicroCompany Task 模式的核心能力，让用户能够：

> **把一组可复用的 task 团队结构沉淀为模板，并在创建 task 时直接从模板开始，而不必每次重新逐个添加角色。**

### 1.2 解决的问题

当前用户在创建多角色 task 时，存在明显的重复劳动：

- 每次都要手动添加角色
- 每次都要重新选择 Archetype
- 每次都要重新配置 provider/model
- 每次都要重新搭建同样的协作团队

这导致两个核心问题：

1. **团队结构无法沉淀** - 今天搭建的有效团队配置，明天还得重来一次
2. **多角色协作经验无法复用** - Team Brief 和 handoff 形成的协作套路无法沉淀成长期资产

Team Templates 的价值在于：

> **把一次有效的任务团队配置，变成之后可反复复用的组织能力。**

### 1.3 设计定位

Team Templates 是第二阶段能力，建立在第一阶段的基础之上：

- **第一阶段基础**：Role Archetype、Prompt Snapshot、Handoff Confirmation
- **第二阶段能力**：Team Templates（复用团队结构）

**启动条件**：
- 第一阶段 archetype 资源系统已完成
- role 创建已支持 archetype 绑定
- prompt snapshot 已稳定生效
- handoff confirmation 已完成基本闭环

---

## 2. 核心概念

### 2.1 Archetype vs Template

系统术语固定如下：

- **Archetype**：单个角色的行为基线，定义职责、边界、交付物和 handoff guidance
- **Template**：一组可复用的团队角色组合
- **Template Role**：模板中的角色定义，包含推荐 archetype 和可选的 provider/model
- **Task Role**：真正创建到 task 中并持有 session 的运行时角色

**固定关系**：

> **Template 复用团队结构，Archetype 定义角色行为。Template 建立在 Archetype 之上，不替代 Archetype。**

### 2.2 模板类型

#### 系统模板

系统模板由 MicroCompany 随应用内置发布。

**特点**：
- 提供常见的软件公司团队结构
- 每个模板 role 给出推荐 archetype
- 默认**不绑定 provider/model**
- 用户可在创建前修改 archetype 和配置模型

**职责**：
- 提供团队结构
- 角色名称建议
- 角色顺序建议
- archetype 推荐
- 可选的说明文案

**系统模板不直接表示可执行 task**，而是作为创建 task 的起点。

#### 用户模板

用户模板由用户自己创建并长期保存。

**特点**：
- 可以从零新建
- 可以从系统模板复制后保存
- 可以从当前 task 配置保存
- 保存角色顺序、角色名称、推荐 archetype、可选的 provider/model
- 下次使用时仍然进入创建前检查流程

### 2.3 运行时约束

#### 模板可以不完整，task 不可以

本系统固定采用以下约束：

- **模板允许 provider/model 为空**
- **真正创建 task 时，每个 role 必须有确定的 provider/model**

原因是当前运行时架构的既定约束：
- 前端 `RoleConfig` 要求 provider/model
- 后端 `RoleConfig` 要求 provider/model
- task 创建流程会立即为每个 role 创建 session
- 数据库 schema 对运行时角色和 session 的 provider/model 采用非空约束

因此，模板只能作为：

> **task draft 的来源，而不是直接运行的 task 实例。**

#### 创建前检查是必经步骤

如果模板中的任意 role 未配置 provider/model，系统必须阻止直接创建 task，并要求用户在创建前补齐。

即使模板中已经配置了 provider/model，系统仍然保留一次创建前确认机会。

---

## 3. 使用指南

### 3.1 从模板创建 Task

这是 Team Templates 的核心使用场景。

#### 操作流程

1. **进入新建 task**
   - 点击 New Task 按钮

2. **选择创建方式**
   - 选择"空白创建"或"从模板创建"

3. **选择模板**（如果选择从模板创建）
   - 浏览系统模板或用户模板列表
   - 查看模板预览（团队结构、角色说明、推荐 archetype）

4. **进入创建前确认界面**
   - 系统将模板复制为 task draft
   - 用户可以统一检查并修改每个 role 的配置

5. **配置检查与修改**
   - 修改 task 名称
   - 修改 role 名称
   - 修改 role 的 archetype
   - 修改 role 的 provider/model
   - 调整角色顺序（如果支持）

6. **补齐必需配置**
   - 所有 role 的 provider/model 必须补齐
   - 系统会阻止不完整配置创建 task

7. **创建 task**
   - 确认后，系统调用现有 `create_task` 流程
   - 按既有逻辑创建 task、roles、sessions

#### 关键点

- **创建前确认是必经步骤**，不是可选项
- **模板是创建来源**，不是运行时绑定对象
- **从模板创建的 task 与模板脱钩**，后续修改模板不影响既有 task

### 3.2 保存 Task 为模板

当用户已经调好一套角色结构时，可以把它保存下来供下次复用。

#### 操作流程

1. **在 task 中完成团队配置**
   - 确保角色结构已经稳定
   - 角色的 archetype 和 provider/model 已配置好

2. **选择"保存为模板"**
   - 在 task 相关 UI 中点击"保存为模板"按钮

3. **填写模板信息**
   - 输入模板名称（必填）
   - 输入模板描述（可选）

4. **保存**
   - 系统读取当前 task 的角色结构
   - 提取模板信息和模板角色信息
   - 保存为用户模板

5. **后续使用**
   - 下次新建 task 时可在用户模板列表中找到
   - 选择后进入创建前确认流程

#### 保存内容

系统会保存以下内容：
- 模板名称和描述
- 角色顺序
- 角色名称
- 推荐 archetype
- 可选的 provider/model

#### 注意事项

- **保存后与原 task 脱钩** - 修改模板不影响原 task，修改原 task 也不自动回写模板
- **会话历史不保存** - 只保存团队结构，不保存对话内容
- **可以重复保存** - 同一个 task 可以多次保存为不同的模板

### 3.3 动态管理团队成员

在 task 运行时，用户可以动态调整团队组成，无需重新创建 task。

#### 3.3.1 添加角色成员

**使用场景**：
- 任务执行中发现需要增加专家角色（如安全审计、性能优化）
- 测试 handoff 流程时发现缺少某个角色
- 临时添加角色进行特定阶段的工作

**操作流程**：
1. 在任务详情页或 Team Brief 界面点击"添加成员"按钮
2. 填写角色配置（与创建任务时相同）：
   - 角色名称
   - 选择 archetype
   - 配置 provider/model
3. 确认后，系统创建角色并自动创建空会话
4. 新角色立即可用于 handoff 推荐

**业务规则**：
- 角色名称在任务内必须唯一
- 新角色的 `display_order` 可以指定，或自动设置为当前最大值 + 1
- 添加后立即出现在 Team Brief 和 handoff 推荐列表中

#### 3.3.2 删除角色成员

**使用场景**：
- 某个角色的工作已完成，希望从团队中移除
- 发现某个角色不需要，想要精简团队
- 调整团队结构以优化协作流程

**操作流程**：
1. 在角色卡片上点击"删除"按钮
2. 系统弹出确认对话框，提示：
   - 该角色的会话历史将被保留但不可访问
   - 如果有其他角色推荐交接给该角色，推荐列表会更新
3. 用户确认后删除
4. 其他角色的 handoff 推荐列表自动更新

**业务规则**：
- **不能删除当前激活的角色** - 必须先切换到其他角色
- **软删除机制** - 删除角色时，该角色的会话历史保留但标记为已删除
- **至少保留一个角色** - 不能删除最后一个角色
- 删除后，其他角色的 handoff 推荐列表会自动更新

**特殊情况处理**：
- 尝试删除当前激活角色 → 提示"请先切换到其他角色"
- 尝试删除最后一个角色 → 提示"任务至少需要一个角色"
- 角色 A 推荐交接给角色 B，但角色 B 被删除 → 返回"目标角色已被删除，请选择其他角色"

#### 3.3.3 更新角色配置

**使用场景**：
- 调整角色顺序以优化协作流程
- 修改角色名称以更准确地反映职责
- 启用或禁用角色的 handoff 功能

**操作流程**：
1. 在角色配置界面选择要更新的角色
2. 修改以下配置：
   - `display_order`（角色顺序）
   - `handoff_enabled`（是否启用 handoff）
   - `name`（角色名称，可选）
3. 确认后，系统更新角色配置

**业务规则**：
- 更新 `display_order` 时，自动调整其他角色的顺序以避免冲突
- 重命名角色时，新名称必须在任务内唯一
- **不能修改角色的 `archetype_id`**（这会改变角色的本质）

**调整角色顺序的方式**：
- 拖拽排序（drag & drop）
- 或在角色配置中手动修改 `display_order`

---

## 4. 数据模型

### 4.1 TaskTemplate（任务模板）

```typescript
interface TaskTemplate {
  id: string;                    // 模板唯一标识
  name: string;                  // 模板名称
  description?: string;          // 模板描述
  icon?: string;                 // 模板图标
  isSystem: boolean;             // 是否为系统模板
  createdAt: string;             // 创建时间
  updatedAt: string;             // 更新时间
  roles: TemplateRole[];         // 模板角色列表
}
```

### 4.2 TemplateRole（模板角色）

```typescript
interface TemplateRole {
  id: string;                           // 角色唯一标识
  name: string;                         // 角色名称
  identity: string;                     // 角色身份描述
  recommendedArchetypeId?: string;      // 推荐的 archetype ID（可选）
  provider?: string;                    // AI provider（可选）
  model?: string;                       // AI model（可选）
  displayOrder: number;                 // 显示顺序
}
```

**字段说明**：
- `recommendedArchetypeId`：推荐的 archetype，用户可在创建前修改
- `provider` 和 `model`：可选，系统模板通常不提供，用户模板可以保存

### 4.3 TaskTemplateDraft（任务模板草稿）

前端创建流程中的临时结构，用来承接"模板复制后、正式创建前"的可编辑状态。

```typescript
interface TaskTemplateDraft {
  templateId?: string | null;    // 来源模板 ID（可选）
  taskName: string;               // 任务名称
  roles: DraftRoleConfig[];       // 草稿角色配置列表
}

interface DraftRoleConfig {
  id: string;                     // 角色 ID
  name: string;                   // 角色名称
  identity: string;               // 角色身份描述
  archetypeId?: string | null;    // archetype ID（可选）
  provider?: string | null;       // AI provider（可选）
  model?: string | null;          // AI model（可选）
  displayOrder: number;           // 显示顺序
}
```

### 4.4 数据边界

固定边界：

- `TaskTemplate` - 模板资产（可复用的团队结构）
- `TaskTemplateDraft` - 创建前临时态（可编辑的草稿）
- `TaskCreateRequest` - 运行时创建输入（完整配置）
- `Task` / `TaskRole` - 最终运行时实体（真正执行的任务）

**不要把这几层混在一起。**

---

## 5. 存储策略

### 5.1 系统模板

系统模板与 archetype 类似，随应用内置发布。

**存储位置**：
```text
src-tauri/resources/task-templates/
  manifest.json
  system/
    software_delivery_team.json
    feature_design_team.json
    bugfix_triage_team.json
```

**管理规则**：
- 系统模板随包发布
- 应用启动时同步到本地用户目录
- 运行时统一从本地目录读取
- **可随版本升级覆盖**

### 5.2 用户模板

用户模板存放在应用数据目录下，由后端统一管理。

**管理规则**：
- 沿用当前 app 数据目录体系
- 由后端提供 CRUD 命令
- **是用户资产，不允许被升级覆盖**
- 第一版不引入远程同步

### 5.3 为什么系统模板与用户模板要分开

因为它们的来源和覆盖规则不同：

- **系统模板**：可随版本升级覆盖
- **用户模板**：是用户资产，不允许被升级覆盖

---

## 6. 系统预置模板

### 6.1 设计原则

系统预置模板采用以下原则：

1. 面向软件公司典型协作场景
2. 每个模板尽量保持角色边界清晰
3. 每个角色都推荐 archetype
4. 默认不提供 provider/model
5. 不依赖用户本地是否已配置 API

### 6.2 第一批系统模板

**建议的系统模板**：

1. **软件开发团队**
   - Product Manager
   - Backend Engineer
   - Frontend Engineer
   - QA Engineer

2. **功能交付小队**
   - Product Manager
   - Full-stack Developer
   - Designer
   - QA Engineer

3. **需求分析与实现团队**
   - Product Manager
   - System Architect
   - Developer

4. **代码修复与验证团队**
   - Developer
   - QA Engineer

---

## 7. 实施路线图

### 7.1 实施顺序

为了避免把范围做炸，建议严格按下面顺序推进：

**Step 1：系统模板只读读取能力**
- 建立模板数据结构
- 实现系统模板 loader
- 提供模板列表查询接口

**Step 2：模板列表与预览**
- 模板列表 UI
- 系统模板/用户模板分组
- 模板详情预览 UI

**Step 3：Template → Task Draft**
- 从模板生成 task draft
- 保留推荐 archetype
- 保留可选 provider/model

**Step 4：创建前确认与缺失配置校验**
- 创建前确认界面
- provider/model 缺失阻断
- 配置补全流程

**Step 5：保存当前 Task 为用户模板**
- 从 task 提取模板信息
- 保存用户模板接口
- 模板管理界面

**Step 6：补完整测试与文档收口**
- 端到端测试
- 边界情况测试
- 用户体验优化

### 7.2 实施阶段划分

**Phase 2A：模板数据模型**
- 建立 `TaskTemplate` 和 `TemplateRole`
- 增加系统模板与用户模板区分
- 允许模板 role 的 provider/model 为空

**Phase 2B：模板选择与 Task Draft**
- TaskBuilder 增加从模板创建入口
- 模板复制为 task draft
- 创建前确认界面接管最终创建

**Phase 2C：用户模板能力**
- 保存当前 task 配置为模板
- 模板管理界面
- 编辑和删除用户模板

**Phase 2D：模板体验增强**
- 增加更多系统模板
- 优化角色推荐展示
- 提升模板预览与复用效率

---

## 8. 产品原则

### 8.1 Template 复用结构，Archetype 定义行为

固定原则：
- Archetype 负责单个角色的行为基线
- Template 负责一组角色如何被复用
- Task Role 负责运行时真正工作
- **Template 不替代 Archetype**

### 8.2 模板可以不完整，Task 不可以

固定原则：
- 模板中的 provider/model 可以为空
- 真正创建 task 之前，每个 role 必须补齐运行时必需字段
- 因此"创建前确认"是必经步骤，不是可选项

### 8.3 不让模板反向污染已创建 Task

模板是创建来源，不是运行时绑定对象。

固定原则：
- 从模板创建出来的 task 与模板脱钩
- 后续修改模板，不影响既有 task
- 后续修改 task，也不自动回写模板，除非用户明确选择"保存为模板"

### 8.4 保持用户控制权

即使未来模板里会有推荐协作路径，也不能把用户从流程里移除。

固定原则：
- 模板可以给默认值
- AI 可以给建议
- 用户始终保留最终确认权

---

## 9. 完成标准

只有当下面这些条件都满足时，才认为 Team Templates MVP 完成：

1. ✅ 用户能从系统模板创建 task
2. ✅ 用户能在创建前统一检查并修改 role 配置
3. ✅ 不完整模型配置不能误创建 task
4. ✅ 用户能把当前 task 保存为模板
5. ✅ 用户能动态添加/删除/更新团队成员
6. ✅ 模板创建出来的 task 仍能正常进入 Team Brief + handoff 的运行时流程
7. ✅ 当前 app 可以继续用真实 task 团队推进模板相关迭代

---

## 10. 与第一阶段的衔接

第二阶段与第一阶段的衔接固定如下：

- **Archetype** 仍由 `src-tauri/resources/archetypes/` 与 `~/.microcompany/archetypes/` 管理
- 模板中的角色通过 `recommendedArchetypeId` 关联 archetype
- Task 创建后仍按第一阶段方式生成 **prompt snapshot**
- **Handoff** 行为仍沿用第一阶段的协议和确认机制
- **Team Brief** 继续展示团队结构和协作关系

第二阶段只解决"如何更快创建正确的团队"，不改变第一阶段已经确定的运行时协作模型。

---

## 11. Team Brief 与 Handoff 的复用

### 11.1 Team Brief 复用为模板预览思路

当前 Team Brief 已经能表达：
- 团队里有谁
- 每个角色负责什么
- 谁可以交给谁

这非常接近模板预览需要表达的内容。

**建议**：
- 模板详情页优先复用 Team Brief 的信息组织方式
- 区别只在于数据来源：
  - Team Brief 来源于 task runtime roster
  - Template Preview 来源于 template roles

### 11.2 Handoff 逻辑复用为模板协作建议雏形

本阶段不做模板自动工作流。

但当前 handoff 逻辑已经可作为未来模板协作建议的基础：
- 模板可以定义推荐角色结构
- Archetype 已定义推荐下游角色
- 运行时仍由 AI + 用户确认完成 handoff

所以本阶段只需保持：
- 模板提供更稳定的 roster
- Roster 让 Team Brief 更清楚
- 更清楚的 roster 让 handoff 建议更可信

---

## 12. 未来扩展

### 12.1 角色模板（快速添加常用角色组合）

**功能**：预定义常用的角色组合，一键添加

**示例**：
- "软件交付团队": PM + Backend + Frontend + QA
- "设计评审团队": Designer + PM + Frontend
- "安全审计团队": Security Engineer + Backend + DevOps

### 12.2 角色权限管理

**功能**：限制某些角色的操作权限

**示例**：
- QA 角色只能查看代码，不能修改
- PM 角色可以添加/删除其他角色
- 普通角色不能修改任务配置

### 12.3 角色恢复

**功能**：恢复已删除的角色及其会话历史

**实现**：
- 在"已删除角色"列表中选择角色
- 点击"恢复"按钮
- 角色重新出现在团队中，会话历史可访问

### 12.4 模板市场（远期）

**功能**：分享和导入社区模板

**包含**：
- 模板分享/导入导出
- 模板版本历史
- 模板标签、搜索、收藏
- 模板协作编辑

---

## 13. 总结

Team Templates 是 MicroCompany 的核心能力，让用户能够：

1. **复用团队结构** - 不必每次重新添加角色
2. **沉淀协作经验** - 把有效的团队配置变成长期资产
3. **灵活调整团队** - 动态添加/删除/更新角色成员
4. **保持用户控制** - 创建前确认，用户始终保留最终决策权

**核心价值**：

> **把一次有效的任务团队配置，变成之后可反复复用的组织能力。**

---

**文档维护**：
- 实施过程中如有变更，及时更新本文档
- 实施完成后，补充实际实现细节和遇到的问题
