# 多 Agent 协作编排系统 - 最终愿景

## 1. 系统概述

将当前的单 Session AI 对话应用升级为**多 Agent 协作编排系统**,模拟真实软件开发团队的工作流程。

## 2. 核心角色

- **项目经理 (PM)**: 需求分析、任务分解、进度跟踪、结果汇总
- **开发人员 (Developer)**: 编写代码实现
- **评审员 (Reviewer)**: 代码评审、方案评审
- **测试人员 (Tester)**: 测试验证

每个角色可配置独立的大模型 (Provider + Model) 和专属的 System Prompt。

## 3. 工作流程示例

```
用户: "实现登录功能"
  ↓
Alice (PM): 分析需求 → 生成开发文档
  ↓
用户确认方案
  ↓
Alice 调度 Bob (Developer): 编写开发计划
  ↓
Bob 完成 → 汇报给 Alice
  ↓
Alice 调度 Clark (Reviewer): 评审开发计划
  ↓
Clark 发现问题 → 反馈给 Alice
  ↓
Alice 转发给 Bob → Bob 修改
  ↓
Bob 修改完成 → 汇报给 Alice
  ↓
Alice 再次调度 Clark → 评审通过
  ↓
Alice 调度 Dark (Developer): 开始开发
  ↓
Dark 开发完成 → 汇报给 Alice
  ↓
Alice 调度 Bob & Clark → 代码评审
  ↓
评审通过 → Alice 汇报给用户
  ↓
用户手动测试 → 反馈问题或确认完成
```

## 4. 核心功能

### 4.1 团队配置
- 可视化配置团队成员(角色、模型、Prompt)
- 支持添加/删除/编辑角色
- 支持导入/导出团队配置
- 支持预设团队模板

### 4.2 Session 层级
- **主 Session**: 用户直接交互的对话窗口,由 PM 角色担任
- **子 Session**: 由主 Session 创建和管理,每个对应一个特定角色
- 每个 Session 拥有独立的对话历史和上下文

### 4.3 消息路由
- 用户 → 主 Session
- 主 Session → 子 Session (任务分配)
- 子 Session → 主 Session (结果汇报)
- 主 Session 在子 Session 之间转发消息

### 4.4 工作流编排
- 串行执行: A 完成后执行 B
- 并行执行: A 和 B 同时执行
- 条件分支: 如果评审通过则继续,否则返回修改
- 循环迭代: 评审-修改-再评审

### 4.5 上下文管理
- 主 Session 维护全局上下文
- 子 Session 接收必要的上下文
- 支持上下文压缩,避免 Token 消耗过大

## 5. UI 界面

### 5.1 团队配置界面
```
┌─────────────────────────────────────────────┐
│  Team Configuration                          │
├─────────────────────────────────────────────┤
│  Team Name: [Standard Dev Team        ]     │
│  Description: [A standard software...  ]     │
│                                              │
│  Roles:                                      │
│  ┌────────────────────────────────────────┐ │
│  │ ✓ Alice (Project Manager)             │ │
│  │   Provider: Claude · Model: Opus 4.7  │ │
│  │   [Edit] [Remove]                     │ │
│  ├────────────────────────────────────────┤ │
│  │ ✓ Bob (Developer)                     │ │
│  │   Provider: Claude · Model: Sonnet 4.6│ │
│  │   [Edit] [Remove]                     │ │
│  ├────────────────────────────────────────┤ │
│  │ ✓ Clark (Reviewer)                    │ │
│  │   Provider: OpenAI · Model: GPT-4     │ │
│  │   [Edit] [Remove]                     │ │
│  └────────────────────────────────────────┘ │
│  [+ Add Role]                                │
│                                              │
│  [Save Team] [Cancel]                        │
└─────────────────────────────────────────────┘
```

### 5.2 主对话界面
```
┌─────────────────────────────────────────────────────────────┐
│  Sessions  │  Chat (Alice - PM)  │  Sub-Tasks  │  Workflow  │
├────────────┼─────────────────────┼─────────────┼────────────┤
│            │                     │             │            │
│  Session 1 │  User: 实现登录功能  │  Bob        │  ① 需求分析│
│  Session 2 │  Alice: 好的,我来   │  Status: ✓  │  ② 开发计划│
│            │  分析需求...         │  Task: 编写  │  ③ 代码实现│
│            │                     │  开发计划    │  ④ 代码评审│
│            │  Alice: Bob 已完成   │             │  ⑤ 测试验证│
│            │  开发计划,现在让    │  Clark      │            │
│            │  Clark 评审...       │  Status: ⏳ │            │
│            │                     │  Task: 评审  │            │
│            │                     │  开发计划    │            │
│            │                     │             │            │
│            ├─────────────────────┤             │            │
│            │ [Input Box]         │             │            │
└────────────┴─────────────────────┴─────────────┴────────────┘
```

## 6. 技术架构

### 6.1 核心模块
- **TeamManager**: 团队配置管理
- **SessionManager**: Session 生命周期管理
- **MessageRouter**: 消息路由
- **OrchestrationEngine**: 编排引擎
- **WorkflowExecutor**: 工作流执行器

### 6.2 数据存储
- 团队配置: `~/.microcompany/teams/{team_id}.json`
- 主 Session: `~/.microcompany/master_sessions/{session_id}.json`
- 消息历史: 复用现有的 `ConversationStorage`

### 6.3 向后兼容
- 保留现有的单 Session 模式
- 新增编排模式,通过新的 Tauri Commands 暴露
- 用户可以选择使用单 Session 或多 Agent 模式

## 7. 验收标准

1. 用户可以配置一个包含 4 个角色的开发团队
2. 用户可以通过主 Session 发起一个开发任务
3. 系统自动按照工作流编排,依次调度各个角色完成任务
4. 用户可以在 UI 中看到完整的任务流转过程
5. 所有对话历史可以追溯和导出
6. 系统在子 Session 失败时能够优雅降级或重试
