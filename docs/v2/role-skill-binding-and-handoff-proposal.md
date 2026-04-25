# Task 角色技能绑定与交接确认机制方案

**文档版本**: v1.0  
**创建日期**: 2026-04-25  
**项目**: MicroCompany

---

## 1. 背景与目标

当前 MicroCompany 的 Task 模式已经具备以下基础能力：

- 一个 Task 包含多个 Role
- 每个 Role 创建独立 session
- Role 之间可以通过“转发最新回复”完成串行交接
- 前端已经开始向“单 AI 串行接力控制台”演进

但当前系统仍然缺少三个关键层：

1. **角色能力层**：Role 只有 `name / identity / model / provider`，没有真正绑定“职责模板”
2. **流程意识层**：Role session 创建时没有注入明确的团队协作规则与角色职责
3. **交接触发层**：AI 无法结构化地表达“我建议交给下一位角色处理”

用户提出的新方向是：

- 在创建 task role 时，不只是选一个“身份”
- 而是选择一个更强的 **角色类型 / 技能模板**
- 这个模板可以自动绑定一套文档、提示词、工作方式、交付物要求
- 当 AI 判断当前阶段应交接时，触发系统弹出确认界面
- 用户确认后，把 AI 的交接内容转发给下一个角色

该方向与当前产品演进方向高度一致。

---

## 2. 对 `agency-agents` 的研究结论

我已结合 `https://github.com/msitarzewski/agency-agents` 的内容进行分析。该仓库本质上不是一个运行时 SDK，而是一个 **agent profile / capability library**。

其核心特征：

- 每个 agent 是一个独立 Markdown 文件
- 文件头部带有结构化 frontmatter，例如：
  - `name`
  - `description`
  - `color`
  - `emoji`
  - `vibe`
  - 个别文件还包含 `tools`
- 正文包含完整 agent 定义：
  - Identity / Memory
  - Core Mission
  - Critical Rules
  - Workflow Process
  - Deliverable Template
  - Communication Style
  - Success Metrics

### 2.1 它适合拿来做什么

`agency-agents` 最适合用作：

1. **角色模板来源**
2. **系统提示词素材库**
3. **角色职责与交付标准的预设知识库**
4. **Task role archetype 的参考标准**

### 2.2 它不适合直接拿来做什么

它不适合直接被当成：

1. 运行时“技能插件系统”
2. 真正可执行的 tool registry
3. 自动接入当前后端的 session logic
4. 前端直接绑定到某个 `.md` 文件路径并在运行中原样注入

原因很简单：

- 这些 Markdown 内容偏长
- 风格化很强
- 存在示例代码、流程模板、成功指标等大量非必要文本
- 若原样拼进 system prompt，会导致上下文膨胀
- 不同 agent 的风格一致性不完全可控
- 该仓库没有为你的当前 Task 流程提供稳定的结构化协议

### 2.3 关键判断

**结论不是“能不能绑定 agency-agents”，而是“应该以什么粒度绑定”。**

我的专业建议是：

> 不要在创建 role 时直接绑定一个外部 Markdown 文件本身；而应该在系统内部建立一层 **Role Archetype Registry（角色原型注册表）**，把 `agency-agents` 当作“模板来源”和“提示词素材库”，从中提炼出适合你产品的结构化角色定义。

也就是说：

- `agency-agents` 是上游灵感与模板仓库
- MicroCompany 内部要有自己的可控映射层
- 用户在 UI 中选择的是“角色类型”
- 系统真正绑定的是“内部标准化模板”

这比直接引用第三方 Markdown 文件稳得多。

---

## 3. 结合当前工程后的现实判断

### 3.1 当前前端角色创建能力

目前 `AddRoleModal.tsx` 中可配置字段只有：

- `roleName`
- `roleIdentity`
- `provider`
- `model`

当前 identity 下拉值也只是静态枚举：

- Product Manager
- Developer
- Reviewer
- Tester

这说明当前 UI 的“角色身份”仍然只是展示层标签，不是可执行角色模板。

### 3.2 当前数据结构限制

当前 `RoleConfig` 仅包含：

```ts
interface RoleConfig {
  name: string;
  identity: string;
  model: string;
  provider: string;
}
```

这意味着系统当前还不能表达：

- 绑定了哪个角色原型
- 该角色的系统提示词是什么
- 该角色的职责边界是什么
- 是否允许提出交接建议
- 推荐的下游角色有哪些
- 关联了哪份文档或技能模板

### 3.3 当前后端 session 创建限制

`src-tauri/src/api/task_impl.rs` 里的 `create_task()` 会为每个 Role 创建 session，但当前调用 `ClaurstSession::new(...)` 时只传入：

- `session_id`
- `working_dir`
- `api_key`
- `model`
- `base_url`

并没有传入：

- role-specific system prompt
- task-specific team prompt
- session bootstrap message
- role archetype metadata

这意味着：

> **当前代码层面还没有“在创建 role session 时注入专属系统提示词”的能力。**

所以从实现顺序上看，必须先补“角色模板 + prompt 注入层”，再做 handoff 提案层。

---

## 4. 是否应该在创建 Role 时自动绑定 agency-agents 文档或技能

### 4.1 可以做，但不能直接生硬绑定原始文件

如果问题是：

> 创建 role 时，是否可以在选择角色类型后，自动绑定一个 `agency-agents` 中的文档或技能？

答案是：

> **可以，但应该绑定“内部归一化后的角色模板”，而不是直接绑定原始 Markdown 文件。**

### 4.2 推荐的绑定模型

建议把“角色类型”拆成两层：

#### 第一层：用户可见角色类型
例如：

- 产品经理
- 项目协调者
- 前端工程师
- 后端架构师
- 代码评审
- 测试负责人
- 技术文档工程师

#### 第二层：内部 archetype 绑定
例如：

| UI 角色类型 | 内部 archetype id | agency-agents 来源 |
|---|---|---|
| 产品经理 | `product_manager` | `product/product-manager.md` |
| 项目协调者 | `project_shepherd` | `project-management/project-management-project-shepherd.md` |
| 前端工程师 | `frontend_developer` | `engineering/engineering-frontend-developer.md` |
| 架构师 | `software_architect` | `engineering/engineering-software-architect.md` |
| 评审员 | `code_reviewer` | `engineering/engineering-code-reviewer.md` |
| 测试负责人 | `qa_lead` | 可先用内部模板，后续再映射 testing 类模板 |
| 技术文档 | `technical_writer` | `engineering/engineering-technical-writer.md` |

用户在 UI 中选的是角色类型，系统内部记录的是 archetype id。

### 4.3 为什么这比“直接绑定文档”更好

因为 archetype 可以承载更稳定的结构：

```ts
interface RoleArchetype {
  id: string;
  label: string;
  description: string;
  source?: {
    repository: 'agency-agents';
    path: string;
    version?: string;
  };
  promptTemplate: {
    system: string;
    handoffRules: string;
    deliverableExpectations: string;
  };
  recommendedModels?: string[];
  allowedNextRoles?: string[];
  defaultOutputMode?: 'analysis' | 'execution' | 'review' | 'handoff';
}
```

这样你绑定的不是“文件”，而是“产品可控的能力定义”。

---

## 5. 我对角色模板系统的核心建议

### 5.1 不要做“外部文件直连”

不建议的方案：

- 在创建 role 时存一条 `skill_doc_path = /tmp/agency-agents/...`
- 运行时直接把整个文档塞进 prompt
- UI 上把 role identity 直接等价成某个外部 agent 文件

这个方案的问题：

1. 对外部仓库结构耦合过高
2. 文档一变，行为不可控
3. prompt 长度和质量不可控
4. 无法针对 MicroCompany 的交接流程定制
5. 很难做版本管理和回溯

### 5.2 应该做“导入-归一化-版本化”

推荐方案：

1. 从 `agency-agents` 选出适合的 agent 文件
2. 手工或半自动提炼成内部 archetype
3. 只保留真正对当前产品有价值的部分：
   - 角色定义
   - 关键职责
   - 工作边界
   - 交付物要求
   - 沟通风格
4. 再额外加入你自己的系统规则：
   - 团队协作上下文
   - handoff 触发格式
   - 不允许私自切换角色
   - 交接必须等待用户确认
5. 把这份归一化结果存入你自己的配置或数据库

这是一个 **知识蒸馏** 过程，不是简单复制。

---

## 6. 目标产品形态：Role Archetype + Team Prompt + Handoff Proposal

建议把未来系统拆成三个层次。

### 6.1 层一：Role Archetype
这是角色本身是什么。

例如：

- Frontend Developer
- Product Manager
- Project Shepherd
- Code Reviewer

这一层定义：

- 能力边界
- 输出风格
- 典型交付物
- 推荐接力对象

### 6.2 层二：Task Team Prompt
这是该角色当前在哪个团队里工作。

例如：

- 当前任务名称
- 当前团队由哪些角色组成
- 你在流程中的位置
- 你不负责什么
- 完成当前职责后如何提出交接建议

这一层是“任务上下文”，不是角色模板本身。

### 6.3 层三：Handoff Protocol
这是 AI 如何触发系统行为。

第一阶段建议用文本协议，例如：

```text
[HANDOFF]
target_role: Code Reviewer
reason: 核心实现建议已完成，下一步需要审查风险与变更边界
summary: 已完成界面交互方案与状态流设计
next_action: 请审查状态同步、禁用态和错误恢复逻辑
[/HANDOFF]
```

第二阶段可升级为结构化 tool call 或专用事件。

---

## 7. 推荐的实现顺序

### Phase 1：角色原型注册表（必须先做）

#### 目标
让“Role Identity”从静态字符串升级为“可绑定模板的 archetype”。

#### 需要做的事

1. 新建内部 archetype registry
2. 先挑少量高价值 archetype
3. 建立 role identity 到 archetype 的映射
4. 在创建 role 时保存 `archetype_id`

#### 第一批建议引入的 archetype

- `product_manager`
- `project_shepherd`
- `frontend_developer`
- `software_architect`
- `code_reviewer`
- `technical_writer`

#### 原因
这几个 archetype 与你当前 Task 模式高度契合，而且职责边界相对清晰。

---

### Phase 2：session 创建时注入 prompt

#### 目标
每个 role session 在创建时都具备：

- 团队协作意识
- 当前角色职责意识
- handoff 规则意识

#### 需要新增的数据
建议扩展前后端 `RoleConfig`：

```ts
interface RoleConfig {
  name: string;
  identity: string;
  model: string;
  provider: string;
  archetypeId?: string;
  systemPromptOverride?: string;
}
```

后端 Rust 同步扩展：

```rust
pub struct RoleConfig {
    pub name: String,
    pub identity: String,
    pub model: String,
    pub provider: String,
    pub archetype_id: Option<String>,
    pub system_prompt_override: Option<String>,
}
```

#### session 初始化时应合成 prompt
建议由系统拼接三段：

1. **平台级规则**
   - 你是团队中的一个成员
   - 不能擅自切换角色
   - 只能提出交接建议
   - 交接需等待用户确认

2. **角色级模板**
   - 你的角色职责
   - 你的交付物标准
   - 你应该关注什么，不该关注什么

3. **任务级上下文**
   - 当前任务名
   - 团队成员
   - 当前流程位置
   - 推荐下游角色

---

### Phase 3：handoff 提案检测与确认框

#### 目标
让 AI 可以主动提出“该交给谁了”，但不直接自动执行。

#### 推荐第一版实现

- AI 在回复中输出 `HANDOFF` 块
- 前端检测 assistant 最新消息中的该块
- 自动打开 handoff confirmation modal
- 用户选择下一个角色
- 系统复用现有 forward 流程

#### 为什么第一版不建议直接自动流转

因为：

- AI 会判断错误
- AI 可能过早交接
- AI 可能循环交接
- 用户仍需要最终控制权

所以最稳妥的是：

> **AI 提议，用户确认，系统执行。**

---

## 8. 对 UI 的专业建议：创建 Role 时的选择模型

当前 `AddRoleModal` 里 identity 是一个简单下拉框。未来建议升级为三段式。

### 8.1 建议的创建流程

1. 输入 Role Name
2. 选择 Role Type（角色类型 / archetype）
3. 自动带出：
   - 默认 identity 文案
   - 默认职责摘要
   - 推荐模型
   - 推荐下游角色
4. 用户仍可手工调整 model/provider
5. 高级模式下允许自定义 prompt override

### 8.2 推荐 UI 字段

#### 基础字段
- Role Name
- Role Type
- Provider
- Model

#### 自动展示字段
- 角色摘要
- 核心职责
- 典型交付物
- 推荐交接对象

#### 高级字段（可折叠）
- System Prompt Override
- 禁止/允许 handoff 建议
- 自定义 handoff 风格

### 8.3 为什么要这样设计

因为如果只让用户选择“Product Manager / Developer / Tester”，这个系统仍然太浅。

而如果用户一选角色类型，系统就能自动绑定：

- 职责
- 提示词
- 工作方式
- 推荐交接路线

那么 Task mode 才真正从“多会话集合”升级为“协作流水线系统”。

---

## 9. 对 agency-agents 的最佳接入策略

### 9.1 推荐：离线导入 + 内部维护

最推荐的接入方式是：

- 手工挑选合适 agent
- 提炼到内部 archetype JSON / TS registry
- 在文档中记录其来源路径
- 后续如需更新，再人工审查并升级

例如：

```ts
const ROLE_ARCHETYPES = {
  frontend_developer: {
    id: 'frontend_developer',
    label: 'Frontend Developer',
    source: {
      repository: 'agency-agents',
      path: 'engineering/engineering-frontend-developer.md'
    },
    summary: '负责前端 UI 实现、性能优化、交互细节与可访问性。',
    responsibilities: [
      '实现前端界面与状态逻辑',
      '保证交互一致性与响应式布局',
      '关注性能、可访问性与实现质量'
    ],
    handoffGuidance: '当界面实现思路完整且需要审查、测试或后续执行时，提出交接建议。'
  }
}
```

### 9.2 不推荐：运行时直接下载远程仓库内容

不建议在产品运行时：

- 动态拉 GitHub 内容
- 临时解析 Markdown
- 直接把远程文档绑定到 role

原因：

- 不稳定
- 不可控
- 难调试
- 难回溯
- 安全边界模糊

### 9.3 最现实的中间路线

如果后续希望“半动态”一些，可以做：

- 内部提供一个“导入 archetype”开发者工具
- 从本地 clone 或指定目录扫描 Markdown
- 提取 frontmatter + 摘要
- 由人工确认后入库

这样既保留灵活性，也不丢掉稳定性。

---

## 10. 核心技术设计建议

### 10.1 数据模型建议

#### 前端类型扩展

```ts
interface RoleConfig {
  name: string;
  identity: string;
  model: string;
  provider: string;
  archetypeId?: string;
  systemPromptOverride?: string;
}

interface RoleArchetype {
  id: string;
  label: string;
  description: string;
  sourcePath?: string;
  summary: string;
  responsibilities: string[];
  handoffGuidance: string;
  recommendedNextArchetypes?: string[];
}
```

#### 后端持久化建议

角色表未来可增加字段：

- `archetype_id`
- `system_prompt_snapshot`
- `handoff_enabled`
- `display_order`（如果未来要做流程顺序）

其中 `system_prompt_snapshot` 非常重要。

原因：

- archetype 会升级
- 已创建 task 的 role 行为不应被未来模板变更悄悄影响

因此建议：

> task 创建时，把最终实际使用的 prompt 快照保存下来。

---

### 10.2 prompt 组装建议

建议不要把 archetype 原文直接注入，而是生成“压缩版最终 prompt”。

例如：

```text
你当前在一个多角色协作任务系统中工作。

任务名称：{task_name}
团队成员：{team_roles}
你的角色：{role_name}
角色类型：{archetype_label}

你的职责：
- {responsibility_1}
- {responsibility_2}
- {responsibility_3}

边界规则：
- 不要越过你的职责边界承担其他角色的最终决策
- 如果你认为下一阶段应由其他角色继续，请输出 HANDOFF 块
- 你不能自行切换角色；系统会在用户确认后执行交接

交接格式：
[HANDOFF]
target_role: <建议角色名>
reason: <为什么该交接>
summary: <需要转交的关键信息>
next_action: <下一角色该做什么>
[/HANDOFF]
```

这类压缩 prompt 比直接引用 agency-agents 原文件更适合产品化。

---

### 10.3 handoff 检测建议

#### 第一版
前端正则/解析器检测最新 assistant message 中的 handoff block。

#### 第二版
后端在 AI 结束后解析 handoff block，并发出结构化事件：

```json
{
  "type": "handoff-proposed",
  "session_id": "session-xxx",
  "role_id": "role-xxx",
  "target_role": "Code Reviewer",
  "reason": "...",
  "summary": "...",
  "next_action": "..."
}
```

#### 第三版
升级为运行时 tool call / native action。

---

## 11. 我对产品策略的最终建议

### 11.1 最推荐路线

#### 推荐做
1. 建立内部 Role Archetype Registry
2. 从 `agency-agents` 选少量高质量 archetype 导入
3. 在创建 role 时绑定 archetype，而不是绑定原始 Markdown 文件
4. 创建 session 时注入任务级 + 角色级 prompt
5. 用 handoff confirmation modal 完成交接闭环

#### 不推荐做
1. 直接在运行时绑定 GitHub 上的 Markdown 文件
2. 直接把 agency-agents 全文塞进 system prompt
3. 在没有 archetype 中间层的情况下做 handoff 自动化
4. 让 AI 自主切换角色而不经过用户确认

### 11.2 为什么这是最优解

因为它兼顾了四件事：

- **产品一致性**：角色不是随便起名，而是有能力定义
- **技术可控性**：不依赖外部仓库结构稳定性
- **prompt 质量**：控制长度、风格和输出协议
- **流程安全性**：AI 只能提案，用户最终确认

---

## 12. 建议的实施阶段

### Phase A：角色模板化
- [ ] 建立 archetype registry
- [ ] 扩展 `RoleConfig`
- [ ] 升级 AddRoleModal：角色类型选择替代纯 identity 选择
- [ ] 预置 4~6 个 archetype

### Phase B：prompt 注入
- [ ] 在 task 创建时生成每个 role 的最终 prompt
- [ ] 将 prompt snapshot 保存到数据库
- [ ] 扩展 ClaurstSession 初始化逻辑，支持系统提示词注入

### Phase C：handoff 提案
- [ ] 定义 `HANDOFF` 协议
- [ ] 在前端解析 assistant 最新回复
- [ ] 自动弹出 handoff confirmation modal
- [ ] 复用现有 forward 流程执行交接

### Phase D：流程增强
- [ ] 定义推荐交接路径
- [ ] 防止循环交接
- [ ] 支持拒绝 handoff 并改派
- [ ] 在 Task 主界面展示“当前建议交接给谁”

---

## 13. 本文结论

如果只用一句话总结：

> **可以在创建 role 时自动绑定来自 `agency-agents` 的角色能力，但不应直接绑定原始 Markdown 文件；最佳方案是将其提炼为 MicroCompany 内部的 Role Archetype Registry，再在 session 创建时注入标准化角色提示词，并通过 handoff confirmation modal 完成交接闭环。**

这条路线在当前工程上是可落地的，而且是比“单纯加一个系统提示词”更完整、更可维护的产品方向。
