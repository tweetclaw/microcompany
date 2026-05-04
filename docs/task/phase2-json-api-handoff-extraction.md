# 开发任务：阶段 2 - JSON API Handoff 提取实现

**任务编号**: Phase 2  
**创建日期**: 2026-05-04  
**预计工期**: 2-3 天  
**前置依赖**: 代码清理已完成  
**后续任务**: Phase 3 - UI 实现

---

## 1. 任务目标

实现独立的 JSON API 端点，用于从 AI 对话中提取和结构化 handoff 内容。

### 核心价值

> **将 AI 的自然语言 handoff 意图转换为结构化数据，为 UI 层提供准确的任务摘要和角色推荐。**

---

## 2. 技术要求

### 2.1 观察者架构

#### 系统模式说明

当前系统有两种 AI 模式：

**Normal AI 模式**：
- 单个对话框
- 一个 AI session
- 用户直接与 AI 对话完成任务

**Task AI 模式**：
- 多个 AI session 协作
- 每个 session 代表一个角色（如产品经理、开发工程师、测试工程师）
- 角色之间需要交接任务（handoff）

#### 观察者角色

在 **Task AI 模式**下，增加一个**观察者（Observer）**：
- 观察者不是团队中的角色
- 它是系统级功能，负责监听 AI 对话结束
- 调用独立的 JSON API 提取 handoff 信息
- 帮助调度任务在角色之间转发

#### 调用时机

**观察者应该在以下情况调用**：
- ✅ AI 在 Task 模式下完成一次回复（有文本内容）
- ❌ 用户手动触发交接
- ❌ AI 回复只包含工具调用，没有文本

**调用频率**：几乎每次 AI 回复都需要调用

**场景分析**：

| 场景 | AI 回复示例 | 观察者行为 | 是否调用 |
|------|------------|-----------|---------|
| AI 继续工作 | "我需要更多信息，请提供用户画像。" | 提取 `has_handoff: false` | ✅ 需要 |
| AI 完成并建议交接 | "需求分析完成，建议交接给开发工程师。" | 提取 `has_handoff: true` | ✅ 需要 |
| 用户手动触发 | 用户点击"转发"按钮 | 不需要提取 | ❌ 不需要 |
| AI 回复很短 | "明白了。" | 提取 `has_handoff: false` | ✅ 需要 |
| 只有工具调用 | 只调用 Read 工具，无文本 | 无内容可分析 | ❌ 不需要 |

**理由**：
1. 无法预先知道 AI 是否有交接意图
2. 即使回复很短，也可能包含交接信号
3. 准确性优先，不应该用启发式规则跳过调用

### 2.2 Provider 配置设计

#### 简化方案（MVP）

为了快速验证功能可行性，观察者直接使用 **Normal AI 模式的默认 provider 配置**。

**实现方式**：
```
观察者调用 API 时
    ↓
读取 Normal AI 模式的默认 provider 配置
    ↓
使用该配置调用 JSON API
```

**优点**：
1. **实现简单**：无需额外配置系统
2. **快速验证**：专注于核心功能验证
3. **可扩展**：后续可根据需要增加独立配置

**配置来源**：
- Provider: 从 Normal AI 默认配置读取
- Model: 从 Normal AI 默认配置读取
- API Key: 从 Normal AI 默认配置读取
- Base URL: 从 Normal AI 默认配置读取（如果有）

**未来扩展**：
如果验证成功，可以考虑增加独立的观察者配置，以便：
- 使用不同的模型（如更便宜或更快的模型）
- 独立管理观察者的 API 配额
- 针对观察者任务优化模型选择

### 2.3 API 端点设计

**实现方式**：
- 创建独立的 JSON API 调用（不走 claurst 子模块）
- 直接使用 API key 发起 AI 请求
- 支持自定义系统提示词
- 返回结构化 JSON 格式

**为什么不走 claurst 子模块**：
- claurst 用于对话流程，不适合轻量级提取任务
- 独立 API 调用更灵活，可以使用不同的模型或参数
- 避免与现有对话流程耦合

### 2.4 输入结构

```json
{
  "role": "产品经理",
  "last_message": "需求分析完成。核心功能包括:\n1. 用户登录\n2. 数据展示\n3. 报表导出\n\n建议交接给开发工程师实现以上功能。"
}
```

**字段说明**：
- `role`: 当前 AI 角色名称
- `last_message`: AI 的最后一条消息内容

### 2.5 输出结构

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

**字段说明**：
- `has_handoff`: 是否检测到 handoff 意图（boolean）
- `task_summary`: 任务摘要，一句话概括（string）
- `key_requirements`: 关键需求列表，不超过 5 条（string[]）
- `suggested_role`: AI 推荐的接手角色（string）

### 2.6 系统提示词

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

---

## 3. 实施步骤

### 3.1 后端实现（Rust）

**步骤 1：创建 API 调用模块**

在 `src-tauri/src/` 下创建新模块或在现有模块中添加：

```rust
// 新增函数：extract_handoff_info
pub async fn extract_handoff_info(
    api_key: &str,
    model: &str,
    role: &str,
    last_message: &str,
) -> Result<HandoffInfo, Error> {
    // 1. 构建系统提示词
    // 2. 调用 Anthropic API
    // 3. 解析 JSON 响应
    // 4. 返回结构化数据
}
```

**步骤 2：定义数据结构**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffInfo {
    pub has_handoff: bool,
    pub task_summary: String,
    pub key_requirements: Vec<String>,
    pub suggested_role: String,
}
```

**步骤 3：实现 API 调用逻辑**

- 使用现有的 `AnthropicClient` 或创建新的轻量级客户端
- 设置系统提示词
- 发送请求并解析响应
- 处理错误情况（API 失败、JSON 解析失败等）

**步骤 4：创建 Tauri Command**

```rust
#[tauri::command]
pub async fn extract_handoff_suggestion(
    role: String,
    last_message: String,
    api_key: String,
    model: String,
) -> Result<HandoffInfo, String> {
    extract_handoff_info(&api_key, &model, &role, &last_message)
        .await
        .map_err(|e| e.to_string())
}
```

### 3.2 前端集成（TypeScript）

**步骤 1：定义类型**

```typescript
// src/types/api.ts
export interface HandoffInfo {
  has_handoff: boolean;
  task_summary: string;
  key_requirements: string[];
  suggested_role: string;
}
```

**步骤 2：创建 API 调用函数**

```typescript
// src/api/handoff.ts
import { invoke } from '@tauri-apps/api/tauri';

export async function extractHandoffSuggestion(
  role: string,
  lastMessage: string,
  apiKey: string,
  model: string
): Promise<HandoffInfo> {
  return await invoke('extract_handoff_suggestion', {
    role,
    lastMessage,
    apiKey,
    model,
  });
}
```

**步骤 3：在对话结束后调用**

在 `ChatInterface.tsx` 或相关组件中：

```typescript
// AI 对话结束后自动调用
const handleAIResponseComplete = async () => {
  if (!currentRole || !lastAIMessage) return;
  
  try {
    const handoffInfo = await extractHandoffSuggestion(
      currentRole.name,
      lastAIMessage.content,
      apiKey,
      model
    );
    
    if (handoffInfo.has_handoff) {
      // 显示 handoff UI（Phase 3 实现）
      setHandoffInfo(handoffInfo);
    }
  } catch (error) {
    console.error('Failed to extract handoff info:', error);
  }
};
```

---

## 4. 测试要求

### 4.1 单元测试

**后端测试**：
- 测试 API 调用成功情况
- 测试 JSON 解析正确性
- 测试错误处理（API 失败、无效响应等）

**前端测试**：
- 测试 Tauri command 调用
- 测试类型定义正确性

### 4.2 集成测试

**测试场景 1：明确的 handoff 意图**

输入：
```
"需求分析完成。核心功能包括用户登录、数据展示、报表导出。建议交接给开发工程师。"
```

预期输出：
```json
{
  "has_handoff": true,
  "task_summary": "实现用户登录、数据展示和报表导出功能",
  "key_requirements": ["用户登录", "数据展示", "报表导出"],
  "suggested_role": "开发工程师"
}
```

**测试场景 2：无 handoff 意图**

输入：
```
"我需要更多信息才能继续分析。请提供用户画像和使用场景。"
```

预期输出：
```json
{
  "has_handoff": false,
  "task_summary": "",
  "key_requirements": [],
  "suggested_role": ""
}
```

**测试场景 3：模糊的 handoff 意图**

输入：
```
"初步方案已完成，可能需要技术评审。"
```

预期输出：
```json
{
  "has_handoff": true,
  "task_summary": "对初步方案进行技术评审",
  "key_requirements": ["技术评审"],
  "suggested_role": "开发工程师"
}
```

### 4.3 准确率测试

**目标**：提取准确率 > 90%

**测试方法**：
1. 准备 20 条真实的 AI 对话结束消息
2. 人工标注预期的 handoff 信息
3. 运行 API 提取
4. 对比结果，计算准确率

**准确率计算**：
- `has_handoff` 判断正确率
- `suggested_role` 推荐正确率
- `task_summary` 语义相似度
- `key_requirements` 覆盖率

---

## 5. 成功标准

只有当下面这些条件都满足时，才认为阶段 2 完成：

1. ✅ 后端 API 端点实现完成
2. ✅ 前端 API 调用函数实现完成
3. ✅ 系统提示词能准确提取 handoff 信息
4. ✅ 返回的 JSON 结构符合规范
5. ✅ 单元测试通过
6. ✅ 集成测试通过（3 个测试场景）
7. ✅ 提取准确率 > 90%
8. ✅ 错误处理完善（API 失败、解析失败等）

---

## 6. 技术约束

1. **轻量级调用**：只用于提取，不做复杂推理
2. **成本可控**：使用较小的模型（如 Claude Haiku）
3. **响应速度**：提取时间 < 3 秒
4. **独立性**：不依赖 claurst 子模块
5. **可扩展性**：未来可以支持自定义角色列表

---

## 7. 注意事项

### 7.1 与现有 handoff 实现的关系

**当前实现**：
- 使用 `[HANDOFF]...[/HANDOFF]` 标签解析
- 在 `src-tauri/src/claurst/mod.rs` 中实现

**新实现**：
- 使用独立 JSON API 提取
- 不替换现有实现，而是增强

**共存策略**：
- 保留现有标签解析作为备用方案
- 优先使用 JSON API 提取
- 如果 JSON API 失败，回退到标签解析

### 7.2 API Key 管理

- 使用用户配置的 API key
- 不在代码中硬编码
- 支持多个 provider（Anthropic、OpenAI 等）

### 7.3 错误处理

**可能的错误**：
- API 调用失败（网络问题、API key 无效）
- JSON 解析失败（AI 返回格式不正确）
- 超时（API 响应过慢）

**处理策略**：
- 记录错误日志
- 向用户显示友好的错误提示
- 回退到手动选择（不阻塞用户操作）

---

## 8. 相关文档

- `docs/v2/intelligent-routing-design.md` - 智能路由方案设计
- `docs/v2/task-card-ai-handoff-implementation.md` - 完整实施计划
- `docs/task/phase3-ui-handoff-confirmation.md` - 阶段 3 UI 实现（后续任务）

---

**任务状态**: 待开始  
**负责人**: 待分配  
**开始日期**: 待定  
**完成日期**: 待定
