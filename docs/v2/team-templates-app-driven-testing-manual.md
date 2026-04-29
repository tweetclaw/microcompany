# 用 MicroCompany App 真实推进 Team Templates 开发的测试手册

**文档版本**: v1.0  
**创建日期**: 2026-04-29  
**项目**: MicroCompany  
**文档性质**: App 内真实协作测试手册

---

## 1. 这份手册是干什么的

这份手册不是测试某个按钮有没有显示出来。

这份手册的目标是：

> **直接把 `docs/v2/team-templates-next-phase-implementation-plan.md` 当作真实开发需求，放进我们的 app，让 app 里的团队角色自己去理解、拆解、分发、推进 Team Templates 功能。**

也就是说，从现在开始：

- 不是你在脑中假设一个团队
- 而是你真的在 MicroCompany 里建立一个 task 团队
- 然后把这份实施计划交给项目经理
- 让项目经理开始理解需求、收敛范围、安排下一位角色
- 再让前端、后端、QA 依次接力
- 你通过这个真实推进过程，来测试我们的 app 是否真的具备“多角色协作开发软件”的能力

这才是本手册的核心。

---

## 2. 本次测试到底在验证什么

本轮测试验证的不是 Team Templates 功能本身是否已经完成，而是验证下面这件更根本的事：

> **我们的 app 能不能作为一个多角色协作开发环境，真的去推进 `docs/v2/team-templates-next-phase-implementation-plan.md` 这项工作。**

你要测的是 5 件事：

1. 你能不能把这份文档成功交给 app 内的项目经理理解
2. 项目经理能不能基于文档收敛需求、拆分工作、指定下一位角色
3. 不同角色能不能接住上一个角色的上下文，持续推进同一项真实工作
4. handoff 是否像团队分工，而不是随机切换
5. 最终这套流程是否真的像“一支软件团队在开发 Team Templates”

---

## 3. 测试对象是什么

本次测试对象不是泛泛的“模板功能”。

本次测试对象非常明确：

- **主需求文档**：`docs/v2/team-templates-next-phase-implementation-plan.md`
- **开发对象**：Team Templates 下一阶段实现
- **测试方式**：让 app 内团队围绕这份文档真实协作

所以你每一步都要记住：

> 你不是在“让 AI 聊聊天”，你是在“把一份真实实现计划交给团队，然后观察团队是否真的能干活”。

---

## 4. 测试前准备

开始前请确认：

- app 可以正常进入 Task 模式
- 当前版本已经有多角色 task room
- Team Brief 可显示
- handoff confirmation 可工作
- 你可以创建一个包含多个角色的 task

建议本次测试至少建立以下 4 个角色：

1. Product Manager
2. Backend Engineer / Architect
3. Frontend Engineer
4. QA Reviewer

如果你们已有更贴近现有 archetype 的命名，可以用现有名字，只要语义对应即可。

---

## 5. 测试总原则

本轮测试必须按“真实团队协作”方式进行，而不是一次性让单个角色回答完所有内容。

你要遵守 3 个原则：

### 5.1 第一轮必须从项目经理开始

因为这是一份实施计划文档，不应该一上来就让工程角色直接开工。

### 5.2 每一轮只推进一个明确目标

例如：
- 第一轮只让 PM 理解并拆任务
- 第二轮只让后端收敛数据结构和接口
- 第三轮只让前端收敛创建流程与模板预览
- 第四轮只让 QA 输出验收路径

### 5.3 每一轮都尽量通过 handoff 进入下一个角色

不要手动跳得太随意。

如果 AI 给出了合理 handoff 建议，就优先按建议走；如果建议不理想，再人工修改目标角色。

这样才能测出：
- roster 感知是否真实
- handoff 建议是否合理
- 用户确认流程是否有效

---

## 6. 如何建立这个测试 task

## 6.1 建议任务名称

建议你在 app 中创建一个新 task，名称用：

**Implement Team Templates MVP from the next-phase implementation plan**

或中文：

**基于下一阶段实施计划推进 Team Templates MVP 开发**

## 6.2 建议任务说明 / 首次上下文

如果创建 task 时支持输入说明，建议填入类似内容：

```text
This task is for real implementation planning and development of Team Templates in MicroCompany. The team must use docs/v2/team-templates-next-phase-implementation-plan.md as the primary source of truth, then clarify scope, split responsibilities, and produce actionable implementation work across PM, backend, frontend, and QA.
```

中文也可以：

```text
这个 task 用于真实推进 MicroCompany 的 Team Templates 开发。团队必须以 docs/v2/team-templates-next-phase-implementation-plan.md 作为主要需求来源，先澄清范围，再拆分职责，并由 PM、后端、前端、QA 逐步产出可执行实施内容。
```

---

## 7. 第一步：你应该如何把文档介绍给项目经理

这是本手册最关键的一步。

你不要只说一句“你看看这个文档”。

你应该明确告诉项目经理：
- 这是一份当前主开发任务的实施计划
- 你希望他做的不是总结文档，而是把它转成团队可执行工作
- 他必须确定 MVP 范围、主要模块、依赖顺序、下一位负责人

## 7.1 给项目经理的推荐第一条消息

请直接发送下面这段：

```text
Please treat docs/v2/team-templates-next-phase-implementation-plan.md as the primary implementation brief for a real product task. Read it as the source of truth, then do four things: (1) summarize the smallest safe MVP scope, (2) identify the major implementation tracks, (3) explain the dependency order between those tracks, and (4) tell me which teammate should work next first and why.
```

中文版本：

```text
请把 docs/v2/team-templates-next-phase-implementation-plan.md 当作一个真实产品任务的主实施文档来处理。把它作为事实来源，然后完成四件事：（1）总结最小安全 MVP 范围；（2）识别主要实施模块；（3）说明这些模块之间的依赖顺序；（4）告诉我下一步最应该先交给哪个队友以及原因。
```

## 7.2 你要观察什么

项目经理的输出理想上应包含：

- 对文档目标的准确理解
- 没有把范围扩散到模板市场、模板权限、复杂工作流
- 能明确拆出几条实施线，例如：
  - 后端模板数据结构与读取
  - 前端模板选择与预览
  - 创建前确认流程
  - 保存为模板能力
- 能说清先做什么、后做什么
- 能指定一个最合理的下一角色

## 7.3 第一步通过标准

如果项目经理输出后，你感觉：

- 这个人真的理解了文档
- 真的把文档变成了开发工作
- 下一步知道该交给谁

那说明 app 已经通过了最关键的第一关。

---

## 8. 第二步：让项目经理分发给正确的人

项目经理读完文档后，通常最合理的下一位应该是：

- **Backend Engineer / Architect**

原因是这份 plan 的最小闭环通常先从：
- 模板数据结构
- 系统模板读取
- template -> draft 边界
- task / template 解耦

这些后端边界先收清楚，前端 UI 才不会乱。

## 8.1 如果 PM 推荐 Backend

你就按 handoff 流程确认，进入 Backend。

## 8.2 如果 PM 推荐 Frontend

也不是一定错，但你要判断理由是否充分。

只有当 PM 说的是“先用前端交互收敛范围，再反推数据结构”时，这个建议才合理。

否则，一般 Backend 更像第一位工程接手者。

---

## 9. 第三步：你应该如何向 Backend 介绍这个任务

到 Backend 之后，不要让他泛泛谈架构。

你应该明确要求他：
- 以 PM 刚才的拆分为前提
- 以 `docs/v2/team-templates-next-phase-implementation-plan.md` 为主文档
- 只聚焦后端边界
- 给出最小实现方案

## 9.1 给 Backend 的推荐消息

```text
Use the PM summary plus docs/v2/team-templates-next-phase-implementation-plan.md as your working brief. Focus only on backend MVP design for Team Templates. I need you to define: (1) the minimum data model, (2) the boundary between template, draft, and runtime task, (3) the smallest backend commands or APIs we need first, and (4) what frontend should wait for before building the UI.
```

中文版本：

```text
请把 PM 刚才的总结和 docs/v2/team-templates-next-phase-implementation-plan.md 一起作为你的工作输入，只聚焦 Team Templates 的后端 MVP 设计。我需要你定义：（1）最小数据模型；（2）template、draft、runtime task 的边界；（3）第一批最小后端命令或 API；（4）前端在开始做 UI 前，哪些后端边界必须先明确。
```

## 9.2 你要观察什么

Backend 的回答最好能明确：

- `TaskTemplate`
- `TemplateRole`
- `TaskTemplateDraft`
- 系统模板与用户模板的存储差异
- 从模板到 task draft 的转换规则
- 哪些接口应先做
- 哪些复杂能力现在不做

## 9.3 这一步为什么重要

如果 Backend 说不清这几个边界，说明 app 虽然能聊天，但还没形成真实软件开发协作能力。

---

## 10. 第四步：让 Backend 把工作交给 Frontend

当 Backend 收敛完数据模型和接口边界后，下一位通常应该是 Frontend。

因为这时前端需要把这些边界落成可操作的创建流程。

## 10.1 给 Frontend 的推荐消息

```text
Use the PM scope and backend design as your input. Now define the smallest frontend flow for Team Templates in task creation. I need a practical MVP interaction path covering: entry choice (blank vs template), template list, template preview, template-to-draft confirmation, required model completion, and final task creation.
```

中文版本：

```text
请把 PM 的范围结论和 Backend 的设计结论作为输入，定义 Team Templates 在 task 创建中的最小前端流程。我需要一个务实的 MVP 交互路径，至少覆盖：空白创建/模板创建入口、模板列表、模板预览、template 转 draft 的确认界面、模型补全校验，以及最终创建 task。
```

## 10.2 你要观察什么

Frontend 的回答应该：

- 不重做整套架构
- 不跳过创建前确认
- 能把模板选择与模板预览讲清楚
- 能说明哪些部分复用当前 Task Builder
- 能说明 Team Brief 的展示经验如何复用到模板预览

如果 Frontend 开始发散到模板市场、复杂模板管理，就说明角色偏题了。

---

## 11. 第五步：让 Frontend 把工作交给 QA

当 PM、Backend、Frontend 都已经把主方案收敛一轮后，就应该交给 QA / Reviewer。

QA 的任务不是重复设计，而是把前面的产出变成可验证路径。

## 11.1 给 QA 的推荐消息

```text
Use the PM, backend, and frontend outputs plus docs/v2/team-templates-next-phase-implementation-plan.md as your source. Create a practical MVP test checklist for Team Templates. Focus on the real creation flow, invalid/incomplete configurations, template preview clarity, saving task as template, and making sure template-created tasks still work with Team Brief and handoff.
```

中文版本：

```text
请把 PM、Backend、Frontend 的产出以及 docs/v2/team-templates-next-phase-implementation-plan.md 作为输入，输出一份务实的 Team Templates MVP 测试清单。重点覆盖真实创建流程、不完整配置、模板预览是否清晰、保存 task 为模板，以及从模板创建出来的 task 是否仍能正常进入 Team Brief 和 handoff 流程。
```

## 11.2 你要观察什么

QA 输出最好能覆盖：

- 系统模板读取
- 用户模板保存
- 模板选择
- 模板预览
- template -> draft
- provider/model 缺失阻断
- 运行时 task 创建成功
- Team Brief 正常
- handoff 正常

---

## 12. 一条推荐的真实协作顺序

如果你想按最像真实开发团队的方式测，建议按这条顺序走：

1. PM 读取主文档并收敛 MVP 范围
2. PM handoff 给 Backend
3. Backend 收敛数据模型、API、边界
4. Backend handoff 给 Frontend
5. Frontend 收敛创建流程与模板预览
6. Frontend handoff 给 QA
7. QA 输出验收路径与边界测试重点

这是本轮最推荐的主线。

---

## 13. 你在整个过程中要重点测试什么

你每一轮都要同时观察两层东西。

## 13.1 表层：角色输出是否合理

例如：
- PM 有没有收敛范围
- Backend 有没有说清边界
- Frontend 有没有说清流程
- QA 有没有给出测试路径

## 13.2 深层：app 是否真的像团队协作系统

例如：
- 当前角色是否知道自己是谁
- Team Brief 是否帮助理解团队分工
- handoff 是否像真实分工
- 后一个角色是否真的接住了前一个角色的结果
- 你是否感觉在“带一支团队做事”，而不是“分别问了四次 AI”

---

## 14. 失败信号

如果出现下面这些情况，说明 app 还没有通过这轮真实协作测试。

## 14.1 PM 失败信号

- 看不懂文档在说什么
- 把范围扩展到大量非 MVP 内容
- 说不清先做什么后做什么
- 推荐下一个角色明显不合理

## 14.2 Backend 失败信号

- 说不清 template / draft / task 的区别
- 上来就把运行时和模板耦合在一起
- 忽略系统模板和用户模板差异
- 输出过重，像在做平台重构

## 14.3 Frontend 失败信号

- 跳过创建前确认
- 没有模板预览
- 流程设计和当前 Task Builder 完全脱节
- 开始设计复杂模板管理后台

## 14.4 QA 失败信号

- 只写很空的 checklist
- 没覆盖配置缺失、template -> draft、保存模板这些关键路径
- 没有验证模板创建后是否还能进入 Team Brief + handoff 运行时

## 14.5 系统性失败信号

- handoff 推荐像随机的
- 下一个角色接不上前面的上下文
- 你感觉不到团队协作，只是在轮流聊天

---

## 15. 推荐记录方式

建议你边测边记录下面这些内容：

### 15.1 每轮记录
- 当前角色
- 你发给他的消息
- 他给出的核心结论
- 他推荐的下一位角色
- 你是否接受这个 handoff

### 15.2 最终记录
- PM 是否成功把文档转成任务
- Backend 是否成功给出最小后端边界
- Frontend 是否成功给出最小前端流程
- QA 是否成功给出有效测试路径
- 这整条链路是否像真实团队推进开发

---

## 16. 最小执行版脚本

如果你不想看完整说明，只想立刻开始，可以直接按下面脚本执行。

### Step 1：创建 task
任务名：
- `Implement Team Templates MVP from the next-phase implementation plan`

### Step 2：先找 PM
发送：

```text
Please treat docs/v2/team-templates-next-phase-implementation-plan.md as the primary implementation brief for a real product task. Read it as the source of truth, then do four things: (1) summarize the smallest safe MVP scope, (2) identify the major implementation tracks, (3) explain the dependency order between those tracks, and (4) tell me which teammate should work next first and why.
```

### Step 3：如果合理，就 handoff 给 Backend
发送：

```text
Use the PM summary plus docs/v2/team-templates-next-phase-implementation-plan.md as your working brief. Focus only on backend MVP design for Team Templates. I need you to define: (1) the minimum data model, (2) the boundary between template, draft, and runtime task, (3) the smallest backend commands or APIs we need first, and (4) what frontend should wait for before building the UI.
```

### Step 4：再 handoff 给 Frontend
发送：

```text
Use the PM scope and backend design as your input. Now define the smallest frontend flow for Team Templates in task creation. I need a practical MVP interaction path covering: entry choice (blank vs template), template list, template preview, template-to-draft confirmation, required model completion, and final task creation.
```

### Step 5：最后 handoff 给 QA
发送：

```text
Use the PM, backend, and frontend outputs plus docs/v2/team-templates-next-phase-implementation-plan.md as your source. Create a practical MVP test checklist for Team Templates. Focus on the real creation flow, invalid/incomplete configurations, template preview clarity, saving task as template, and making sure template-created tasks still work with Team Brief and handoff.
```

---

## 17. 一句话总结

这轮测试的核心不是“看 AI 能不能答题”，而是：

> **把 `docs/v2/team-templates-next-phase-implementation-plan.md` 当成一项真实研发任务，交给 MicroCompany 里的项目经理、后端、前端、QA 依次推进，并通过这条真实协作链路来验证我们的 app 是否真的具备“用团队来开发软件”的能力。**
