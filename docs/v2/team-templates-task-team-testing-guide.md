# Team Templates 功能开发任务团队测试手册

**文档版本**: v1.0  
**创建日期**: 2026-04-29  
**项目**: MicroCompany  
**文档性质**: 真实需求驱动的测试手册

---

## 1. 文档目的

本文档不是单纯的功能验收清单，而是一份**用真实产品需求来驱动 Team Templates 功能开发与测试的任务手册**。

目标是让你们在现有 app 里：

1. 先建立一个真正可运行的多角色 task 团队
2. 用这个团队去协作设计 **Team Templates** 功能
3. 在协作过程中顺手验证当前 MVP 能力是否足够支撑下一阶段开发

也就是说，这份文档要解决的是：

> **如何让我们的 app 先用“真实的 Team Templates 需求”跑起来，再用这个真实任务去测试 Team Brief、PM-first、handoff confirmation 和多角色接力是否成立。**

---

## 2. 这次测试到底在测什么

本轮测试不是在直接测试“模板功能是否已经完成”，而是在测试当前这套 Task Room MVP 是否已经足够成为 Team Templates 开发的工作底座。

你们需要验证 4 件事：

### 2.1 能不能先把一个合理的 task 团队搭起来

也就是：
- task 创建是否顺畅
- 团队 seat 是否清晰
- 每个角色是否有明确职责

### 2.2 Team Brief 能不能像“模板预览”一样工作

也就是：
- 用户进入 task room 后，能否快速理解这个团队里有谁
- 每个角色负责什么
- 常见 handoff 去向是什么

### 2.3 AI handoff 能不能像“协作建议”而不是“自动编排”

也就是：
- AI 是否会在合适时机建议交接
- 推荐对象是否真实存在于 roster 中
- 最终是否仍然由用户决定交给谁

### 2.4 这套运行时体验是否适合未来抽象成 Team Templates

也就是：
- 当前团队配置是否足够稳定，能沉淀成模板
- 当前协作路径是否有机会成为模板默认工作流
- 当前 task room 是否已经像“模板实例运行界面”

---

## 3. 推荐测试思路

不要拿一个随便的 bugfix 去测。

最好直接创建一个**真实产品需求任务**，让团队围绕这个需求协作：

> **开发 Team Templates 功能本身**

这样测试最有价值，因为：

- 任务本身是真实需求，不是假设题
- 多角色协作路径天然明确
- 很容易观察 handoff 是否合理
- 测出来的问题能直接反哺下一阶段设计

---

## 4. 推荐测试任务

建议在 app 里新建一个 task，任务主题直接设为：

## 4.1 推荐英文任务文案

```text
Build an MVP for Team Templates so users can create reusable multi-role task setups. Clarify what a template should contain, how users select one during task creation, how template roles become task roles, and what the safest MVP scope is.
```

## 4.2 推荐中文任务文案

```text
为 Team Templates 设计并推进一个 MVP，让用户可以复用多角色任务配置。请明确模板应包含哪些信息、用户在创建 task 时如何选择模板、模板角色如何转换为 task 角色，以及最安全的 MVP 范围是什么。
```

这条任务适合拿来做主流程测试，因为它天然覆盖：
- 产品定义
- 团队结构
- 模板字段设计
- 创建流程
- 前后端协作
- 测试策略

---

## 5. 建议建立的 task 团队

为了让 Team Templates 的需求推进更贴近真实开发，建议至少建立以下角色。

## 5.1 最小推荐团队

### 1) Product Manager
职责：
- 收敛 MVP 范围
- 定义模板的核心价值
- 确定必须做与暂不做的部分
- 指定下一位最适合接手的角色

### 2) Frontend Engineer / UX Engineer
职责：
- 设计“从模板创建 task”的交互流程
- 定义模板选择、预览、创建前确认界面
- 评估 Task Builder 与 Task Room 的前端改动范围

### 3) Backend Engineer / Architect
职责：
- 设计 TaskTemplate / TemplateRole 数据结构
- 明确模板与 runtime task / role / session 的边界
- 设计最小 API 与存储策略

### 4) QA / Reviewer
职责：
- 设计主流程与边界用例
- 验证模板创建、模板选择、配置补全、handoff 与回归风险
- 帮助发现“看起来能跑，但真实使用会出问题”的地方

## 5.2 可选增强角色

如果你们希望更像真实团队，可以再加：

### 5) Design / UX Strategist
职责：
- 从信息架构和用户理解角度判断模板是否容易选择
- 评估 Team Brief 是否可以自然过渡成模板预览

### 6) Tech Lead / System Designer
职责：
- 审查前后端边界是否过重
- 防止模板能力把现有 task 系统搞复杂

---

## 6. 为什么这组团队适合测试 Team Templates

因为它几乎和真实开发 Team Templates 的协作链条一致：

- PM 先定义目标与范围
- 前端负责用户怎么选模板、怎么确认角色配置
- 后端负责模板怎么存、怎么读、怎么转成 task
- QA 负责把流程变成可验证的验收路径

如果当前 app 的 task 团队机制能把这件事顺畅跑通，就说明：

> **它已经不是一个抽象 demo，而是一个可以承载真实产品开发协作的运行环境。**

---

## 7. 建议的测试前提

开始测试前，确认以下条件成立：

- app 可以正常启动
- 能进入 Task 模式
- 能创建多角色 task
- 角色 roster 中至少包含 PM、前端、后端、QA 这几类角色
- 当前代码已包含 Team Brief 与 handoff confirmation 的最新实现

---

## 8. 如何在 app 里建立这个 task 团队

本节就是最核心的“怎么做”。

## 8.1 创建一个新的 task

在 app 中点击创建 task，使用第 4 节提供的任务文案。

### 目标
不是随便创建一个 task，而是创建一个：

> **专门用于开发 Team Templates 功能的真实需求 task**

## 8.2 配置团队角色

在创建阶段，尽量让角色命名贴近真实职责，例如：

- Product Manager
- Frontend Engineer
- Backend Engineer
- QA Reviewer

如果你们现有 archetype 命名不同，也可以用语义接近的角色，只要职责能对应上即可。

## 8.3 如果启用了 PM-first，就从 PM 开始

这类任务非常适合 PM-first，因为 Team Templates 本身是一个产品能力，不应该直接让工程角色盲目开工。

进入 task room 后，优先确认：
- PM-first banner 是否出现
- PM seat 是否带有 Start here 提示
- 当前选中 PM 时，视觉高亮是否清楚

---

## 9. 第一轮真实需求测试：让 PM 先定义任务

建议给 PM 发送下面这段话。

## 9.1 推荐首轮提示词

```text
Please treat this as a real Team Templates MVP product task. Define the smallest safe scope, explain what information a team template must include, and tell me which teammate should work next and why.
```

中文版本：

```text
请把这当作一个真实的 Team Templates MVP 产品任务。先定义最小安全范围，说明一个团队模板至少必须包含哪些信息，并告诉我下一步最适合交给哪个队友以及原因。
```

## 9.2 你要观察什么

PM 的回复最好能回答：

- Team Templates 这个 MVP 到底解决什么问题
- 模板至少要存什么
- 哪些能力暂时不做
- 下一位应该是谁
- 为什么要交给这个角色

## 9.3 这一步测试的意义

如果 PM 能稳定给出这些内容，说明：
- PM-first 流程是有价值的
- 当前 task 团队可以先做产品收敛
- handoff 建议有机会变得真实而不是随机

---

## 10. 第二轮真实需求测试：验证 Team Brief

在 PM 回复之后，不要急着继续聊天，先检查 Task Room 中的 Team Brief。

## 10.1 你要检查的内容

对于每个角色，确认 Team Brief 至少能表达：

- 这个角色是谁
- 这个角色主要负责什么
- 这个角色通常会把工作交给谁

## 10.2 你要用“模板视角”来判断

这里不要只问“显示出来了没有”，而要问：

> **如果未来把这组角色保存成一个 Team Template，这块 Team Brief 看起来像不像模板预览？**

如果答案接近“像”，那说明方向是对的。

## 10.3 通过标准

用户进入 task room 后，应当能在 10 秒内回答：

- 这个团队里有谁
- 每个人负责什么
- 这个团队大概怎么协作

---

## 11. 第三轮真实需求测试：验证 AI handoff 建议

如果 PM 的回复认为该交接给其他角色，系统应该出现 handoff 确认 UI。

## 11.1 你要检查的内容

### 聊天正文
- 不应出现 `[HANDOFF]` 一类机器标记
- 不应看到结构化协议残留

### 交接 UI
- 应该出现交接确认入口或弹窗
- 应默认选中 AI 推荐的角色
- 应能看到推荐原因或交接草稿
- 用户必须可以修改目标角色

## 11.2 通过标准

handoff 应表现为：

> **AI 提建议，用户做决定，系统执行用户选择。**

而不是：

- AI 自动切换角色
- AI 推荐了不存在的人
- AI 推荐了自己

---

## 12. 第四轮真实需求测试：继续推进 Team Templates 方案

当 PM 提出下一位角色后，继续让那个角色接力做真实需求推进。

下面给出两种最推荐的路径。

## 12.1 路径 A：PM → Frontend → Backend → QA

适合先从用户体验切入。

### 给 Frontend 的推荐提示词

```text
Based on the PM scope, propose the smallest UI flow for Team Templates during task creation. Explain how template selection, template preview, and pre-create role confirmation should work.
```

中文版本：

```text
基于 PM 刚才收敛的范围，请给出 Team Templates 在创建 task 时的最小前端交互流程，说明模板选择、模板预览、创建前角色确认应该如何工作。
```

### 你要观察

- 前端角色是否承接了 PM 的上下文
- 是否围绕自己的职责输出
- 是否会建议下一个合理角色，例如 Backend

---

## 12.2 路径 B：PM → Backend → Frontend → QA

适合先从数据模型切入。

### 给 Backend 的推荐提示词

```text
Based on the PM scope, define the smallest backend design for Team Templates: what data should be stored, what can remain computed, and what API surface is enough for MVP.
```

中文版本：

```text
基于 PM 刚才收敛的范围，请定义 Team Templates 的最小后端设计：哪些数据需要持久化，哪些可以继续计算生成，以及 MVP 至少需要哪些 API。
```

### 你要观察

- 后端角色是否能说清 Template 与 Task 的边界
- 是否避免过度设计
- 是否会把工作交给前端或 QA

---

## 13. 第五轮真实需求测试：验证用户可控的 handoff

无论 AI 推荐谁，你都应该至少手动改一次目标角色。

## 13.1 推荐操作

例如：
- AI 默认推荐 Frontend
- 你手动改成 Backend
- 然后确认 handoff

## 13.2 你要验证的事情

- 系统是否允许改目标角色
- forward 是否按你选的角色执行
- 当前焦点是否切到新角色 session
- Team Brief 中 Current seat 是否同步变化

## 13.3 为什么这步很重要

因为未来做 Team Templates 时，模板大概率会提供推荐协作路径，但：

> **推荐流程不能变成强制流程。**

当前这步测的其实就是下阶段模板工作流的安全边界。

---

## 14. 第六轮真实需求测试：让 QA 从真实需求角度收尾

建议最终把任务交给 QA / Reviewer，让其站在真实功能交付的角度给出验收建议。

## 14.1 给 QA 的推荐提示词

```text
Please review this Team Templates MVP discussion and produce a practical test checklist. Focus on template selection, role configuration confirmation, incomplete model settings, template-to-task conversion, and handoff safety.
```

中文版本：

```text
请基于前面的 Team Templates MVP 讨论，输出一份务实的测试清单，重点覆盖模板选择、角色配置确认、模型未补全、模板转 task，以及 handoff 安全性。
```

## 14.2 你要观察

- QA 是否能基于前面多角色产出继续工作
- QA 是否指出真实边界场景
- 整个团队是否形成了一条完整协作链路

---

## 15. 主流程通过标准

如果下面这些大部分都成立，就说明这套 MVP 已经可以拿来支撑 Team Templates 下一阶段开发。

## 15.1 Task 团队建立成功

- 能顺利创建多角色 task
- seat 清晰可见
- 当前角色明确

## 15.2 Team Brief 有价值

- 能看懂 roster
- 能看懂角色职责
- 能看懂推荐协作关系
- 看起来已经像模板预览的雏形

## 15.3 PM-first 有价值

- PM 能先收敛范围
- 能明确下一步该谁接手
- 不会一开始就让工程角色在模糊需求上乱跑

## 15.4 Handoff 是安全的

- AI 推荐对象是 roster 内真实角色
- 用户可以修改推荐目标
- 系统不会自动跳转而绕过确认
- 切换后 session / role 状态一致

## 15.5 协作像真的开发过程

- 每个角色不是各说各话
- 前一个角色的输出能被下一个角色承接
- 整体看起来像一支小团队在推进真实需求

---

## 16. 重点失败信号

测试过程中，如果出现以下情况，需要重点记录。

## 16.1 团队建立失败

- task 创建后角色不完整
- roster 混乱，角色定位不清
- PM-first 不明显或不起作用

## 16.2 Team Brief 不足以支撑模板思维

- 只有角色名，没有职责说明
- next teammates 信息明显不合理
- 切换 task 后 Team Brief 不更新
- 当前 seat 高亮与实际 session 不一致

## 16.3 Handoff 不可信

- 聊天正文出现机器标记
- 推荐目标是自己
- 推荐目标不在团队里
- 明明建议了交接却不出现确认 UI
- 改了目标角色，但执行时没有尊重用户选择

## 16.4 对 Team Templates 没有真实帮助

- 跑完一轮后，仍然无法回答模板该存什么
- 无法回答模板创建流程该怎么设计
- 无法判断 Team Brief 能否演进成模板预览
- 无法判断 handoff 逻辑能否演进成模板工作流建议

---

## 17. 建议的完整测试顺序

如果你只想按一条最有价值的路径来测，建议按下面顺序执行：

1. 创建一个以 Team Templates MVP 为主题的多角色 task
2. 配置 PM、Frontend、Backend、QA 四个核心角色
3. 进入 task room，确认 Team Brief 可见
4. 从 PM 开始，让其定义最小范围和模板核心字段
5. 检查是否出现合理 handoff 建议
6. 打开 handoff 确认 UI，并至少手动改一次目标角色
7. 切到新角色后，让其继续推进真实需求
8. 再完成一到两轮 handoff
9. 最后交给 QA 输出测试重点与边界风险
10. 回看整个过程，判断它是否已经像未来 Team Templates 的真实开发工作流

---

## 18. 测试结论应该回答的 3 个核心问题

测试结束后，请重点回答下面 3 个问题。

### 问题 1

**当前 Team Brief 是否已经可以当作未来 Team Template 的预览雏形？**

### 问题 2

**当前 AI handoff + 用户确认机制，是否已经可以当作未来模板工作流建议的安全基础？**

### 问题 3

**当前 task room 是否已经足够承载“开发 Team Templates 这种真实需求”的多人协作？**

如果这 3 个问题大体都能回答“可以”，那就说明：

> **你们可以进入 Team Templates 下一阶段，把当前 task 团队运行时体验抽象成可复用模板能力。**

---

## 19. 推荐的测试结果记录格式

建议测试完成后，按下面格式记录结果。

```md
# Team Templates 真实需求测试结果

## 1. 主流程结果
- Task 创建：通过 / 失败
- Team Brief 展示：通过 / 失败
- PM-first 起步：通过 / 失败
- AI handoff 建议：通过 / 失败
- 用户确认 handoff：通过 / 失败
- role / session 切换：通过 / 失败

## 2. 最明显的 3 个问题
- 问题 1：
- 问题 2：
- 问题 3：

## 3. 对 Team Templates 下一阶段的判断
- Team Brief 是否已经像模板预览：是 / 否
- handoff 是否已经像模板工作流建议：是 / 否
- 当前 task room 是否足够承载真实模板开发协作：是 / 否

## 4. 建议下一步优先做什么
- 模板数据结构
- 模板选择 UI
- 模板创建前确认流程
- 模板保存/复用能力
- 模板默认协作流设计
```

---

## 20. 一句话总结

如果你们想用最真实、最不空转的方式测试当前 app，那就不要只测 UI 有没有显示出来，而是：

> **真的在 app 里拉起一个围绕 Team Templates 功能开发的 task 团队，让 PM、前端、后端、QA 依次协作，并用这条真实需求链路来检验 Team Brief、handoff 和 task room 是否已经具备下一阶段演进价值。**
