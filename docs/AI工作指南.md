# AI 工作指南

## ⚠️ 重要提示

**本文档是所有 AI 助手在开始 MicroCompany 项目工作前的必读文档。**

如果你是 AI 助手,在执行任何开发任务之前,请仔细阅读本指南。

---

## 1. 项目概述

MicroCompany 是 Claurst (Claude Code 的 Rust 实现) 的图形界面版本。

**核心原则:**
- 基于 Claurst crates 构建
- 使用 Tauri 2.0 + React + TypeScript
- 遵循 UI First → Interface First → Module First 开发方法

**关键文档:**
- [需求文档](需求文档.md) - 产品定义和功能范围
- [技术文档](技术文档.md) - 技术方案和实现细节
- [开发计划](开发计划.md) - 详细的开发任务和进度跟踪

---

## 2. 🎨 UI 开发强制要求

### 2.1 必须使用 UI/UX Pro Max Skill

**规则: 所有 UI 相关的开发工作必须使用 `/ui-ux-pro-max` skill**

这不是建议,而是**强制要求**。

**什么是 UI/UX Pro Max Skill:**
- GitHub: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- 专业的 UI/UX 设计和开发 skill
- 确保界面设计的专业性和一致性

### 2.2 何时使用这个 Skill

**必须使用的场景:**

1. **UI 设计阶段**
   - 设计界面布局
   - 设计交互流程
   - 创建原型图
   - 定义颜色方案和字体

2. **UI 开发阶段**
   - 创建 React 组件
   - 实现界面布局
   - 实现交互逻辑
   - 处理响应式设计

3. **UI 优化阶段**
   - 优化加载状态
   - 设计错误提示
   - 优化交互细节
   - 改进用户体验

**示例:**

```
❌ 错误做法:
"我来创建 ChatInterface 组件..."
[直接开始写代码]

✅ 正确做法:
"我需要创建 ChatInterface 组件,让我使用 /ui-ux-pro-max skill..."
[调用 skill 进行设计和开发]
```

### 2.3 开发计划中的 UI 任务

在 [开发计划](开发计划.md) 中,以下任务**必须**使用 `/ui-ux-pro-max` skill:

**阶段 1: UI 设计和原型 (第 1-2 天)**
- 任务 1.1: 设计主界面布局
- 任务 1.2: 设计交互流程
- 任务 1.3: 创建静态 React 组件
- 任务 1.4: 使用假数据验证 UI

**阶段 6: 完善体验 (第 10-12 天)**
- 任务 6.3: 优化加载状态
- 任务 6.4: 完善错误处理
- 任务 6.6: 用户体验优化

---

## 3. 开发方法论

### 3.1 UI First (面向 UI 开发)

**原则: 先确定产品的样子,用 UI 约束代码的接口和功能边界**

**步骤:**
1. 使用 `/ui-ux-pro-max` skill 设计完整的 UI 界面
2. 定义所有用户交互流程
3. 根据 UI 需求推导接口定义
4. 接口只实现 UI 需要的功能,不多不少

**为什么:**
- UI 是用户直接接触的部分,决定了产品的边界
- 先定义 UI 可以避免实现不必要的功能
- UI 驱动接口设计,确保接口符合实际需求

### 3.2 Interface First (面向接口开发)

**原则: 先定义接口,每个接口对应一个 Mock 实现**

**步骤:**
1. 根据 UI 需求定义所有接口
2. 为每个接口创建 Mock 实现 (返回假数据)
3. 前端使用 Mock 接口完成 UI 开发
4. 逐个替换 Mock 为真实实现

**为什么:**
- 前后端可以并行开发
- 接口定义清晰,职责明确
- 可以先完成 UI,验证交互流程
- 降低前后端耦合

### 3.3 Module First (模块化开发)

**原则: 所有模块独立并行,每个模块是一个具体功能接口的真实实现**

**模块划分:**
- **前端模块**: ChatInterface, MessageList, InputBox, Toolbar
- **接口模块**: Tauri Commands (session, message, history)
- **核心模块**: ClaurstWrapper, ConfigManager, SessionManager

**为什么:**
- 降低复杂度
- 提高可维护性
- 方便并行开发
- 易于测试和替换

---

## 4. 代码规范

### 4.1 前端代码 (React + TypeScript)

**组件结构:**
```typescript
// src/components/ComponentName.tsx
import React from 'react';

interface ComponentNameProps {
  // 明确的 props 类型定义
}

export function ComponentName({ ...props }: ComponentNameProps) {
  // 组件实现
}
```

**Hooks 使用:**
```typescript
// src/hooks/useFeature.ts
import { useState, useCallback } from 'react';

export function useFeature() {
  // Hook 实现
  return {
    // 返回值
  };
}
```

### 4.2 后端代码 (Rust)

**Tauri Commands:**
```rust
// src-tauri/src/commands/module.rs
use tauri::State;
use crate::core::state::AppState;

#[tauri::command]
pub async fn command_name(
    param: String,
    state: State<'_, AppState>,
) -> Result<ReturnType, String> {
    // 命令实现
}
```

**错误处理:**
- 使用 `Result<T, String>` 返回错误
- 错误信息要清晰,帮助用户理解问题
- 记录详细的错误日志

### 4.3 类型定义

**保持一致:**
- TypeScript 和 Rust 的类型定义要一致
- 使用 `serde` 进行序列化/反序列化
- 在 `src/types/index.ts` 和 `src-tauri/src/core/types.rs` 中定义共享类型

---

## 5. 工作流程

### 5.1 开始新任务

1. **阅读相关文档**
   - 查看 [开发计划](开发计划.md) 确定当前任务
   - 阅读 [需求文档](需求文档.md) 理解需求
   - 查看 [技术文档](技术文档.md) 了解技术方案

2. **确认任务类型**
   - 如果是 UI 任务 → **必须使用 `/ui-ux-pro-max` skill**
   - 如果是接口任务 → 先定义接口,再实现 Mock
   - 如果是核心模块 → 独立开发,通过接口通信

3. **执行任务**
   - 遵循开发方法论 (UI First → Interface First → Module First)
   - 保持代码简洁,不添加不必要的功能
   - 及时更新开发计划中的任务状态

4. **完成任务**
   - 测试功能是否正常
   - 更新文档 (如果需要)
   - 在开发计划中标记任务为完成

### 5.2 遇到问题

1. **技术问题**
   - 查看 [技术文档](技术文档.md) 的"关键技术挑战"章节
   - 查看 Claurst 源码和文档
   - 记录问题到开发计划的"风险和应对"章节

2. **需求不明确**
   - 查看 [需求文档](需求文档.md)
   - 询问用户获取更多信息
   - 不要自行添加未定义的功能

3. **UI 设计问题**
   - **使用 `/ui-ux-pro-max` skill 寻求帮助**
   - 参考需求文档中的界面设计
   - 保持界面简洁,不添加不必要的元素

---

## 6. 质量标准

### 6.1 代码质量

- ✅ 类型安全 (TypeScript 和 Rust 的类型系统)
- ✅ 错误处理完善
- ✅ 代码简洁易读
- ✅ 适当的注释 (解释"为什么",不是"是什么")
- ✅ 遵循项目的代码规范

### 6.2 功能质量

- ✅ 功能符合需求文档的定义
- ✅ 所有交互流程正常工作
- ✅ 错误情况有合理的提示
- ✅ 性能流畅,无明显卡顿
- ✅ 边界情况处理正确

### 6.3 UI 质量

- ✅ 界面符合设计稿
- ✅ 交互流畅自然
- ✅ 响应式布局正常
- ✅ 加载状态清晰
- ✅ 错误提示友好

---

## 7. 不要做的事情

### 7.1 功能范围

❌ **不要添加需求文档中未定义的功能**
- 不要添加多标签页 (MVP 不做)
- 不要添加配置编辑器 (MVP 不做)
- 不要添加插件系统 (MVP 不做)

❌ **不要修改 Claurst 源码**
- 只引用 Claurst crates,不修改
- 如果需要新功能,通过封装实现

❌ **不要重新实现 Claurst 的功能**
- AI 对话逻辑 → 使用 Claurst
- 工具调用 → 使用 Claurst
- 配置管理 → 使用 Claurst

### 7.2 开发方式

❌ **不要跳过 UI 设计直接写代码**
- 必须先设计 UI,再实现功能
- 使用 `/ui-ux-pro-max` skill 进行 UI 设计

❌ **不要跳过 Mock 实现直接写真实实现**
- 必须先实现 Mock,验证接口
- 前端先用 Mock 完成 UI

❌ **不要创建紧耦合的模块**
- 模块之间通过接口通信
- 保持模块独立性

### 7.3 代码质量

❌ **不要写不安全的代码**
- 正确处理错误
- 验证用户输入
- 避免内存泄漏

❌ **不要写过度复杂的代码**
- 保持简洁
- 不要过早优化
- 不要添加不必要的抽象

---

## 8. 检查清单

在完成任务前,请检查:

### UI 任务检查清单

- [ ] 是否使用了 `/ui-ux-pro-max` skill?
- [ ] UI 是否符合需求文档的设计?
- [ ] 所有交互状态是否都考虑到了? (加载、错误、成功)
- [ ] 响应式布局是否正常?
- [ ] 是否测试了假数据?

### 接口任务检查清单

- [ ] 接口定义是否清晰?
- [ ] TypeScript 和 Rust 类型是否一致?
- [ ] 是否实现了 Mock 版本?
- [ ] Mock 数据是否合理?
- [ ] 错误处理是否完善?

### 核心模块检查清单

- [ ] 模块职责是否单一?
- [ ] 是否通过接口与其他模块通信?
- [ ] 错误处理是否完善?
- [ ] 是否有单元测试?
- [ ] 是否正确处理异步操作?

### 通用检查清单

- [ ] 代码是否符合规范?
- [ ] 是否有适当的注释?
- [ ] 是否更新了相关文档?
- [ ] 是否在开发计划中标记任务完成?
- [ ] 是否测试了功能?

---

## 9. 快速参考

### 常用命令

```bash
# 启动开发服务器
npm run tauri dev

# 构建应用
npm run tauri build

# 运行测试
cargo test

# 格式化代码
cargo fmt
npm run format
```

### 常用路径

```
前端代码: src/
后端代码: src-tauri/src/
文档: docs/
Claurst: claurst/src-rust/crates/
```

### 关键文件

```
需求文档: docs/需求文档.md
技术文档: docs/技术文档.md
开发计划: docs/开发计划.md
AI 工作指南: docs/AI工作指南.md (本文档)
```

---

## 10. 总结

**记住这三点:**

1. **所有 UI 开发必须使用 `/ui-ux-pro-max` skill** ⭐
2. **遵循 UI First → Interface First → Module First 开发方法**
3. **保持简单,不添加不必要的功能**

**开始工作前:**
- 阅读本指南
- 查看开发计划确定当前任务
- 理解需求和技术方案

**工作过程中:**
- 遵循开发方法论
- 使用正确的工具 (特别是 UI/UX skill)
- 及时更新任务状态

**完成任务后:**
- 检查质量标准
- 更新文档
- 标记任务完成

---

**祝你工作顺利! 🚀**

如果有任何疑问,请查看相关文档或询问用户。

---

**最后更新**: 2026-04-13  
**文档版本**: 1.0  
**维护者**: MicroCompany Team
