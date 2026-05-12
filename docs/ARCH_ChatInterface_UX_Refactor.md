# 技术架构文档：ChatInterface UX 重构

**文档版本：** v1.1  
**创建日期：** 2026-05-12  
**更新日期：** 2026-05-12（响应代码审查意见 Rev.1）  
**作者：** 架构师-王  
**关联 PRD：** `docs/PRD_ChatInterface_UX_Refactor.md`  
**状态：** 已修订（审查意见已全部处理）

**v1.1 修订内容（响应代码检查-李审查意见）：**
1. 统一滚动阈值为 100px（原 80px），与 PRD 一致
2. `useScrollControl` 接口增加可选 `containerRef` 与 `threshold` 参数，支持外部注入（可测试性）
3. Task 1.4 补充：明确须同步移除 `.input-textarea` 的 `padding-bottom: calc(...)` 补偿值
4. Task 1.5 补充：须先清理 `ForwardLatestReplyModal.css` 中所有未被 TSX 引用的旧 CSS 类（死代码），再添加新类
5. 说明 `ForwardLatestReplyModal.css` 现有死代码的来源及处理策略

---

## 1. 概述

本文档是针对 ChatInterface 三大 UX 问题的技术架构设计，基于对现有代码的深入分析，提供可直接指导开发的技术方案。文档包含架构决策记录（ADR）、模块边界定义、接口设计和实施路径。

### 1.1 问题总结（代码层面）

经过代码分析，三个问题的根本原因如下：

| 问题 | 根本原因 | 影响范围 |
|------|---------|---------|
| 消息列表滚动不流畅 | `useEffect` 在 `[messages, isBusy]` 变化时无条件触发 `scrollIntoView`，无用户意图感知 | `MessageList.tsx` |
| 输入框长文本体验差 | 高度上限硬编码为 280px，无拖拽调整机制，model-info 覆盖层遮挡底部文字 | `InputBox.tsx`, `InputBox.css` |
| Handoff 弹窗样式混乱 | 表单区域大量 inline style，与 `.css` 文件中的类选择器混用，按钮尺寸过重 | `ForwardLatestReplyModal.tsx`, `ForwardLatestReplyModal.css` |

### 1.2 核心设计原则

1. **最小改动原则**：不重写组件，只添加精确的逻辑和样式修正
2. **无外部依赖**：Phase 1/2 不引入新 npm 包（虚拟滚动除外且放在 Phase 2）
3. **设计系统一致性**：所有样式改动必须使用 `variables.css` 中已有的 CSS 变量
4. **向后兼容**：所有改动不破坏现有 props 接口

---

## 2. 架构决策记录（ADR）

### ADR-001：智能滚动控制策略

**状态：** 已接受  
**日期：** 2026-05-12  

#### 背景

`MessageList.tsx` 当前行为：
```tsx
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages, isBusy]);
```

问题：当用户向上滚动查看历史消息时，每次 `isBusy` 状态变化或新消息到来都会强制将视图拉回底部，中断用户的阅读行为。

#### 决策

引入"用户意图检测"机制：**仅当用户位于消息列表底部附近时才自动滚动**。

```
用户在底部 (isAtBottom = true)  → 新消息到来 → 自动滚动 ✅
用户在上方 (isAtBottom = false) → 新消息到来 → 不自动滚动，显示"新消息"提示按钮 ✅
```

#### 考虑的替代方案

**方案 A：完全禁用自动滚动**
- ✅ 实现最简单
- ❌ 破坏核心 UX，正常对话场景下用户必须手动滚到底部
- **拒绝**

**方案 B（已选）：基于滚动位置的智能判断**
- ✅ 保留正常场景的自动滚动
- ✅ 用户主动滚动时不打断
- ✅ 实现复杂度低，不需要外部库
- **采用**

**方案 C：虚拟滚动（react-window）**
- ✅ 从根本上解决大量消息的性能问题
- ❌ 引入外部依赖，实现复杂，需要已知每条消息高度（动态内容不适合）
- **放入 Phase 2 评估，不作为 Phase 1 方案**

#### 实施方案

**新建 Hook：`useScrollControl.ts`**

```typescript
// src/hooks/useScrollControl.ts
import { useRef, useCallback, useEffect, useState } from 'react';

const DEFAULT_THRESHOLD = 100; // 距底部 100px 以内视为"在底部"
                                // 与 PRD 保持一致，覆盖约 4 行 × 24px 的内容区域
                                // 在移动端触控场景下也有足够容错空间

/** 可选配置项 */
export interface UseScrollControlOptions {
  /**
   * 外部注入的滚动容器 ref（可选）。
   * 提供此参数时 hook 使用外部 ref，否则内部创建新 ref。
   * 主要用途：单元测试时注入 mock 容器，无需真实 DOM。
   */
  containerRef?: React.RefObject<HTMLDivElement>;
  /**
   * "视为在底部"的距离阈值（px），默认 100。
   * 可按设备类型覆盖：移动端建议 120，桌面端可保持 100。
   */
  threshold?: number;
}

export interface ScrollControlResult {
  containerRef: React.RefObject<HTMLDivElement>;
  isAtBottom: boolean;
  hasNewMessage: boolean;
  setHasNewMessage: React.Dispatch<React.SetStateAction<boolean>>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useScrollControl(options: UseScrollControlOptions = {}): ScrollControlResult {
  const { threshold = DEFAULT_THRESHOLD } = options;

  // 若外部传入 ref 则复用，否则内部创建（保持向后兼容）
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = options.containerRef ?? internalRef;

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // 监听滚动位置，判断用户是否在底部
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= threshold;
    setIsAtBottom(atBottom);
    if (atBottom) setHasNewMessage(false);
  }, [containerRef, threshold]);

  // 滚动到底部（用于按钮点击和自动滚动）
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, [containerRef]);

  // 注册滚动监听，返回清理函数
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [containerRef, handleScroll]);

  return { containerRef, isAtBottom, hasNewMessage, setHasNewMessage, scrollToBottom };
}
```

> **可测试性说明：** 在单元测试中，可通过以下方式注入 mock 容器，无需真实 DOM 滚动事件：
> ```typescript
> const mockRef = { current: { scrollHeight: 500, scrollTop: 0, clientHeight: 400 } };
> const { result } = renderHook(() =>
>   useScrollControl({ containerRef: mockRef as React.RefObject<HTMLDivElement>, threshold: 100 })
> );
> ```

**MessageList.tsx 改动点（仅 3 处）：**

1. 导入并使用 `useScrollControl` hook
2. `useEffect` 改为：仅在 `isAtBottom === true` 时执行 `scrollToBottom()`
3. 渲染"新消息"浮动按钮（条件：`!isAtBottom && hasNewMessage`）

#### 后果

**正面：**
- 自动滚动行为符合用户意图，体验提升
- 不依赖第三方库
- Hook 可复用于其他列表组件

**负面：**
- 增加了一个新 hook 文件（可接受）
- `BOTTOM_THRESHOLD` 是经验值，可能需要微调

---

### ADR-002：InputBox 高度管理策略

**状态：** 已接受  
**日期：** 2026-05-12

#### 背景

当前实现：
```tsx
const TEXTAREA_MIN_HEIGHT = 120;
const TEXTAREA_MAX_HEIGHT = 280;
```

问题一：280px 是硬编码上限，用户无法调整。  
问题二：`input-model-info` 使用 `position: absolute; bottom: space-3; left: space-3` 覆盖在 textarea 上，`padding-bottom: calc(var(--space-4) + 28px)` 虽然预留了空间，但当 textarea 内容滚动时，底部的 model-info 仍然遮挡文字。

#### 决策

**Phase 1（不引入拖拽调整）：**
- 修复 model-info 遮挡问题：将 model-info 移出 textarea 内部，放在 textarea 下方单独行
- 去除 `padding-bottom` 中的额外偏移量
- 调整 `TEXTAREA_MAX_HEIGHT` 为 `320px`（轻微提升上限）

**Phase 2（拖拽调整高度）：**
- 添加可拖拽的 `ResizeHandle` 在 InputBox 顶部
- 用户拖拽后通过 `localStorage` 持久化高度设置
- 添加"展开/收起"切键盘快捷键（`Ctrl/Cmd + Shift + E`）

#### model-info 位置重构（Phase 1）

**当前布局（有问题）：**
```
┌─────────────────────────────────────────┐
│  textarea                               │
│  ...内容...                             │
│                                         │
│  [model-info overlay]  ← 遮挡文字       │
└─────────────────────────────────────────┘  [发送]
```

**新布局（Phase 1）：**
```
┌─────────────────────────────────────────┐
│  textarea                               │
│  ...内容...                             │
│                                         │
└─────────────────────────────────────────┘  [发送]
  Provider · ModelName                    ← 独立行，不遮挡
```

**CSS 改动清单：**

```css
/* 修改 .input-container 为纵向布局 */
.input-container {
  flex-direction: column;  /* 新增 */
  gap: 0;  /* 修改 */
}

/* 修改 .input-row 包装 textarea + 按钮 */
.input-row {
  display: flex;
  gap: var(--space-3);
  align-items: flex-end;
}

/* 修改 .input-model-info 为流式布局 */
.input-model-info {
  position: static;  /* 去掉 absolute */
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  /* 去掉 background 和 z-index */
}

/* 修改 .input-textarea 去掉 padding-bottom 补偿 */
.input-textarea {
  padding-bottom: var(--space-4);  /* 从 calc(var(--space-4) + 28px) 改回 */
}
```

#### 后果

**正面：**
- model-info 不再遮挡任何文字，100% 解决问题
- 布局更清晰，model-info 作为独立元素易于未来扩展（如添加 token 计数）
- 代码量减少（去掉 absolute positioning 相关代码）

**负面：**
- InputBox 整体高度略增（model-info 占据额外行高约 20px），需确认与父容器布局兼容

---

### ADR-003：ForwardLatestReplyModal 样式重构策略

**状态：** 已接受  
**日期：** 2026-05-12

#### 背景

`ForwardLatestReplyModal.tsx` 在表单区域大量使用 inline style：

```tsx
style={{
  width: '100%',
  padding: '12px 16px',
  fontSize: '15px',
  border: '2px solid var(--border-default)',
  borderRadius: '8px',
  background: 'var(--bg-primary)',
  ...
}}
```

问题：
1. 主题切换（dark/light/ocean）时，inline style 中的硬编码颜色值（如 `#94a3b8`、`#3b82f6`）不响应主题变量
2. 按钮 `padding: '16px 24px'` 过大，在小屏幕下占据过多空间
3. 状态相关样式通过三目运算符内联，代码可读性差
4. `ForwardLatestReplyModal.css` 存在约 114 行旧版残留代码

> **⚠️ 已知技术债：CSS 文件死代码**
>
> `ForwardLatestReplyModal.css` 当前包含以下类，**均未被 TSX 引用**（疑似旧版实现残留）：
> `.forward-from`、`.forward-preview`、`.forward-preview-full`、`.preview-section-label`、`.no-roles-warning`、`.no-reply-warning`
>
> 此外，`.forward-modal` 在 CSS 中定义 `max-width: 500px`，但 TSX 中 inline style 覆盖为 `maxWidth: '600px'`，造成样式来源不一致。
>
> **处理策略：先清理死代码，再迁移 inline style**（详见 Task 1.5）。

#### 决策

**全量迁移：将所有 inline style 提取为 CSS 类，统一到 `ForwardLatestReplyModal.css`**

仅保留纯动态值的 inline style（如根据 `isForwarding` 动态切换的 disabled 状态通过 CSS 类控制，不用 inline style）。

#### Inline Style → CSS 类 映射表

| 当前 inline style 位置 | 新 CSS 类名 | 关键改动 |
|----------------------|------------|---------|
| select 元素样式 | `.forward-select` | 硬编码颜色 → CSS 变量 |
| textarea（交接说明）样式 | `.forward-note-textarea` | 同上 |
| "查看完整消息"按钮样式 | `.forward-toggle-btn` | 提取为类 |
| 完整消息展示区域样式 | `.forward-full-message` | `max-height` 保留，颜色变量化 |
| 底部按钮区域样式 | `.forward-footer` | 已有部分在 CSS，补全 |
| 取消按钮样式 | `.forward-cancel-btn` | 从 inline 迁移 |
| 确认按钮样式 | `.forward-confirm-btn` | 从 inline 迁移，去掉条件 style |

#### 按钮尺寸优化

```css
/* 当前：padding: 16px 24px（过大）*/
/* 新方案：*/
.forward-cancel-btn,
.forward-confirm-btn {
  padding: var(--space-3) var(--space-5);  /* 约 12px 20px */
  font-size: var(--text-base);             /* 不变 */
  font-weight: var(--font-semibold);
  height: 44px;                            /* 与 InputBox 按钮对齐 */
}
```

#### 动态状态通过 CSS 类控制

```tsx
// 当前（难以维护）：
background: isForwarding || !targetRoleId ? '#94a3b8' : 'linear-gradient(...)';

// 新方案：
<button
  className={`forward-confirm-btn ${isDisabled ? 'is-disabled' : 'is-active'}`}
  disabled={isDisabled}
>
```

```css
.forward-confirm-btn.is-active {
  background: linear-gradient(135deg, var(--primary-blue-start) 0%, var(--primary-blue-end) 100%);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  cursor: pointer;
}

.forward-confirm-btn.is-disabled,
.forward-confirm-btn:disabled {
  background: var(--text-disabled);
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.7;
}
```

#### 后果

**正面：**
- 主题切换完全生效（所有颜色使用 CSS 变量）
- 代码可读性大幅提升
- CSS 类可被复用（其他 Modal 可参考）
- 减少 JSX 中的样式噪音，逻辑与表现分离

**负面：**
- 迁移工作量较大（约 150 行 inline style 需要迁移）
- 需要仔细核对每个 style 属性对应的 CSS 变量

---

## 3. 模块边界定义

### 3.1 组件职责边界（重构后）

```
ChatInterface
├── MessageList（负责：消息渲染 + 滚动控制）
│   ├── 使用 useScrollControl hook（NOT 直接操作 DOM）
│   ├── 渲染消息条目（委托给 MessageItem）
│   └── 渲染"滚动到底部"浮动按钮
│
├── InputBox（负责：用户输入 + 发送控制）
│   ├── 自动调整高度（内部逻辑，不暴露给父组件）
│   ├── 显示 model 信息（流式布局，不遮挡输入）
│   └── 发送/取消按钮
│
└── ForwardLatestReplyModal（负责：交接流程 UI）
    ├── 角色选择（select）
    ├── 交接说明（textarea）
    ├── 消息预览（可折叠）
    └── 确认/取消操作
```

### 3.2 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| `useScrollControl` | `src/hooks/useScrollControl.ts` | 滚动位置检测 + 滚动控制 |
| `ScrollToBottomButton` | `src/components/ScrollToBottomButton.tsx` | "滚到底部"浮动按钮（可选独立组件）|

---

## 4. 数据流与状态设计

### 4.1 MessageList 智能滚动状态流

```
用户滚动事件
    │
    ▼
handleScroll()
    │
    ├─── 计算 distanceFromBottom
    │
    ├─── isAtBottom = distance <= 100px
    │
    └─── if isAtBottom → setHasNewMessage(false)
                           （清除"新消息"提示）

新消息到来（messages 变化）
    │
    ▼
useEffect([messages, isBusy])
    │
    ├─── if isAtBottom → scrollToBottom('smooth')
    │
    └─── if !isAtBottom → setHasNewMessage(true)
                          （显示"新消息"提示按钮）
```

### 4.2 InputBox 高度状态流（不变，仅布局调整）

```
用户输入文字
    │
    ▼
setInput(value)
    │
    ▼
useEffect([input])
    │
    ├─── textarea.style.height = 'auto'
    ├─── nextHeight = clamp(scrollHeight, 120, 320)  ← 上限从 280 改为 320
    ├─── textarea.style.height = `${nextHeight}px`
    └─── textarea.style.overflowY = scrollHeight > 320 ? 'auto' : 'hidden'
```

---

## 5. 实施路径（开发任务分解）

### Phase 1：核心体验修复（预计 3-4 天）

#### Task 1.1：创建 `useScrollControl` Hook
- **文件：** 新建 `src/hooks/useScrollControl.ts`
- **工时：** 0.5 天
- **测试要点：** 
  - 初始状态 `isAtBottom = true`
  - 滚动到顶部后 `isAtBottom = false`
  - 滚动到底部 100px 范围内 `isAtBottom = true`

#### Task 1.2：改造 `MessageList.tsx`
- **文件：** `src/components/MessageList.tsx`
- **改动量：** 约 20 行（增加 hook、修改 useEffect、添加浮动按钮）
- **工时：** 0.5 天
- **注意：** 不改变组件 Props 接口

#### Task 1.3：添加"滚动到底部"按钮样式
- **文件：** `src/components/MessageList.css`
- **改动量：** 约 20 行（新增 `.scroll-to-bottom-btn` 类）
- **工时：** 0.5 天

#### Task 1.4：修复 InputBox model-info 布局
- **文件：** `src/components/InputBox.tsx`, `InputBox.css`
- **改动量：** TSX 约 10 行，CSS 约 30 行
- **工时：** 0.5 天
- **联动变更（必须同步处理）：**
  1. 将 `.input-model-info` 的 `position: absolute` 改为 `position: static`（流式布局）
  2. **同步移除** `.input-textarea` 的 `padding-bottom: calc(var(--space-4) + 28px)` 中的 `+ 28px` 补偿，改回标准值 `padding-bottom: var(--space-4)`。若只删除 absolute 定位而不还原 padding，textarea 底部将多出约 28px 空白。
  3. 同步调整 `.input-container`：将 `align-items: flex-end` 保留在 `.input-row` 子层，外层 container 改为 `flex-direction: column`
- **验证要点：**
  - model-info 在所有内容高度下均不遮挡文字
  - textarea 底部视觉间距与其他内边距一致（不过大、不过小）
  - 父容器 ChatInterface 整体高度变化 ≤ 28px（model-info 行高）

#### Task 1.5：重构 ForwardLatestReplyModal 样式
- **文件：** `src/components/ForwardLatestReplyModal.tsx`, `ForwardLatestReplyModal.css`
- **改动量：** TSX 删除约 150 行 inline style，CSS 先删除约 90 行死代码后新增约 100 行
- **工时：** 1.5 天
- **执行顺序（必须严格按步骤）：**

  **步骤 1：清理 CSS 死代码（必须先做）**
  
  `ForwardLatestReplyModal.css` 目前存在约 114 行旧版代码，其中 `.forward-from`、`.forward-preview`、`.forward-preview-full`、`.preview-section-label`、`.no-roles-warning`、`.no-reply-warning` 等类**在当前 TSX 中均未被引用**（旧版实现残留）。
  
  执行清理：
  - 仅保留 `.modal-overlay`、`.forward-modal`、`.modal-header`、`.modal-body` 这 4 个在 TSX 中实际使用的类
  - 删除其余所有未引用的旧类
  - **注意：** `.forward-modal` 在 CSS 中定义 `max-width: 500px`，但 TSX inline style 覆盖为 `maxWidth: '600px'`；清理时以 TSX 实际效果为准，CSS 改为 `max-width: 600px`，删除 inline style 覆盖

  **步骤 2：迁移 inline style → CSS 类**
  
  参考 ADR-003 的映射表，将所有 inline style 提取为新 CSS 类，所有颜色值替换为 CSS 变量

  **步骤 3：删除 TSX 中所有 `style={{...}}` 属性**（动态状态改用条件 className）

- **验证要点：**
  - dark/light/ocean 三个主题下样式均正确
  - 无任何硬编码颜色值（`#94a3b8`、`#3b82f6` 等）残留
  - Chrome DevTools 中确认无被覆盖的 CSS 属性（无划线样式）
  - 确认清理后的 CSS 文件中不存在任何未被引用的类选择器

### Phase 2：性能优化（预计 2-3 天，后续迭代）

#### Task 2.1：虚拟滚动评估
- 评估 `@tanstack/react-virtual` 的可行性
- 主要挑战：MessageItem 高度动态（含 Markdown、ToolCall 等），需要动态高度估算
- ��策点：若消息超过 200 条时有明显卡顿，则实施；否则暂缓

#### Task 2.2：InputBox 拖拽高度调整
- 在 InputBox 顶部添加拖拽手柄（复用已有的 `ResizeHandle.css`）
- `localStorage` 持久化用户偏好高度

---

## 6. 接口设计（组件 Props 不变）

以下是各组件改动后的接口，**所有 Props 保持向后兼容**：

### MessageList Props（不变）

```typescript
interface MessageListProps {
  messages: Message[];
  isBusy: boolean;
  // 无新增 Props，内部状态完全由 useScrollControl 管理
}
```

### InputBox Props（不变）

```typescript
interface InputBoxProps {
  onSendMessage: (content: string) => void;
  onCancelMessage: () => void;
  isInputDisabled?: boolean;
  isBusy?: boolean;
  canCancel?: boolean;
  isCancelling?: boolean;
  placeholderText?: string;
  currentProviderName?: string | null;
  currentModelName?: string | null;
  // 无新增 Props
}
```

### ForwardLatestReplyModal Props（不变）

接口不变，仅内部 JSX 的 style 提取为 CSS 类。

---

## 7. CSS 类命名规范

所有新增 CSS 类遵循 BEM-lite 命名约定：

```
.{组件名}-{元素名}          组件的子元素
.{组件名}-{元素名}--{修饰}  修饰状态

示例：
.message-list-scroll-btn      滚动到底部按钮
.message-list-scroll-btn--visible  显示状态
.forward-confirm-btn          确认按钮
.forward-confirm-btn--active  激活状态
```

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| `useScrollControl` 的 `BOTTOM_THRESHOLD=100px` 在极小屏幕上可能误触发 | 低 | 低 | 以 `px` 为单位设置固定阈值；hook 支持通过 `threshold` 参数覆盖，可按设备类型动态传入 |
| ForwardLatestReplyModal 迁移过程中遗漏某些 inline style | 中 | 中 | 迁移后用三个主题逐一截图对比验证 |
| InputBox 布局改动影响父容器（ChatInterface）高度计算 | 低 | 中 | 改动前记录当前 InputBox 高度，改动后对比确认差异 < 24px |
| 虚拟滚动（Phase 2）与动态高度 MessageItem 不兼容 | 高 | 中 | Phase 1 先不实施虚拟滚动，Phase 2 专项评估 `@tanstack/react-virtual` 的 `estimateSize` 方案 |

---

## 9. 代码检查要点（供 Code Reviewer 参考）

**useScrollControl Hook（Task 1.1）：**
- [ ] Hook 签名包含可选 `containerRef` 和 `threshold` 参数（`UseScrollControlOptions`）
- [ ] 外部传入 `containerRef` 时使用外部 ref，否则内部创建（保持向后兼容）
- [ ] `BOTTOM_THRESHOLD` 默认值为 `100`（与 PRD 一致）
- [ ] `useEffect` 中有完整清理函数（`removeEventListener`），无内存泄漏
- [ ] `threshold` 参数正确传入 `handleScroll` 的 `useCallback` 依赖数组

**MessageList 改动（Task 1.2 / 1.3）：**
- [ ] `scrollIntoView` 已完全替换为 `scrollToBottom()`
- [ ] `useEffect` 中有 `isAtBottom` 判断，不无条件触发
- [ ] `isBusy` 不再单独作为触发滚动的依据（只跟随 `messages` 变化 + `isAtBottom` 判断）
- [ ] "新消息"浮动按钮有正确的 `z-index` 和显隐动画（不遮挡消息内容）
- [ ] 新增的 `.scroll-to-bottom-btn` 类仅使用 `variables.css` 中的 CSS 变量

**InputBox 改动（Task 1.4）：**
- [ ] `.input-model-info` 不再使用 `position: absolute`，已改为 `position: static`（流式布局）
- [ ] `.input-textarea` 的 `padding-bottom` 已从 `calc(var(--space-4) + 28px)` 改回 `var(--space-4)`
- [ ] `.input-container` 已设置 `flex-direction: column`，`.input-row` 负责横向排列 textarea + 按钮
- [ ] `TEXTAREA_MAX_HEIGHT` 常量已更新为 `320`
- [ ] 视觉验证：各种文本长度下 model-info 均不遮挡 textarea 内文字

**ForwardLatestReplyModal 改动（Task 1.5）：**
- [ ] **先决条件**：旧版 CSS 死代码已清理（`.forward-from`、`.forward-preview` 等未引用的旧类均已删除）
- [ ] `.forward-modal` 的 `max-width` 统一为 `600px`（CSS 文件），TSX 中无 `maxWidth` inline style 覆盖
- [ ] JSX 中无硬编码颜色值（`#94a3b8`、`#3b82f6` 等）
- [ ] 所有 `style={{...}}` 属性已删除（动态状态改用条件 `className`）
- [ ] 新增 CSS 类全部使用 `variables.css` 中的 CSS 变量，无硬编码值
- [ ] 三个主题（dark / light / ocean）下视觉验证通过
- [ ] 按钮 `height: 44px` 与 InputBox 发送按钮对齐
- [ ] Chrome DevTools 中确认无被划线覆盖的 CSS 属性（无冲突样式）

---

## 10. 文档附录

### 附录 A：`variables.css` 相关变量速查

| 变量名 | 用途 |
|--------|------|
| `--bg-primary` | 主背景色 |
| `--bg-secondary` | 次级背景色 |
| `--bg-tertiary` | 第三级背景色 |
| `--border-default` | 默认边框色 |
| `--text-primary` | 主文字色 |
| `--text-tertiary` | 辅助文字色 |
| `--text-disabled` | 禁用状态色 |
| `--primary-blue-start` | 蓝色渐变起点 |
| `--primary-blue-end` | 蓝色渐变终点 |
| `--space-1` ~ `--space-8` | 间距梯度 |
| `--radius-sm/md/lg` | 圆角梯度 |
| `--shadow-sm/md/lg` | 阴影梯度 |
| `--text-xs/sm/base` | 字体大小 |
| `--font-medium/semibold` | 字重 |
| `--transition-all` | 通用过渡 |

### 附录 B：相关文件路径速查

```
src/
├── components/
│   ├── MessageList.tsx        ← 改动（Task 1.2）
│   ├── MessageList.css        ← 改动（Task 1.3）
│   ├── InputBox.tsx           ← 改动（Task 1.4）
│   ├── InputBox.css           ← 改动（Task 1.4）
│   ├── ForwardLatestReplyModal.tsx  ← 改动（Task 1.5）
│   └── ForwardLatestReplyModal.css  ← 改动（Task 1.5）
├── hooks/
│   └── useScrollControl.ts   ← 新建（Task 1.1）
└── styles/
    └── variables.css          ← 只读，提取变量
```

---

*本文档作为开发实施的技术指南，如有疑问请在代码审查阶段提出。*
