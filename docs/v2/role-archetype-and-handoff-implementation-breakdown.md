# Role Archetype 与 Handoff 确认机制实施文档

**文档版本**: v2.1  
**创建日期**: 2026-04-25  
**项目**: MicroCompany  
**文档性质**: 实施文档

---

## 1. 实施目标

本实施文档服务于《role-skill-binding-and-handoff-proposal.md》的落地执行。

项目按以下目标推进：

1. 建立随应用发布的 archetype 资源系统
2. 在应用启动时同步 archetype 资源到 `~/.microcompany/archetypes/`
3. 在 role 创建与 task 创建链路中引入 `archetype_id`
4. 为每个 role 生成最终 prompt snapshot 并注入 session
5. 建立 `HANDOFF` 协议与确认闭环
6. 在第一阶段验证稳定后，启动第二阶段 Team Template 能力

本项目不再讨论方案分歧，直接按既定设计执行。

---

## 2. 实施范围

### 2.1 第一阶段必须完成

- archetype 资源目录结构
- archetype manifest
- 第一批内置 archetype JSON
- 随包发布 archetype 资源
- 启动时同步到 `~/.microcompany/archetypes/`
- 前后端 `RoleConfig` 扩展
- AddRoleModal archetype 选择能力
- prompt builder
- prompt snapshot 持久化
- session 初始化 prompt 注入
- `HANDOFF` 文本协议
- handoff confirmation modal 接入现有 forward 流程

### 2.2 第一阶段不做

- 运行时读取第三方 GitHub 内容
- archetype 在线市场
- archetype 图形化编辑器
- AI 自动执行交接
- 完整复杂状态机
- Team Template
- 模板管理界面
- 保存 task 为模板

### 2.3 第二阶段目标

第二阶段只在第一阶段开发和测试通过后启动，目标固定为：

- 提供系统团队模板
- 提供用户自定义模板
- 支持从模板复制 task draft
- 支持创建前统一修改每个 role 的 archetype 和模型配置
- 支持把当前 task 配置保存为模板

---

## 3. 目录与资源发布方案

### 3.1 仓库内目录

新增目录：

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

### 3.2 用户目录

运行时 archetype 目录统一使用：

```text
~/.microcompany/archetypes/
  manifest.json
  system/
  custom/
```

### 3.3 发布与加载规则

固定规则如下：

- 发布包内置 `src-tauri/resources/archetypes/`
- 应用启动时同步到 `~/.microcompany/archetypes/`
- 运行时统一从 `~/.microcompany/archetypes/` 读取
- 升级只覆盖 `system/`
- `custom/` 永不覆盖

### 3.4 同步时机

archetype 初始化与同步放在后端应用启动阶段执行。

执行时机：
- Tauri app setup 或等价初始化流程

不得放在：
- 某个页面首次打开时
- task 创建时
- role 创建时

---

## 4. Archetype 文件定义

### 4.1 manifest.json

manifest 至少包含：

```json
{
  "version": "1.0.0",
  "systemFiles": [
    "product_manager.json",
    "project_shepherd.json",
    "frontend_developer.json",
    "software_architect.json",
    "code_reviewer.json",
    "technical_writer.json"
  ]
}
```

### 4.2 archetype JSON 结构

每个 archetype 文件固定包含：

- `id`
- `label`
- `summary`
- `description`
- `responsibilities`
- `boundaries`
- `deliverables`
- `handoffGuidance`
- `recommendedNextArchetypes`
- `promptFragments`
- `source`

### 4.3 数据来源原则

内容来源于内部提炼，不是外部原文复制。

允许：
- 参考 `agency-agents` 的职责和流程组织方式
- 提炼其表达为内部压缩 prompt 片段

禁止：
- 运行时读取外部 Markdown
- 把原始 Markdown 全文注入 system prompt

---

## 5. 数据结构改造

### 5.1 前端类型

更新 `RoleConfig`：

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

新增 `RoleArchetype`：

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

### 5.2 后端类型

更新 Rust `RoleConfig`：

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

### 5.3 持久化字段

角色数据新增：

- `archetype_id`
- `system_prompt_snapshot`
- `handoff_enabled`
- `display_order`

### 5.4 第二阶段模板数据边界

第二阶段引入模板时，模板数据与运行时 task 数据分离：

- 模板允许 provider/model 为空
- 运行时 task role 不允许 provider/model 为空
- 模板 role 保存推荐 archetype
- task role 保存最终 `archetype_id`

该边界在第一阶段不改动运行时 task 的创建约束。

---

## 6. 代码级实施步骤

### Step 1：新增 archetype 资源与同步器

后端新增 archetype resource manager，职责固定为：

- 定位 bundle 内 archetype 资源
- 确保 `~/.microcompany/archetypes/` 存在
- 读取内置 manifest 与本地 manifest
- 执行 system archetype 覆盖同步
- 确保 `custom/` 目录存在

建议文件：

- `src-tauri/src/archetypes/mod.rs`
- `src-tauri/src/archetypes/sync.rs`
- `src-tauri/src/archetypes/loader.rs`

接入点：

- 在 `src-tauri/src/lib.rs` 的应用启动阶段调用同步逻辑

### Step 2：实现 archetype loader

运行时 archetype registry 统一从 `~/.microcompany/archetypes/` 读取。

loader 职责：

- 读取 manifest
- 加载 system archetype
- 预留 custom archetype 加载能力

### Step 3：前端接入 archetype 列表

本项目固定采用后端提供 archetype 列表接口、前端只消费结果的方式。

### Step 4：升级 AddRoleModal

AddRoleModal 调整为：

- 输入 Role Name
- 选择 Role Type / Archetype
- 自动展示摘要与职责
- 用户继续选择 provider/model
- 高级选项填写 `systemPromptOverride`

### Step 5：打通 task 创建链路

task 创建请求中新增：

- `archetypeId`
- `systemPromptOverride`

后端 task 创建时必须：

1. 读取 archetype
2. 组装 prompt
3. 生成 snapshot
4. 保存 role 记录
5. 创建 session 时注入 snapshot

### Step 6：实现 prompt builder

后端新增 prompt builder，负责拼接：

- 平台规则
- role archetype 片段
- team 描述
- task 描述
- override

建议文件：

- `src-tauri/src/archetypes/prompt_builder.rs`

### Step 7：扩展 session 初始化

`ClaurstSession::new(...)` 或其包装流程需要支持接收最终 prompt。

要求：

- 不同 role session 注入不同 prompt
- role prompt 来源于 snapshot，不是运行时临时重新生成

### Step 8：增加 handoff 协议识别

第一版 handoff 协议固定如下：

```text
[HANDOFF]
target_role: <角色名>
reason: <交接原因>
summary: <上下文摘要>
next_action: <下一角色动作>
[/HANDOFF]
```

实现要求：

- assistant 回复完成后解析该块
- 解析成功后触发 handoff confirmation modal
- 用户确认后复用现有 forward latest reply 流程

---

## 7. 第二阶段实施定义

### 7.1 第二阶段新增能力

第一阶段完成后，第二阶段增加 Team Template 系统，固定支持：

- 系统团队模板
- 用户团队模板
- 从模板复制 task draft
- 创建前统一检查每个 role
- 修改 role 的 archetype
- 修改 role 的 provider/model
- 保存当前 task 配置为模板

### 7.2 第二阶段运行时约束

第二阶段必须遵守当前运行时约束：

- 运行时 task 创建仍沿用现有 `create_task` 流程
- 在真正创建 task 前，每个 role 必须已经确定 provider/model
- 模板只是 task draft 的来源，不是直接运行时 task

### 7.3 第二阶段建议影响面

文档层面应预留以下实现影响：

- `src/components/TaskBuilder.tsx`
  - 增加从模板创建入口
- `src/components/AddRoleModal.tsx`
  - 支持 archetype 选择复用到模板编辑流程
- `src/types/api.ts`
  - 未来模板类型定义
- `src-tauri/src/api/task.rs`
  - 与模板创建 task 的接口衔接
- `src-tauri/src/api/task_impl.rs`
  - 继续复用现有 resolved task 创建流程
- 数据库 migration
  - 增加模板表与模板角色表，允许 provider/model 为空

### 7.4 第二阶段不改变的内容

第二阶段不改变以下基础事实：

- archetype 仍是角色行为定义的唯一来源
- handoff 仍保持 AI 提议、用户确认、系统执行
- prompt snapshot 仍在 task 创建时生成
- 已创建 task 不因为模板变更而漂移

---

## 8. 详细模块分工

### 8.1 后端模块

#### `src-tauri/src/archetypes/*`
负责：
- archetype 同步
- archetype 加载
- prompt builder

#### `src-tauri/src/api/task*`
负责：
- 接收 role 的 `archetype_id`
- 调用 prompt builder
- 保存 prompt snapshot
- 初始化 task role session

#### `src-tauri/src/claurst/*`
负责：
- 接收 system prompt snapshot
- 创建带角色上下文的 session

### 8.2 前端模块

#### `src/components/AddRoleModal.tsx`
负责：
- archetype 选择
- archetype 摘要展示
- override 输入

#### Task 模式相关组件
负责：
- handoff block 检测结果展示
- handoff confirmation modal 调用
- 复用现有 forward 交接

---

## 9. 建议修改文件清单

### 9.1 后端

- `src-tauri/tauri.conf.json`
  - 配置 bundle resources
- `src-tauri/src/lib.rs`
  - 启动时执行 archetype 同步
  - 注册 archetype 查询命令
- `src-tauri/src/api/task.rs`
- `src-tauri/src/api/task_impl.rs`
- `src-tauri/src/claurst/mod.rs`
- `src-tauri/src/database/*`
  - 增加 archetype / snapshot 字段
- `src-tauri/src/config/mod.rs`
  - 可抽出统一的 `~/.microcompany` 路径工具

新增：
- `src-tauri/src/archetypes/mod.rs`
- `src-tauri/src/archetypes/sync.rs`
- `src-tauri/src/archetypes/loader.rs`
- `src-tauri/src/archetypes/prompt_builder.rs`
- `src-tauri/resources/archetypes/manifest.json`
- `src-tauri/resources/archetypes/system/*.json`

### 9.2 前端

- `src/types/index.ts`
- `src/components/AddRoleModal.tsx`
- task 创建相关逻辑
- handoff modal 触发逻辑

### 9.3 第二阶段参考文件

第二阶段实现时重点参考：

- `src/components/TaskBuilder.tsx`
- `src/components/AddRoleModal.tsx`
- `src/types/api.ts`
- `src-tauri/src/api/task.rs`
- `src-tauri/src/api/task_impl.rs`
- `src-tauri/migrations/001_initial_schema.sql`

---

## 10. 开发顺序

开发顺序固定如下，不调整顺序：

### Milestone 1：资源层

- 建 archetype 仓库目录
- 配 manifest
- 配 bundle resource
- 完成启动同步到 `~/.microcompany/archetypes/`
- 提供 archetype 列表读取接口

### Milestone 2：角色层

- 扩展 `RoleConfig`
- 升级 AddRoleModal
- role 创建保存 `archetype_id`

### Milestone 3：prompt 层

- 实现 prompt builder
- 持久化 snapshot
- session 初始化注入 prompt

### Milestone 4：handoff 层

- 定义 `HANDOFF` 协议
- 检测 AI 回复
- 接 handoff confirmation modal
- 复用 forward 流程

### Milestone 5：模板层（第二阶段）

- 建立 Team Template 数据模型
- 支持从模板复制 task draft
- 创建前完成每个 role 的 archetype 和模型确认
- 支持把当前 task 配置保存为模板
- 支持系统模板与用户模板并存

### Milestone 6：增强层

- 防循环交接
- 拒绝与改派
- handoff 历史显示

---

## 11. 验收标准

### 11.1 archetype 资源

- 安装包包含 archetype 资源
- 应用启动后 `~/.microcompany/archetypes/` 自动生成
- 应用升级后 `system/` 可自动同步更新
- `custom/` 不被覆盖

### 11.2 role 创建

- 用户可选 archetype
- 角色数据可保存 `archetype_id`
- 可展示 archetype 摘要与职责

### 11.3 prompt 注入

- 不同 role session 注入不同 prompt
- task 创建时保存 snapshot
- 历史 task 行为不受 archetype 升级影响

### 11.4 handoff 闭环

- AI 可输出标准 `HANDOFF` 块
- 前端可识别并弹出确认框
- 用户确认后交接成功
- AI 无法自行切换角色

### 11.5 第二阶段模板能力

- 用户可选择系统模板创建 task draft
- 用户可在创建前修改每个 role 的 archetype 和模型
- provider/model 未补齐时不得创建 task
- 用户可保存自己的 task 配置为模板并重复使用

---

## 12. 实施结论

MicroCompany 按以下方式开始实施：

1. **先建立随包发布并同步到 `~/.microcompany/archetypes/` 的 archetype 资源系统**
2. **再扩展 RoleConfig 与 AddRoleModal，把 role 绑定到 archetype**
3. **随后实现 prompt builder 和 session prompt snapshot 注入**
4. **接入 `HANDOFF` 协议与 confirmation modal**
5. **第一阶段稳定后，再启动建立在 archetype 之上的 Team Template 第二阶段**

该顺序为本项目正式执行顺序，后续开发、拆任务、评审和验收均以本文件为准。
