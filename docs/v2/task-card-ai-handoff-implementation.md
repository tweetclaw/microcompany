# 开发任务卡：实现 AI 角色智能交接功能

**文档版本**: v1.0  
**创建日期**: 2026-05-03  
**项目**: MicroCompany  
**文档性质**: 开发任务卡

---

## 1. 任务概述

### 1.1 任务目标

实现 AI 角色智能交接功能，让一个 AI 完成工作后，能够通过弹窗将任务交接给下一个 AI 角色。

### 1.2 问题背景

当前系统中，一个 AI 角色完成工作后，无法智能判断：
- 当前工作是否已完成，可以继续由同一角色处理？
- 还是需要交接给下一个角色继续处理？

需要设计一个**智能路由机制**来解决这个问题。

### 1.3 核心价值

> **让 AI 团队的协作像真实团队一样，工作完成后能够清晰地交接给下一个合适的角色，而不是随机切换。**

---

## 2. 技术方案

### 2.1 最终方案：AI 推荐 + 用户确认（混合方案）

结合自动化和可控性的优势，采用**混合方案**：

1. 使用独立的 JSON API 调用来**提取和结构化** handoff 内容
2. AI 给出**推荐的接手角色**
3. 用户通过 UI **手动确认**最终选择
4. 在 UI 上**显示提取的任务摘要**

### 2.2 工作流程

```
AI 对话结束
    ↓
调用独立 JSON API (轻量级提取)
    ↓
返回结构化 handoff 信息
    ↓
UI 显示:
  - 任务摘要 (task_summary)
  - 推荐角色高亮
  - 所有角色的【接手】按钮亮起
    ↓
用户点击某个角色的【接手】按钮
    ↓
将结构化信息传递给被选中的角色
```

---

## 3. 技术设计

### 3.1 JSON API 调用

**目的**：提取和结构化 handoff 内容，而非做路由判断

#### 输入结构

```json
{
  "role": "产品经理",
  "last_message": "需求分析完成。核心功能包括:\n1. 用户登录\n2. 数据展示\n3. 报表导出\n\n建议交接给开发工程师实现以上功能。"
}
```

#### 输出结构

```json
{
  "has_handoff": true,
  "task_summary": "实现用户登录、数据展示和报表导出功能",
  "key_requirements": [
    "用户登录",
    "数据展示",
    "报表导出"
  ],
  "suggested_role": "开发工程师"
}
```

#### 字段说明

- `has_handoff`: 是否检测到 handoff 意图
- `task_summary`: 任务摘要（在 UI 上显示）
- `key_requirements`: 关键需求列表
- `suggested_role`: AI 推荐的接手角色（仅作为 UI 提示）

### 3.2 系统提示词设计

```
你是一个 AI 团队协作助手。分析当前对话的最后一条消息,判断是否包含任务交接意图。

任务:
1. 判断是否需要交接给其他角色 (has_handoff: true/false)
2. 如果需要交接,提取任务摘要 (task_summary)
3. 提取关键需求列表 (key_requirements)
4. 推荐最合适的接手角色 (suggested_role)

角色职责参考:
- 产品经理: 需求分析、功能规划
- 开发工程师: 代码实现、技术方案
- 测试工程师: 测试用例、质量保证
- 设计师: UI/UX 设计、视觉规范

返回 JSON 格式:
{
  "has_handoff": boolean,
  "task_summary": string,
  "key_requirements": string[],
  "suggested_role": string
}

注意:
- task_summary 应简洁明了,一句话概括任务
- key_requirements 提取核心要点,不超过 5 条
- suggested_role 必须是上述角色之一
- 如果没有明确的交接意图,返回 has_handoff: false
```

### 3.3 UI 设计

#### UI 布局

```
┌─────────────────────────────────────────────────┐
│ 产品经理 (当前对话)                                │
│ [对话内容...]                                      │
│                                                   │
│ > 需求分析完成,建议交接给开发工程师                  │
│                                                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 📋 任务摘要                                       │
│ 实现用户登录、数据展示和报表导出功能                │
│                                                   │
│ 关键需求:                                         │
│ • 用户登录                                        │
│ • 数据展示                                        │
│ • 报表导出                                        │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 选择接手成员                                      │
│                                                   │
│ ⭐ 开发工程师  [接手] ← AI 推荐 (高亮显示)         │
│    测试工程师  [接手]                             │
│    设计师      [接手]                             │
│                                                   │
└─────────────────────────────────────────────────┘
```

#### UI 交互逻辑

1. AI 对话结束后,系统自动调用 JSON API
2. 如果 `has_handoff: true`:
   - 显示任务摘要卡片
   - 所有其他角色的【接手】按钮亮起
   - 如果有 `suggested_role`,该角色高亮显示 (⭐ 标记)
3. 用户点击任意角色的【接手】按钮
4. 将 `task_summary` 和 `key_requirements` 传递给被选中的角色

### 3.4 方案优势

1. **可控性** - 用户完全掌控最终决策,避免 AI 误判
2. **智能辅助** - AI 推荐减少用户思考负担
3. **结构化准确** - JSON API 保证提取准确性
4. **用户体验好** - 显示任务摘要,用户一目了然
5. **成本可控** - 只用于轻量级提取,不做复杂推理
6. **可扩展** - 未来可以增加"自动接手"开关

---

## 4. 代码清理策略

### 4.1 清理背景

当前实施的 handoff 模板占位符替换方案（`{{role}}` 替换机制）经过测试后证明**无效**。需要系统性清理相关代码和文档。

### 4.2 清理范围

#### 需要删除

- 所有与 `{{role}}` 占位符替换相关的代码
- 模板解析中的占位符处理逻辑
- 角色解析中的占位符处理逻辑
- 消息格式化中的占位符处理逻辑

#### 需要保留

- handoff 内容生成逻辑（因为旧方案确实能产生 handoff 内容）
- 现有的对话流程和消息传递机制
- 角色管理和团队协作的基础代码

#### 需要新增

- JSON API 调用逻辑（用于提取和结构化 handoff 内容）
- UI 接手按钮组件
- 任务摘要显示组件
- 角色推荐高亮逻辑

### 4.3 清理步骤

**阶段 1：确定清理策略**
1. 阅读 `docs/v2/intelligent-routing-design.md`
2. 根据最终选定的智能路由方案，确定清理范围
3. 与团队确认清理范围

**阶段 2：代码清理**
- 删除占位符替换的错误实现
- 保留 handoff 内容生成逻辑
- 删除 5 个无效的文档

**阶段 3：验证清理结果**
1. 搜索代码库中是否还有对已删除逻辑的引用
2. 确认没有遗留的测试用例引用已删除的代码
3. 运行项目确保没有因清理导致的运行时错误

---

## 5. 实施计划

### 5.1 阶段 1：代码清理（1-2 天）

参考清理文档，执行以下清理：
1. 删除占位符替换的错误实现（`{{role}}` 相关代码）
2. 保留 handoff 内容生成逻辑
3. 删除 5 个无效的文档

### 5.2 阶段 2：JSON API 实现（2-3 天）

**后端实现**：
1. 创建独立的 JSON API 端点（不走 claurst 子模块）
2. 实现系统提示词和结构化输出
3. 测试提取准确性

**前端集成**：
1. 在 AI 对话结束后自动调用 JSON API
2. 解析返回的结构化数据

### 5.3 阶段 3：UI 实现（2-3 天）

**任务摘要卡片**：
1. 显示 `task_summary`
2. 显示 `key_requirements` 列表

**接手按钮**：
1. 为每个角色添加【接手】按钮
2. 高亮显示 AI 推荐的角色（⭐ 标记）
3. 实现点击传递逻辑

### 5.4 阶段 4：测试与优化（1-2 天）

**功能测试**：
1. 测试串行任务交接流程
2. 验证多个角色互相配合

**用户体验优化**：
1. 调整 UI 交互细节
2. 优化提示词提取准确性

### 5.5 阶段 5：未来扩展（可选）

**自动接手开关**：
1. 增加"自动接手"配置选项
2. 用户可选择是否启用完全自动化

**复杂工作流支持**：
1. 支持并行任务处理
2. 支持条件路由规则

---

## 6. 测试方法

### 6.1 测试目标

本次测试不是"看 AI 能不能答题"，而是：

> **把 Team Templates 功能开发作为真实任务，交给 MicroCompany 里的 PM、Backend、Frontend、QA 依次推进，通过这条真实协作链路来验证 handoff 功能是否真的可用。**

### 6.2 验证内容

本次测试要验证 5 件事：

1. **PM 能否正确理解主文档**
   - 能否读懂 `team-templates-next-phase-implementation-plan.md`
   - 能否收敛 MVP 范围
   - 能否拆成可执行的开发模块
   - 能否指定下一位最合适的角色

2. **团队角色能否接力推进同一项真实开发工作**
   - Backend 是否能基于 PM 的拆分收敛数据结构和接口边界
   - Frontend 是否能基于前面产出收敛创建流程和模板预览
   - QA 是否能基于前面产出收敛测试路径

3. **Team Brief 是否真的帮助团队协作**
   - 用户是否能看懂这个 task 团队里有谁
   - 每个 seat 负责什么
   - 当前应该由谁工作
   - 下一步合理 handoff 给谁

4. **Handoff 是否像真实团队分工而不是随机切换**
   - AI 推荐的下一个角色是否合理
   - 用户是否保留最终确认权
   - 后一个角色是否真的接住上一个角色的结果

5. **整个体验是否真的像"用团队在开发软件"**
   - 你是在"带一个团队推进 Team Templates 功能"
   - 还是只是在"分别问几个 AI 问题"

### 6.3 建议团队配置

最小推荐团队（至少 4 个角色）：

**1) Product Manager**
- 职责：读取主文档、收敛 MVP 范围、拆分开发模块、说明依赖顺序、指定下一个角色

**2) Backend Engineer / Architect**
- 职责：收敛模板数据结构、明确 template/draft/task 边界、定义最小后端命令或 API、说明前端必须等待哪些后端边界先明确

**3) Frontend Engineer**
- 职责：设计模板创建入口、设计模板列表与模板预览、设计 template → draft 确认流程、设计 provider/model 补全校验

**4) QA Reviewer**
- 职责：输出 MVP 测试清单、覆盖主流程与边界条件、验证模板创建后的 task 是否仍能进入 Team Brief 与 handoff 运行时流程

### 6.4 推荐测试流程

**建议任务名称**：
```
Implement Team Templates MVP from the next-phase implementation plan
```

**推荐协作顺序**：

1. **PM 读取主文档并收敛 MVP 范围**
   - 发送消息：
   ```
   Please treat docs/v2/team-templates-next-phase-implementation-plan.md as the primary implementation brief for a real product task. Read it as the source of truth, then do four things: (1) summarize the smallest safe MVP scope, (2) identify the major implementation tracks, (3) explain the dependency order between those tracks, and (4) tell me which teammate should work next first and why.
   ```

2. **PM handoff 给 Backend**
   - 发送消息：
   ```
   Use the PM summary plus docs/v2/team-templates-next-phase-implementation-plan.md as your working brief. Focus only on backend MVP design for Team Templates. I need you to define: (1) the minimum data model, (2) the boundary between template, draft, and runtime task, (3) the smallest backend commands or APIs we need first, and (4) what frontend should wait for before building the UI.
   ```

3. **Backend handoff 给 Frontend**
   - 发送消息：
   ```
   Use the PM scope and backend design as your input. Now define the smallest frontend flow for Team Templates in task creation. I need a practical MVP interaction path covering: entry choice (blank vs template), template list, template preview, template-to-draft confirmation, required model completion, and final task creation.
   ```

4. **Frontend handoff 给 QA**
   - 发送消息：
   ```
   Use the PM, backend, and frontend outputs plus docs/v2/team-templates-next-phase-implementation-plan.md as your source. Create a practical MVP test checklist for Team Templates. Focus on the real creation flow, invalid/incomplete configurations, template preview clarity, saving task as template, and making sure template-created tasks still work with Team Brief and handoff.
   ```

---

## 7. 成功标准

只有当下面这些条件都满足时，才认为 AI 角色智能交接功能完成：

1. ✅ 用户可以看到清晰的任务摘要
2. ✅ AI 推荐的角色在 UI 上高亮显示
3. ✅ 用户点击【接手】按钮后，任务信息准确传递
4. ✅ 多个角色可以串行协作完成任务
5. ✅ 提取准确率 > 90%
6. ✅ PM → Backend → Frontend → QA 的协作链路顺畅
7. ✅ 整体体验像"用团队开发软件"，而不是"分别问了四次 AI"

---

## 8. 失败信号

如果出现下面这些情况，说明功能还没有通过验证：

### 8.1 PM 失败信号
- 看不懂文档在说什么
- 把范围扩展到大量非 MVP 内容
- 说不清先做什么后做什么
- 推荐下一个角色明显不合理

### 8.2 Backend 失败信号
- 说不清 template / draft / task 的区别
- 把模板和运行时 task 混在一起
- 忽略系统模板和用户模板差异
- 输出过重，像在做平台重构

### 8.3 Frontend 失败信号
- 跳过创建前确认
- 没有模板预览
- 流程和当前 Task Builder 脱节
- 开始设计复杂模板管理后台

### 8.4 QA 失败信号
- 只写很空的 checklist
- 没覆盖配置缺失、template → draft、保存模板这些关键路径
- 没有验证模板创建后是否还能进入 Team Brief + handoff

### 8.5 系统性失败信号
- handoff 推荐像随机的
- 下一个角色接不上前面的上下文
- 感觉不到团队协作，只是在轮流聊天

---

## 9. 技术约束

1. **第一阶段目标**：只验证串行执行，不需要并行处理
2. **可控性优先**：用户手动确认，避免 AI 误判
3. **结构化保证**：使用 JSON API 确保提取准确性
4. **成本可控**：轻量级 API 调用，不做复杂推理

---

## 10. 总结

### 10.1 核心价值

> **让 AI 团队的协作像真实团队一样，工作完成后能够清晰地交接给下一个合适的角色，而不是随机切换。**

### 10.2 关键特性

1. **智能提取** - JSON API 自动提取 handoff 内容和任务摘要
2. **AI 推荐** - 推荐最合适的接手角色，减少用户思考负担
3. **用户确认** - 用户保留最终决策权，避免 AI 误判
4. **清晰展示** - 任务摘要和关键需求一目了然

### 10.3 测试方法

通过真实的 Team Templates 功能开发任务，让 PM → Backend → Frontend → QA 依次协作，验证 handoff 功能是否真正可用。

---

**相关文档**：
- `docs/v2/intelligent-routing-design.md` - 智能路由方案设计
- `docs/v2/cleanup-invalid-handoff-solution.md` - 清理无效实现
- `docs/v2/team-templates-next-phase-implementation-plan.md` - Team Templates 实施计划（测试用例）
