# Task Team Template 系统设计文档

**文档版本**: v2.0  
**创建日期**: 2026-04-25  
**项目**: MicroCompany  
**文档性质**: 第二阶段设计文档

---

## 1. 设计目标

Team Template 是 MicroCompany Task 模式的第二阶段能力。

其目标是：

> **让用户在创建 task 时不必每次重新逐个添加角色，而是直接从一个可复用的团队模板开始，再在创建前完成一次角色配置确认。**

本阶段建立在第一阶段的 Role Archetype、Prompt Snapshot 和 Handoff Confirmation 基础之上，不独立成系统。

---

## 2. 设计定位

### 2.1 Phase 2 启动条件

第二阶段只在以下前提满足后启动：

- 第一阶段 archetype 资源系统已完成
- role 创建已支持 archetype 绑定
- prompt snapshot 已稳定生效
- handoff confirmation 已完成基本闭环
- 第一阶段功能已完成开发、联调和测试验证

在此之前，不启动 Team Template 开发。

### 2.2 Archetype 与 Template 的关系

系统术语固定如下：

- **Archetype**：单个角色的行为基线，定义职责、边界、交付物和 handoff guidance
- **Template**：一组可复用的团队角色组合
- **Template Role**：模板中的角色定义，包含推荐 archetype 和可选的 provider/model
- **Task Role**：真正创建到 task 中并持有 session 的运行时角色

固定关系如下：

> **Template 复用团队结构，Archetype 定义角色行为。Template 建立在 Archetype 之上，不替代 Archetype。**

---

## 3. 用户能力

第二阶段上线后，用户获得以下能力：

### 3.1 从模板创建 task

用户在创建 task 时可以：

1. 选择空白创建
2. 选择从模板创建
3. 选择一个系统模板或自己的模板
4. 将模板复制为当前 task draft
5. 在创建前统一检查并修改每个 role 的配置
6. 确认后创建真正的 task

### 3.2 创建前统一检查

模板复制到 task draft 后，用户必须拥有一次统一检查机会。

这一步允许用户：

- 修改 task 名称
- 修改 role 名称
- 修改 role 的 archetype
- 修改 role 的 provider/model
- 调整角色顺序（如果该交互在第二阶段一起上线）

### 3.3 保存为用户模板

用户可以把当前 task 配置保存为模板。

保存后的模板可用于：

- 下次新建 task 时继续复用
- 作为用户团队配置的长期资产
- 基于已有模板再复制并修改

---

## 4. 模板类型

### 4.1 系统模板

系统模板由 MicroCompany 随应用内置发布。

系统模板固定遵循以下规则：

- 用于提供常见的软件公司团队结构
- 每个模板 role 可以给出推荐 archetype
- 默认**不绑定 provider/model**
- 允许用户在创建前修改 archetype
- 允许用户在创建前配置模型

系统模板的职责是提供：

- 团队结构
- 角色名称建议
- 角色顺序建议
- archetype 推荐
- 可选的说明文案

系统模板不直接表示可执行 task。

### 4.2 用户模板

用户模板由用户自己创建并长期保存。

用户模板固定遵循以下规则：

- 可以从零新建
- 可以从系统模板复制后保存
- 可以从当前 task 配置保存
- 保存角色顺序、角色名称、推荐 archetype、可选的 provider/model
- 下次使用时仍然进入创建前检查流程

---

## 5. 运行时约束

### 5.1 模板可以不完整，task 不可以

本系统固定采用以下约束：

- 模板允许 provider/model 为空
- 真正创建 task 时，每个 role 必须有确定的 provider/model

原因不是产品策略，而是当前运行时架构的既定约束：

- 前端 `RoleConfig` 当前要求 provider/model
- 后端 `RoleConfig` 当前要求 provider/model
- task 创建流程会立即为每个 role 创建 session
- 现有数据库 schema 对运行时角色和 session 的 provider/model 采用非空约束

因此，模板只能作为：

> **task draft 的来源，而不是直接运行的 task 实例。**

### 5.2 创建前检查是必经步骤

如果模板中的任意 role 未配置 provider/model，系统必须阻止直接创建 task，并要求用户在创建前补齐。

即使模板中已经配置了 provider/model，系统仍然保留一次创建前确认机会。

---

## 6. 核心流程

### 6.1 从模板创建 task

固定流程如下：

1. 用户进入新建 task
2. 选择“从模板创建”
3. 选择系统模板或用户模板
4. 系统将模板复制为当前 task draft
5. 用户进入创建前确认界面
6. 用户逐个确认每个 role 的 archetype 和模型配置
7. 所有 role 的 provider/model 补齐后，系统调用现有 `create_task` 流程
8. 后端按既有逻辑创建 task、roles、sessions

### 6.2 保存当前 task 配置为模板

固定流程如下：

1. 用户在某个 task 的配置已稳定后，选择“保存为模板”
2. 系统读取当前 task 的角色结构
3. 提取模板信息和模板角色信息
4. 保存为用户模板
5. 下次新建 task 时可直接复用

### 6.3 修改 archetype 的时机

第二阶段固定允许用户在以下阶段修改 archetype：

- 模板编辑时
- 从模板创建 task 的创建前确认阶段

不在 task 已创建后，把模板修改反向影响已有 task role。

---

## 7. 数据模型

### 7.1 TaskTemplate

```ts
interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  roles: TemplateRole[];
}
```

### 7.2 TemplateRole

```ts
interface TemplateRole {
  id: string;
  name: string;
  identity: string;
  recommendedArchetypeId?: string;
  provider?: string;
  model?: string;
  displayOrder: number;
}
```

### 7.3 与 RoleConfig 的关系

模板阶段：
- `TemplateRole.provider` 和 `TemplateRole.model` 可为空
- `TemplateRole.recommendedArchetypeId` 可为空但建议提供

运行时 task 创建阶段：
- 需要将 TemplateRole 转换为完整的 `RoleConfig`
- 转换后每个 role 必须具备：
  - `name`
  - `identity`
  - `provider`
  - `model`
  - `archetypeId`

---

## 8. UI 设计要求

### 8.1 新建 Task 入口

`TaskBuilder` 升级为两种模式：

- 从空白创建
- 从模板创建

### 8.2 模板选择器

模板选择器展示：

- 模板名称
- 模板描述
- 角色数量
- 系统模板 / 用户模板标识
- 模板内角色摘要

### 8.3 创建前确认界面

从模板复制后，必须进入创建前确认界面。

界面中应展示：

- task 名称
- role 列表
- 每个 role 的推荐 archetype
- 每个 role 当前 provider/model 配置
- provider/model 缺失提示

并允许用户：

- 修改 archetype
- 修改 provider/model
- 补齐未配置项

### 8.4 模板管理界面

第二阶段提供模板管理能力：

- 查看系统模板
- 查看用户模板
- 创建用户模板
- 编辑用户模板
- 删除用户模板

系统模板只读，用户模板可编辑。

---

## 9. 系统预置模板原则

系统预置模板采用以下原则：

1. 面向软件公司典型协作场景
2. 每个模板尽量保持角色边界清晰
3. 每个角色都推荐 archetype
4. 默认不提供 provider/model
5. 不依赖用户本地是否已配置 API

第一批系统模板建议：

- 软件开发团队
- 功能交付小队
- 需求分析与实现团队
- 代码修复与验证团队

---

## 10. 用户模板原则

用户模板固定支持以下来源：

1. 从空白模板创建
2. 从系统模板复制并保存
3. 从当前 task 配置保存

用户模板固定保存以下内容：

- 模板名称
- 模板描述
- 角色顺序
- 角色名称
- 推荐 archetype
- 可选的 provider/model

用户模板不反向影响已创建 task。

---

## 11. 与第一阶段文档的衔接

第二阶段与第一阶段的衔接固定如下：

- archetype 仍由 `src-tauri/resources/archetypes/` 与 `~/.microcompany/archetypes/` 管理
- 模板中的角色通过 `recommendedArchetypeId` 关联 archetype
- task 创建后仍按第一阶段方式生成 prompt snapshot
- handoff 行为仍沿用第一阶段的协议和确认机制

第二阶段只解决“如何更快创建正确的团队”，不改变第一阶段已经确定的运行时协作模型。

---

## 12. 当前实现约束参考

第二阶段设计必须与当前实现约束保持一致，重点参考以下文件：

- `src/components/TaskBuilder.tsx`
- `src/components/AddRoleModal.tsx`
- `src/types/api.ts`
- `src-tauri/src/api/task.rs`
- `src-tauri/src/api/task_impl.rs`
- `src-tauri/migrations/001_initial_schema.sql`

这些文件共同说明：

- 当前 task 创建仍要求完整 role 运行时配置
- 当前后端创建 task 时会立即创建 role session
- 当前数据库对运行时 provider/model 仍是非空约束

因此第二阶段不能绕过创建前确认步骤。

---

## 13. 实施顺序

第二阶段按以下顺序推进：

### Phase 2A：模板数据模型

- 建立 `TaskTemplate` 和 `TemplateRole`
- 增加系统模板与用户模板区分
- 允许模板 role 的 provider/model 为空

### Phase 2B：模板选择与 task draft

- TaskBuilder 增加从模板创建入口
- 模板复制为 task draft
- 创建前确认界面接管最终创建

### Phase 2C：用户模板能力

- 保存当前 task 配置为模板
- 模板管理界面
- 编辑和删除用户模板

### Phase 2D：模板体验增强

- 增加更多系统模板
- 优化角色推荐展示
- 提升模板预览与复用效率

---

## 14. 最终结论

MicroCompany 第二阶段采用以下正式方案：

1. **Team Template 是建立在 Role Archetype 之上的团队复用能力，不替代 Archetype**
2. **系统模板默认不配置 provider/model，只提供团队结构和 archetype 推荐**
3. **用户从模板创建 task 时，必须先完成一次创建前确认，补齐或修改每个 role 的 archetype 与模型配置**
4. **只有所有 role 的运行时配置完整后，系统才调用现有 task 创建流程**
5. **用户可以把自己的 task 配置保存为模板，下次继续复用**

这就是 Team Template 第二阶段的正式设计基线，后续以本文件为准。
