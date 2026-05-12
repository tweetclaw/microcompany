# 已知问题：切换界面时 AI 对话 UI 状态丢失

## 问题描述

当 AI 正在执行任务（尚未结束）时，用户切换到其他界面（如 Task 模式、设置等），再切换回 AI 对话界面，UI 会错误地显示为"对话已结束"状态：

- 输入框变为可用，可以输入新的对话
- 没有任何流式输出内容
- 进度指示器（三个点动画）有时仍在显示，但内容区域为空
- Session 列表中该会话看起来像是空闲状态

## 关键特征

- **后端不受影响**：Rust 后端进程是独立的，切换界面不会中断 AI 的实际工作，AI 仍在正常运行
- **纯前端状态问题**：前端 React 组件在切换界面时被卸载/重新挂载，导致 streaming 状态丢失
- **可复现条件**：在 AI 工具调用密集（例如连续读文件、写文件）的任务期间切换界面，最容易触发

## 影响

1. 用户误以为 AI 已停止，可能重复发送"继续"等指令
2. 重复发送指令会创建新的请求，与后端正在进行的请求并发，可能导致混乱
3. 返回界面后没有历史流式内容可见，用户无法了解 AI 当前进度

## 根因分析

前端 `ChatInterface` 组件依赖 React state 维护以下运行状态：

```
isStreaming / runState
currentRequestId
accumulatedText
streamingMessages
```

当用户切换到其他页面，`ChatInterface` 组件卸载，上述 state 全部清空。重新挂载时，组件从 DB 加载历史消息，但无法感知"当前有一个正在进行的请求"，因为：

1. 没有持久化 `activeRequestId` 到 DB 或全局 store
2. 重新挂载后不会重新订阅当前请求的 `message-chunk` 事件
3. 后端仍在发送事件，但前端已没有监听者

## 潜在修复方向

### 方案 A：全局 RunState（推荐）
将 `activeRequestId`、`runState` 提升到 `App.tsx` 级别的全局状态（或 React Context），`ChatInterface` 卸载时状态不丢失，重新挂载后恢复正确状态并重新订阅事件。

### 方案 B：重挂载时查询后端状态
`ChatInterface` 挂载时主动向后端查询当前 session 是否有进行中的请求（新增 `get_active_request` Tauri command），如果有则恢复 streaming UI。

### 方案 C：禁止切换界面（临时规避）
当检测到 `runState !== 'idle'` 时，禁用界面切换按钮，防止用户在 AI 工作期间离开当前会话。

## 当前状态

- 问题存在，尚未修复
- 后端工作完全正常，不受影响
- 用户可通过观察 dev.log 确认 AI 实际状态：
  ```bash
  tail -20 dev.log | grep "TurnComplete\|tool_end\|claurst_terminal_outcome"
  ```

## 相关代码位置

| 文件 | 说明 |
|------|------|
| `src/components/ChatInterface.tsx` | streaming state 管理，`isStreaming`、`runState` |
| `src/App.tsx` | 界面切换逻辑，`sessionListRefreshKey` |
| `src-tauri/src/claurst/mod.rs` | 后端事件发送，`message-chunk`、`ai-request-end` |

## 记录时间

2026-05-12
