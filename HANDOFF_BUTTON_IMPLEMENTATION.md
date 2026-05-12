# 历史消息 Handoff 按钮功能实现文档

## 功能概述

为历史 assistant 消息中包含 `<handoff>...</handoff>` 标签的消息添加"再次调度"按钮，点击后复用现有的 ForwardLatestReplyModal 进行工作交接。

## 实现日期
2026-05-12

## 修改的文件

### 1. MessageItem.tsx
**改动内容：**
- 添加 `onHandoffClick` 回调到 props 接口
- 实现 `extractHandoff` 函数：
  - 使用正则表达式 `/<handoff>(.*?)<\/handoff>/s` 提取 handoff 标签内容
  - 返回 `handoffValue`（标签内容）和 `cleanedContent`（移除标签后的内容）
- 使用 `cleanedContent` 渲染消息内容，确保 handoff 标签不显示
- 在符合条件的消息下方渲染"🔄 再次调度"按钮
  - 条件：`!isUser && role === 'assistant' && handoffValue !== '' && !isStreaming`

### 2. MessageItem.css
**改动内容：**
- 添加 `.message-handoff-button` 样式类
- 蓝色渐变背景 (`#3b82f6` → `#2563eb`)
- 悬停效果：向上移动 1px，增强阴影
- 点击效果：恢复原位，减弱阴影

### 3. MessageList.tsx
**改动内容：**
- 添加 `onHandoffClick` 到 `MessageListProps` 接口
- 在函数参数中接收 `onHandoffClick`
- 传递给每个 `MessageItem` 组件

### 4. ChatInterface.tsx
**改动内容：**
- 添加 `onHandoffClick` 到 `ChatInterfaceProps` 接口
- 在函数参数解构中添加 `onHandoffClick`
- 传递给 `MessageList` 组件

### 5. TaskModeLayout.tsx
**改动内容：**
- 添加 `onHandoffClick` 到 `TaskModeLayoutProps` 接口
- 传递给 `ChatInterface` 组件

### 6. App.tsx
**改动内容：**
- 实现 `handleManualHandoffFromMessage` 函数：
  - 参数：`_message`, `handoffRawValue`, `cleanedContent`
  - 检查 `currentTask` 是否存在
  - 尝试通过名称匹配角色（不区分大小写）
  - 如果名称匹配失败，尝试通过 `identity` 匹配
  - 构造 `HandoffSuggestion` 对象：
    ```typescript
    {
      recommended: true,
      targetRoleId: targetRoleId || undefined,
      targetRoleName: targetRoleName,
      reason: '基于历史消息中的 handoff 标签重新发起调度',
      draftMessage: '',
      fullMessage: cleanedContent
    }
    ```
  - 调用 `setPendingHandoffSuggestion` 和 `setShowForwardModal(true)`
- 在 `TaskModeLayout` 中传递 `onHandoffClick={handleManualHandoffFromMessage}`

## 核心逻辑

### Handoff 提取逻辑
```typescript
const extractHandoff = (content: string): { handoffValue: string; cleanedContent: string } => {
  const handoffRegex = /<handoff>(.*?)<\/handoff>/s;
  const match = content.match(handoffRegex);
  if (match) {
    const handoffValue = match[1].trim();
    const cleanedContent = content.replace(handoffRegex, '').trim();
    return { handoffValue, cleanedContent };
  }
  return { handoffValue: '', cleanedContent: content };
};
```

### 角色解析逻辑
1. 首先尝试通过角色名称匹配（不区分大小写）
2. 如果失败，尝试通过 identity 匹配
3. 如果都失败，`targetRoleId` 为 `undefined`，用户需要在 modal 中手动选择

## 功能特性

✅ **自动提取**：自动从消息内容中提取并移除 `<handoff>` 标签
✅ **按钮显示**：只在包含 handoff 的 assistant 消息下显示按钮
✅ **智能解析**：支持角色名称和 identity 两种匹配方式
✅ **复用 Modal**：完全复用现有的 `ForwardLatestReplyModal`
✅ **内容清理**：转发内容不包含 handoff 标签
✅ **保留自动流程**：不影响现有的自动 handoff 弹窗逻辑
✅ **用户友好**：即使角色解析失败，用户仍可手动选择目标角色

## 测试场景

### 场景 1：普通 assistant 消息
**输入：** 不含 `<handoff>` 标签的 assistant 消息
**预期：** 正常显示消息内容，不显示"再��调度"按钮

### 场景 2：含 handoff 的 assistant 消息
**输入：**
```
这是我的分析结果。

<handoff>Researcher</handoff>
```
**预期：**
- 消息内容显示："这是我的分析结果。"（不显示 handoff 标签）
- 消息下方显示"🔄 再次调度"按钮

### 场景 3：点击"再次调度"按钮
**操作：** 点击按钮
**预期：**
- 打开 `ForwardLatestReplyModal`
- 默认选中 "Researcher" 角色（如果存在）
- 用户可以重新选择其他角色
- 转发内容为："这是我的分析结果。"（不含 handoff 标签）

### 场景 4：角色名称不匹配
**输入：**
```
完成任务。

<handoff>UnknownRole</handoff>
```
**预期：**
- 显示"再次调度"按钮
- 点击后打开 modal
- `targetRoleId` 为空，用户需要手动选择角色
- 转发内容正常

### 场景 5：自动 handoff 流程
**操作：** AI 在新消息中输出 handoff 建议
**预期：**
- 自动弹出 `ForwardLatestReplyModal`（现有功能）
- 不受新功能影响

### 场景 6：正在流式输出的消息
**输入：** 正在流式输出的 assistant 消息包含 handoff
**预期：** 不显示"再次调度"按钮（`isStreaming` 为 true 时）

### 场景 7：用户消息
**输入：** 用户消息包含 `<handoff>` 标签
**预期：** 不显示"再次调度"按钮（只对 assistant 消息生效）

## 技术细节

### 正则表达式说明
- 模式：`/<handoff>(.*?)<\/handoff>/s`
- `.*?`：非贪婪匹配，匹配最短内容
- `s` 标志：使 `.` 匹配换行符，支持多行 handoff 内容

### 类型安全
- 所有新增的 props 都正确添加到 TypeScript 接口
- 使用可选参数 `?` 确保向后兼容
- 编译通过，无 TypeScript 错误

### 性能考虑
- `extractHandoff` 函数在每次渲染时执行，但逻辑简单，性能影响可忽略
- 可以考虑使用 `useMemo` 优化，但当前实现已足够高效

## 未来改进建议

1. **支持多个 handoff 标签**
   - 当前实现只处理第一个 handoff 标签
   - 可以扩展为支持多个目标角色

2. **添加 handoff 历史记录**
   - 记录每次手动 handoff 的操作
   - 便于追踪工作流程

3. **优化角色匹配算法**
   - 支持模糊匹配
   - 支持别名匹配

4. **添加快捷键**
   - 为"再次调度"按钮添加键盘快捷键
   - 提升操作效率

## 验证清单

- [x] 代码编译通过
- [x] TypeScript 类型检查通过
- [x] 所有文件正确修改
- [x] 回调链路完整（MessageItem → MessageList → ChatInterface → TaskModeLayout → App）
- [x] 样式文件正确添加
- [x] 不影响现有功能
- [x] 符合最小改动原则

## 相关文件路径

```
src/
├── App.tsx                          # 主应用逻辑，处理 handoff 点击
├── components/
│   ├── MessageItem.tsx              # 消息项组件，提取 handoff 并显示按钮
│   ├── MessageItem.css              # 按钮样式
│   ├── MessageList.tsx              # 消息列表，透传回调
│   ├── ChatInterface.tsx            # 聊天界面，透传回调
│   ├── TaskModeLayout.tsx           # 任务模式布局，透传回调
│   └── ForwardLatestReplyModal.tsx  # 转发弹窗（复用，未修改）
```

## 注意事项

1. **不要修改 handoff 标签格式**
   - 当前实现依赖 `<handoff>...</handoff>` 格式
   - 如果后端改变格式，需要同步更新正则表达式

2. **保持与自动流程一致**
   - 角色解析逻辑应与自动 handoff 流程保持一致
   - 如果自动流程更新，需要同步更新手动流程

3. **测试边界情况**
   - 空 handoff 标签：`<handoff></handoff>`
   - 多行内容：`<handoff>\nRole\n</handoff>`
   - 特殊字符：`<handoff>Role-123</handoff>`

## 总结

本次实现完全符合需求，采用最小改动原则，复用现有组件和逻辑，确保功能稳定可靠。所有代码已通过编译验证，可以直接投入使用。
