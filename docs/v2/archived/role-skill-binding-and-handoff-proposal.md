# Role Archetype 与 Handoff 确认机制设计文档

**文档版本**: v2.1  
**创建日期**: 2026-04-25  
**项目**: MicroCompany  
**文档性质**: 最终设计文档

---

## 1. 设计目标

MicroCompany 的 Task 模式按以下方向演进：

> **Task 不再只是多个独立会话的集合，而是一个由多个角色串行接力完成任务的协作系统。**

为实现这一目标，系统第一阶段必须补齐三项基础能力：

1. **Role Archetype**：角色绑定内部标准化模板，而不是仅有身份标签
2. **Prompt Assembly**：每个 role session 在创建时注入平台规则、角色职责、团队上下文和任务上下文
3. **Handoff Confirmation**：AI 可以提出交接建议，但只能由用户确认后执行

本设计文档确定以下结论：

- 我们**不直接绑定**第三方 GitHub Markdown 原文
- 我们**采用内部提炼后的 archetype 资源**作为唯一运行时角色模板来源
- archetype 资源将**随应用一起发布**，并在本地用户目录下同步为运行时资源
- task 创建时为每个 role 生成并保存 **prompt snapshot**，保证历史任务行为稳定
- handoff 采用 **AI 提议、用户确认、系统执行** 的闭环模型
- 第二阶段将在第一阶段开发与测试稳定后，引入 **Team Template** 能力

---

## 2. 最终方案

### 2.1 角色模板策略

系统采用 **Role Archetype Registry**。

用户在 UI 中选择的是“角色类型”，系统内部绑定的是 `archetype_id`。运行时真正生效的是 MicroCompany 内部维护的 archetype 资源，而不是第三方仓库文件。

### 2.2 第三方内容使用策略

`agency-agents` 等外部仓库只作为：

- 角色职责参考
- 提示词素材来源
- 工作流程写法参考
- 交付物标准参考

我们从这些内容中提炼自己的：

- system prompt 片段
- role description
- team description
- task description
- handoff guidance

外部仓库内容不会被运行时直接读取，也不会被原样拼接进 system prompt。

### 2.3 交接策略

系统采用固定的 handoff 模型：

> **AI 只能提出交接建议，不能自行切换角色。用户确认后，系统复用现有 forward 流程执行交接。**

### 2.4 资源发布策略

archetype 资源采用双层发布结构：

1. **随包发布的只读资源**：应用安装包内置一份标准 archetype 资源
2. **用户目录下的运行时资源副本**：应用启动时同步到 `~/.microcompany/archetypes/`

最终运行时统一从 `~/.microcompany/archetypes/` 读取。

### 2.5 第二阶段模板策略

第一阶段完成后，系统将在 archetype 之上增加 **Team Template**。

定义固定如下：

- **Archetype**：定义单个角色的行为基线、职责、边界、交付物和 handoff guidance
- **Template**：定义一组可复用的团队角色组合
- **Template Role**：模板中的单个角色定义，可以给出推荐 archetype，但不是最终运行时实例
- **Task Role**：任务创建后真正落库并创建 session 的角色实例

第二阶段的模板能力用于：

- 复用一组常用角色配置
- 在创建 task 时复制模板，而不是从零手工添加角色
- 允许用户在创建前调整每个角色的 archetype 和模型配置
- 允许用户把自己的 task 配置保存成模板，下次继续复用

模板不是 archetype 的替代品，模板建立在 archetype 之上。

---

## 3. 资源组织设计

### 3.1 仓库内目录

内部 archetype 源文件统一放在：

```text
src-tauri/resources/archetypes/
  manifest.json
  system/
    product_manager.json
    project_shepherd.json
    frontend_developer.json
    software_architect.json
    code_reviewer.json
    technical_writer.json
```

说明：

- `manifest.json` 记录资源版本、文件列表、校验信息
- `system/` 下每个 archetype 一个文件
- 第一版采用 JSON 结构化格式，不直接存 Markdown 原文

### 3.2 运行时目录策略

应用运行时资源目录统一放在：

```text
~/.microcompany/archetypes/
  manifest.json
  system/
    product_manager.json
    project_shepherd.json
    frontend_developer.json
    software_architect.json
    code_reviewer.json
    technical_writer.json
  custom/
```

固定规则如下：

- `system/` 存放随包发布并同步下来的系统 archetype
- `custom/` 预留给后续用户自定义 archetype
- 第一版只读取 `system/`，目录结构一次到位
- 运行时统一从该目录加载 archetype registry

### 3.3 本地目录方案

本项目固定采用：

> **安装包内置资源 → 应用启动时同步到 `~/.microcompany/archetypes/` → 运行时从本地目录读取**

---

## 4. 随包发布与本地同步机制

### 4.1 打包方式

`src-tauri/resources/archetypes/` 作为 Tauri bundle resource 一部分随应用发布。

发布产物中必须包含：

- archetype manifest
- 全部 system archetype JSON 文件

### 4.2 首次安装行为

应用第一次启动时执行 archetype 资源初始化：

1. 检查 `~/.microcompany/archetypes/manifest.json` 是否存在
2. 如果不存在，则从安装包资源完整复制到 `~/.microcompany/archetypes/`
3. 初始化完成后，运行时从该目录加载 archetype registry

### 4.3 应用升级行为

应用升级后，每次启动执行 archetype 同步检查：

1. 读取安装包内 `manifest.json`
2. 读取 `~/.microcompany/archetypes/manifest.json`
3. 如果版本或校验信息不同，则覆盖更新 `system/` 目录和本地 manifest
4. `custom/` 目录不参与覆盖

### 4.4 覆盖规则

同步规则固定如下：

- `system/`：由应用维护，可被升级覆盖
- `custom/`：由用户维护，不允许升级覆盖
- 已创建 task 的 prompt 行为不受 archetype 升级影响，因为 task 创建时保存 prompt snapshot

### 4.5 同步时机

固定在应用启动阶段执行：

- 后端初始化阶段执行 archetype 目录检查与同步

不得放在：

- task 创建时
- role 创建时
- 首次打开某个页面时

---

## 5. Archetype 文件格式

第一版 archetype 文件采用结构化 JSON。

示例：

```json
{
  "id": "frontend_developer",
  "label": "Frontend Developer",
  "summary": "负责前端界面实现、状态逻辑、交互质量与可访问性。",
  "description": "在多角色协作任务中负责前端实现方案与交互落地。",
  "responsibilities": [
    "实现前端界面与状态逻辑",
    "保证交互一致性与响应式布局",
    "关注性能、可访问性与实现质量"
  ],
  "boundaries": [
    "不替代产品经理做需求最终裁决",
    "不替代评审员做最终代码风险判断"
  ],
  "deliverables": [
    "实现方案",
    "关键交互说明",
    "状态流和边界条件说明"
  ],
  "handoffGuidance": "当实现方案明确且需要评审、测试或后续执行时，提出交接建议。",
  "recommendedNextArchetypes": [
    "code_reviewer",
    "technical_writer"
  ],
  "promptFragments": {
    "roleSystem": "你是团队中的前端工程角色，负责 UI 实现、状态管理与交互细节。",
    "teamGuidance": "你应只在自己的职责范围内推进工作，并在适当时机提出交接建议。",
    "taskGuidance": "请基于当前任务上下文完成前端实现分析或执行建议。"
  },
  "source": {
    "repository": "agency-agents",
    "path": "engineering/engineering-frontend-developer.md"
  }
}
```

设计要求：

- archetype 文件必须是结构化资源，不是自由散文
- prompt 只保存压缩后的内部片段，不保存外部原文
- `source` 只记录来源，运行时不依赖来源文件存在

---

## 6. Prompt 组装设计

### 6.1 组装原则

每个 role session 的最终 prompt 由四层内容拼接生成：

1. **平台规则**
2. **archetype 角色模板**
3. **team 描述**
4. **task 描述**

如果用户配置了高级覆盖项，再附加：

5. **system prompt override**

### 6.2 平台规则

平台规则是全角色共享的固定内容，至少包含：

- 你是多角色协作任务中的一个成员
- 你只能完成当前角色职责范围内的工作
- 你不能自行切换角色
- 当你认为下一阶段应由其他角色继续时，可以输出 `HANDOFF` 块
- handoff 只是建议，必须等待用户确认

### 6.3 Role 描述

Role 描述来自 archetype 文件，包括：

- 角色定义
- 角色职责
- 工作边界
- 交付物要求
- handoff guidance

### 6.4 Team 描述

Team 描述由当前 task 生成，包括：

- 当前任务中有哪些角色
- 当前角色是谁
- 推荐下游角色是谁
- 当前角色在团队中的协作位置是什么

### 6.5 Task 描述

Task 描述由当前 task 实例生成，包括：

- 当前任务名称
- 任务目标
- 用户提供的任务背景
- 当前工作目录或相关上下文

### 6.6 最终 prompt snapshot

task 创建时，系统为每个 role 生成最终 prompt，并把结果保存为 snapshot。

保存目的：

- 固定该 task 的角色行为
- 避免 archetype 升级影响历史任务
- 支持问题排查和行为回放

---

## 7. 数据模型

### 7.1 前端 RoleConfig

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

### 7.2 前端 RoleArchetype

```ts
interface RoleArchetype {
  id: string;
  label: string;
  description: string;
  summary: string;
  responsibilities: string[];
  boundaries?: string[];
  deliverables?: string[];
  handoffGuidance: string;
  recommendedNextArchetypes?: string[];
}
```

### 7.3 后端 RoleConfig

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

### 7.4 持久化字段

角色记录需要增加以下字段：

- `archetype_id`
- `system_prompt_snapshot`
- `handoff_enabled`
- `display_order`

其中 `system_prompt_snapshot` 为必需设计。

---

## 8. Session 初始化设计

### 8.1 创建时机

在 task 创建时，为每个 role 创建独立 session。

### 8.2 初始化输入

session 初始化必须接收：

- `session_id`
- `working_dir`
- `api_key`
- `model`
- `base_url`
- `system_prompt_snapshot`

### 8.3 设计要求

系统必须支持 role-specific prompt 注入，不能再只依赖统一默认 prompt。

这一步是本方案的硬前提。如果这一层没有打通，后续 handoff 机制不进入开发阶段。

---

## 9. Handoff 协议设计

### 9.1 第一版协议

第一版统一采用文本协议：

```text
[HANDOFF]
target_role: Code Reviewer
reason: 当前阶段的实现分析已完成，下一步应审查变更风险与边界
summary: 已明确主要实现路径、关键状态流与异常处理点
next_action: 请评审实现边界、遗漏测试与潜在风险
[/HANDOFF]
```

### 9.2 第一版系统行为

1. AI 在回复中输出 `HANDOFF` 块
2. 前端检测 assistant 最新消息中的 handoff 内容
3. 系统弹出 handoff confirmation modal
4. 用户确认目标角色
5. 系统复用现有 forward latest reply 流程执行交接

### 9.3 行为约束

系统固定执行以下约束：

- AI 不得自动切换角色
- handoff 必须由用户确认
- 默认不允许交接给自己
- 第一版不做完全自动流转

---

## 10. UI 设计要求

### 10.1 Add Role 流程

`AddRoleModal` 按以下结构升级：

1. 输入 `Role Name`
2. 选择 `Role Type / Archetype`
3. 自动展示：
   - 角色摘要
   - 核心职责
   - 推荐交接对象
   - 推荐模型
4. 用户仍可手动调整 provider/model
5. 高级区域允许填写 `System Prompt Override`

### 10.2 Task 执行界面

Task 主界面保持“单 AI 串行接力控制台”方向：

- 中间突出当前工作角色
- AI 完成后可以触发 handoff 建议确认
- 用户可明确看到当前是谁在工作、下一步建议交给谁

---

## 11. 第二阶段：Team Template

### 11.1 阶段定位

第二阶段在第一阶段开发完成并通过测试后启动。

第二阶段的职责不是替代 archetype，而是在 archetype 之上提供复用的团队配置能力。

### 11.2 用户能力

第二阶段上线后，用户可以：

1. 在创建 task 时选择一个团队模板
2. 把模板复制为当前 task draft
3. 在真正创建 task 之前，统一检查和修改每个 role 的配置
4. 修改每个 role 的推荐 archetype
5. 修改每个 role 的 provider/model
6. 把当前 task 配置保存为自己的模板
7. 在下次开始工作时继续使用自己的模板

### 11.3 系统模板规则

系统内置模板遵循以下规则：

- 系统模板用于提供常见的软件公司团队组合
- 系统模板中的每个角色可以带有推荐 archetype
- 系统模板默认**不配置 provider/model**
- 系统模板只定义团队结构和推荐角色配置，不直接生成运行时 task

### 11.4 用户模板规则

用户模板遵循以下规则：

- 用户可以把当前 task 配置保存为模板
- 用户模板保存角色顺序、角色名、推荐 archetype 和已选择的模型配置
- 用户下次使用模板时，系统仍提供一次创建前检查与修改机会

### 11.5 运行时约束

第二阶段必须明确以下系统约束：

- 模板可以是“模型未配置”的草稿结构
- 真正创建 task 之前，每个 role 必须补齐 provider/model
- 只有在每个 role 的运行时模型都确定后，系统才允许调用 task 创建流程

这是当前运行时架构的固定约束，不在第二阶段改变。

---

## 12. 第一批预置 Archetype

第一版只内置以下 archetype：

- `product_manager`
- `project_shepherd`
- `frontend_developer`
- `software_architect`
- `code_reviewer`
- `technical_writer`

这批 archetype 由内部提炼后写入 `src-tauri/resources/archetypes/system/`，随安装包一起发布。

---

## 13. 工程实施顺序

系统按以下固定顺序推进：

### Phase A：Archetype 资源落地

- 建立 `src-tauri/resources/archetypes/`
- 定义 `manifest.json`
- 写入第一批 system archetype JSON
- 配置随包发布资源
- 启动时同步到 `~/.microcompany/archetypes/`

### Phase B：RoleConfig 扩展

- 前后端扩展 `RoleConfig`
- 保存 `archetype_id`
- AddRoleModal 支持 archetype 选择

### Phase C：Prompt 组装与快照

- 实现 prompt builder
- 生成 role-specific prompt
- task 创建时保存 `system_prompt_snapshot`
- session 初始化支持注入 snapshot

### Phase D：Handoff 闭环

- 定义 `HANDOFF` 协议
- 前端解析 AI 回复
- 弹出确认 modal
- 复用现有 forward 流程执行交接

### Phase E：Team Template

- 模板定义建立在 archetype 之上
- 新建任务支持从模板复制角色配置
- 创建前统一完成每个 role 的模型确认
- 支持用户保存自己的 task 配置为模板

### Phase F：流程增强

- 防循环交接
- 支持拒绝 handoff 和改派
- 展示推荐交接路径和历史

---

## 14. 最终结论

MicroCompany 采用以下正式设计基线：

1. **从第三方角色仓库中提炼内容，构建自己的 archetype 系统，不直接绑定外部 Markdown 原文**
2. **内部 archetype 资源统一存放在仓库 `src-tauri/resources/archetypes/` 下，并随应用安装包一起发布**
3. **应用启动时将 archetype 资源同步到 `~/.microcompany/archetypes/`，运行时统一从该目录读取**
4. **task 创建时为每个 role 生成并保存 prompt snapshot，确保历史任务行为稳定**
5. **AI 只负责提出 handoff 建议，用户确认后系统执行交接**
6. **第一阶段稳定后，再引入建立在 archetype 之上的 Team Template 能力，用于复用软件公司团队配置和用户自定义模板**

这就是本系统的正式设计基线，后续实现以本文件为准。
