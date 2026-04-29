# Team Templates 下一阶段实施计划

**文档版本**: v1.0  
**创建日期**: 2026-04-29  
**项目**: MicroCompany  
**文档性质**: 下一阶段实施计划 / 当前主开发任务

---

## 1. 文档定位

本文档定义 MicroCompany 接下来要开发的核心能力：

> **Team Templates：让用户把一组可复用的 task 团队结构沉淀为模板，并在创建 task 时直接从模板开始。**

这不是纯概念文档，也不是泛泛 roadmap。

它是接下来开发工作的主执行文档，满足两个目的：

1. 指导我们实际实现 Team Templates
2. 让当前 app 里的多角色 task 团队围绕这个文档本身继续协作推进开发

换句话说，接下来我们的软件本身要被用来开发这份计划对应的功能。当前 task room、Team Brief、PM-first、handoff confirmation，不只是被验收，而是要开始承担真实开发流程。

---

## 2. 当前阶段结论

在进入 Team Templates 正式开发之前，我们已经有了一个可用的第一阶段底座：

- Role Archetype 已建立
- role 创建已支持 archetype 绑定
- prompt snapshot 已接入
- Team Brief 已能在 task room 中展示
- AI handoff suggestion 已能在运行时解析
- 用户确认 handoff 已接入现有 forward 流程
- task room 已能表达“这是一支团队，而不是多个散会话”

因此，下一阶段不再重复讨论这些基础能力是否值得做，而是直接回答下面的问题：

> **如何把当前“运行中的 task 团队”抽象成“可复用的 Team Template”，并且保持实现简单、边界清晰、运行安全。**

---

## 3. 下一阶段的核心目标

Team Templates 下一阶段只做 4 件事。

### 3.1 让用户可以从模板创建 task

用户在新建 task 时，应能：
- 选择空白创建
- 选择系统模板
- 选择用户模板
- 复制模板为 task draft
- 在真正创建前统一确认每个 role 配置

### 3.2 让用户可以保存当前 task 配置为模板

当用户已经调好一套角色结构时，应能把它保存下来，供下次复用。

### 3.3 让模板只表达“团队结构”，不直接变成运行时实例

模板不是 task 本身。

模板表达的是：
- 角色集合
- 角色顺序
- 推荐 archetype
- 可选 provider/model 默认值
- 模板说明

真正运行的 task 仍然在创建时生成 role 和 session。

### 3.4 保持 MVP 级别实现，不提前做模板工作流编排系统

本阶段不把 Team Templates 做成一个复杂平台。

重点是：
- 复用团队结构
- 降低重复配置成本
- 延续 Team Brief 与 handoff 的协作价值

---

## 4. 本阶段要解决的真实产品问题

当前用户在创建多角色 task 时，仍然有明显重复劳动：

- 每次都要手动加角色
- 每次都要重新选 archetype
- 每次都要重新配 provider/model
- 每次都要重新搭同样的协作团队

这会带来两个问题：

### 4.1 团队结构无法沉淀

用户今天搭了一套好用的 PM + Frontend + Backend + QA 团队，明天还得重来一次。

### 4.2 多角色协作经验无法复用

当前 Team Brief 和 handoff 已经开始形成“协作套路”，但如果没有模板，这种套路无法沉淀成长期资产。

所以 Team Templates 的产品价值不是“多一个保存按钮”，而是：

> **把一次有效的任务团队配置，变成之后可反复复用的组织能力。**

---

## 5. 本阶段范围

## 5.1 纳入范围

本阶段纳入以下能力：

1. Task Template 数据模型
2. 系统模板读取能力
3. 用户模板保存与读取能力
4. 从模板生成 task draft
5. 创建前统一确认 role 配置
6. 从确认后的 draft 调用既有 `create_task` 流程
7. 从当前 task 保存为模板
8. 基于模板信息在 UI 中展示可理解的模板预览

## 5.2 明确不做

本阶段明确不做以下内容：

- 模板市场
- 模板分享 / 导入导出
- 模板版本历史
- 模板权限系统
- 模板协作编辑
- 模板标签、搜索、收藏的大型管理系统
- 自动 workflow orchestration
- 基于模板自动强制 handoff 路径
- template analytics
- 图形化流程编辑器

---

## 6. 产品原则

## 6.1 Template 复用结构，Archetype 定义行为

固定原则：

- Archetype 负责单个角色的行为基线
- Template 负责一组角色如何被复用
- Task Role 负责运行时真正工作

Template 不替代 Archetype。

## 6.2 模板可以不完整，task 不可以

固定原则：

- 模板中的 provider/model 可以为空
- 真正创建 task 之前，每个 role 必须补齐运行时必需字段
- 因此“创建前确认”是必经步骤，不是可选项

## 6.3 不让模板反向污染已创建 task

模板是创建来源，不是运行时绑定对象。

固定原则：
- 从模板创建出来的 task 与模板脱钩
- 后续修改模板，不影响既有 task
- 后续修改 task，也不自动回写模板，除非用户明确选择“保存为模板”

## 6.4 保持用户控制权

即使未来模板里会有推荐协作路径，也不能把用户从流程里移除。

固定原则：
- 模板可以给默认值
- AI 可以给建议
- 用户始终保留最终确认权

---

## 7. 目标用户流程

## 7.1 从模板创建 task

目标流程：

1. 用户点击 New Task
2. 选择“空白创建”或“从模板创建”
3. 如果选择模板，先看到模板列表
4. 用户选择一个模板
5. 系统展示模板预览
6. 用户确认后进入 task draft 编辑界面
7. 用户统一检查并修改每个 role 的：
   - role name
   - archetype
   - provider/model
8. 所有必需字段补齐后，才允许创建 task
9. 系统复用现有 `create_task` 创建真实 task / roles / sessions

## 7.2 保存当前 task 为模板

目标流程：

1. 用户在一个 task 中完成团队配置
2. 点击“保存为模板”
3. 系统读取当前 task 角色结构
4. 生成模板草稿
5. 用户填写模板名称与说明
6. 保存为用户模板

---

## 8. MVP 数据模型

## 8.1 TaskTemplate

```ts
interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  roles: TemplateRole[];
}
```

## 8.2 TemplateRole

```ts
interface TemplateRole {
  id: string;
  name: string;
  identity: string;
  recommendedArchetypeId?: string | null;
  provider?: string | null;
  model?: string | null;
  displayOrder: number;
}
```

## 8.3 TaskTemplateDraft

前端创建流程中需要一个临时 draft 结构，用来承接“模板复制后、正式创建前”的可编辑状态。

```ts
interface TaskTemplateDraft {
  templateId?: string | null;
  taskName: string;
  roles: DraftRoleConfig[];
}

interface DraftRoleConfig {
  id: string;
  name: string;
  identity: string;
  archetypeId?: string | null;
  provider?: string | null;
  model?: string | null;
  displayOrder: number;
}
```

## 8.4 数据边界

固定边界：

- `TaskTemplate` 是模板资产
- `TaskTemplateDraft` 是创建前临时态
- `TaskCreateRequest` 是运行时创建输入
- `Task` / `TaskRole` 是最终运行时实体

不要把这几层混在一起。

---

## 9. 存储策略

## 9.1 系统模板

系统模板与 archetype 类似，随应用内置发布。

建议目录：

```text
src-tauri/resources/task-templates/
  manifest.json
  system/
    software_delivery_team.json
    feature_design_team.json
    bugfix_triage_team.json
```

固定规则：
- 系统模板随包发布
- 应用启动时同步到本地用户目录
- 运行时统一从本地目录读取

## 9.2 用户模板

用户模板建议存放在应用数据目录下，由后端统一管理。

建议方向：
- 沿用当前 app 数据目录体系
- 由后端提供 CRUD 命令
- 不在第一版引入远程同步

## 9.3 为什么系统模板与用户模板要分开

因为它们的来源和覆盖规则不同：

- 系统模板：可随版本升级覆盖
- 用户模板：是用户资产，不允许被升级覆盖

---

## 10. 后端实施计划

## 10.1 Phase 1：定义模板数据结构与读取能力

目标：先让模板“存在且能被读取”。

需要完成：
- Rust 中新增 `TaskTemplate` / `TemplateRole` 相关类型
- 新增系统模板 loader
- 新增用户模板 loader / repository
- 新增统一模板列表查询接口
- 新增按 id 获取模板详情接口

建议文件方向：
- `src-tauri/src/api/task_template.rs`
- `src-tauri/src/api/task_template_queries.rs`
- `src-tauri/src/commands/task_template.rs`
- `src-tauri/src/task_templates/loader.rs`
- `src-tauri/src/task_templates/sync.rs`

验证标准：
- 能返回系统模板列表
- 能返回单个模板详情
- 模板 role 顺序稳定

## 10.2 Phase 2：支持从模板生成 task draft

目标：让模板能变成“创建前可编辑配置”。

需要完成：
- 新增“template -> draft”转换逻辑
- 保留推荐 archetype
- 保留可选 provider/model
- 不在这一步创建 session
- 返回前端可直接编辑的 draft 数据

固定原则：
- 复制，不共享引用
- template 不等于 task
- task draft 仍可被用户改写

验证标准：
- 从模板生成的 draft 可编辑
- draft 中 role 顺序与模板一致
- provider/model 缺失时不会直接创建 task

## 10.3 Phase 3：支持保存当前 task 为模板

目标：让“运行时团队配置”能沉淀为用户模板。

需要完成：
- 从 `Task` / `TaskRole` 提取模板信息
- 去掉运行时 session 绑定信息
- 保留结构性字段：名称、identity、archetype、provider/model、displayOrder
- 新增保存用户模板接口

验证标准：
- 可以从真实 task 保存模板
- 再次读取时角色结构一致

## 10.4 Phase 4：增加模板验证

目标：确保模板数据合法，避免脏模板影响创建流程。

验证规则建议包括：
- 模板名称不能为空
- 模板至少包含 1 个角色
- `displayOrder` 必须稳定可排序
- 若 archetype 不存在，应降级提示而不是直接 panic
- provider/model 可以为空

---

## 11. 前端实施计划

## 11.1 Phase 1：Task Builder 增加创建入口分流

目标：用户能明显区分：
- 空白创建
- 从模板创建

需要完成：
- 在 Task Builder 中增加入口选择
- 保持当前空白创建路径不被破坏
- 新入口只是在已有流程前面多一步

验证标准：
- 不选模板也能按旧流程创建
- 选择模板时能进入模板列表

## 11.2 Phase 2：模板列表与模板预览

目标：让用户在选择前就知道模板是什么。

需要完成：
- 模板列表 UI
- 系统模板 / 用户模板分组
- 模板详情预览 UI
- 在预览中展示：
  - 模板名
  - 模板说明
  - role 列表
  - 推荐 archetype
  - 角色顺序

关键产品判断：
- 当前 Team Brief 的展示经验，应优先复用到模板预览中
- 不要重新造一套完全不同的理解模型

验证标准：
- 用户能在不创建 task 的情况下理解模板

## 11.3 Phase 3：创建前确认界面

目标：模板复制后，用户可以统一检查并修改 role 配置。

需要完成：
- 从模板生成 task draft 后进入确认界面
- 允许编辑：
  - task name
  - role name
  - archetype
  - provider/model
- 对未补齐 provider/model 的 role 给出阻断提示
- 全部补齐后才能提交创建

验证标准：
- 确认界面可用
- 不完整配置不能误创建 task
- 完整配置可顺利进入既有 task 流程

## 11.4 Phase 4：保存为模板入口

目标：让已有 task 团队可以被复用。

需要完成：
- 在 task 相关 UI 中增加“保存为模板”入口
- 弹出最小表单：模板名、说明
- 调用后端保存接口

验证标准：
- 保存后可在模板列表看到新模板
- 再次选择时内容正确

---

## 12. 当前 Team Brief / Handoff 能力如何复用到 Team Templates

这是下一阶段最关键的设计连接点。

## 12.1 Team Brief 复用为模板预览思路

当前 Team Brief 已经能表达：
- 团队里有谁
- 每个角色负责什么
- 谁可以交给谁

这非常接近模板预览需要表达的内容。

因此建议：
- 模板详情页优先复用 Team Brief 的信息组织方式
- 区别只在于数据来源：
  - Team Brief 来源于 task runtime roster
  - Template Preview 来源于 template roles

## 12.2 Handoff 逻辑复用为模板协作建议雏形

本阶段不做模板自动工作流。

但当前 handoff 逻辑已经可作为未来模板协作建议的基础：
- 模板可以定义推荐角色结构
- archetype 已定义推荐下游角色
- 运行时仍由 AI + 用户确认完成 handoff

所以本阶段只需保持：
- 模板提供更稳定的 roster
- roster 让 Team Brief 更清楚
- 更清楚的 roster 让 handoff 建议更可信

---

## 13. 真实开发任务驱动方式

因为你已经明确：

> 接下来软件本身要用来开发这份文档对应的工作

所以建议把下个开发周期按真实 task 团队方式推进。

## 13.1 建议主 task

任务名建议：

**Implement Team Templates MVP using reusable task teams**

## 13.2 建议团队

至少包含：
- Product Manager
- Frontend Engineer
- Backend Engineer
- QA Reviewer

## 13.3 推荐推进节奏

### 第一轮：PM
目标：从本文档里收敛最小开发范围

### 第二轮：Backend
目标：先把模板数据结构、存储边界、查询接口收敛清楚

### 第三轮：Frontend
目标：把模板选择、模板预览、创建前确认串成最小交互流程

### 第四轮：QA
目标：输出基于真实模板创建流程的主验收路径

也就是说，这份文档不只供人看，还应该成为 app 内 task 团队的真实输入。

---

## 14. 推荐实施顺序

为了避免把范围做炸，建议严格按下面顺序推进。

### Step 1
先做系统模板只读读取能力

### Step 2
再做模板列表与预览

### Step 3
再做 template -> task draft

### Step 4
再做创建前确认与缺失配置校验

### Step 5
再做保存当前 task 为用户模板

### Step 6
最后再补完整测试与文档收口

这样做的好处是：
- 每一步都有独立可验证成果
- 不需要一开始就改太多 UI 和数据流
- 一旦某步发现过重，可以及时收缩

---

## 15. 验证计划

## 15.1 后端验证

- 系统模板可以列出
- 模板详情可以读取
- template -> draft 转换正确
- task -> user template 转换正确
- 缺失 archetype / provider/model 时按预期处理

## 15.2 前端验证

- Task Builder 中能切换空白创建 / 模板创建
- 模板列表与预览可用
- 创建前确认流程顺畅
- 缺失 provider/model 时不能误创建
- 保存模板后可再次选择

## 15.3 多角色运行时验证

- 从模板创建出来的 task 能正常生成 Team Brief
- PM-first 任务仍然正常
- handoff recommendation 仍只在真实 roster 内进行
- 模板不会破坏既有 task room 流程

---

## 16. 风险与控制点

## 16.1 最大风险：把模板和运行时 task 混成一个对象

控制策略：
- 明确区分 template、draft、task
- 不让模板直接创建 session

## 16.2 最大风险：前端交互过重

控制策略：
- 先做最小模板列表 + 预览 + 确认
- 不在第一版做复杂编辑器

## 16.3 最大风险：用户模板破坏系统升级逻辑

控制策略：
- 系统模板与用户模板存储分离
- 升级只覆盖系统模板

## 16.4 最大风险：模板一上来就试图定义 workflow engine

控制策略：
- 本阶段只复用 roster 与 archetype 推荐关系
- handoff 仍保持“AI 建议 + 用户确认”

---

## 17. 完成标准

只有当下面这些条件都满足时，才认为 Team Templates 下一阶段 MVP 完成：

1. 用户能从系统模板创建 task
2. 用户能在创建前统一检查并修改 role 配置
3. 不完整模型配置不能误创建 task
4. 用户能把当前 task 保存为模板
5. 模板创建出来的 task 仍能正常进入 Team Brief + handoff 的运行时流程
6. 当前 app 可以继续用真实 task 团队推进模板相关迭代

---

## 18. 一句话执行结论

接下来不再把 Team Templates 当成遥远的二期概念，而是直接把它变成当前软件的主开发任务：

> **先把模板当作“可复用的团队结构”，用最小数据模型、最小 UI 流程、最小运行时改动接入现有 task 创建链路；再通过真实的多角色 task 团队，在 app 内继续推进这项功能本身。**
