# 阶段 6：Markdown 渲染与代码高亮 - 开发计划

**版本**: 1.0  
**创建时间**: 2026-04-15  
**完成时间**: 2026-04-15  
**状态**: ✅ 已完成

---

## 背景

MicroCompany 已完成核心功能开发：
- ✅ Claurst 引擎集成
- ✅ 会话持久化与管理
- ✅ 中断机制
- ✅ 流式响应
- ✅ 工具调用可视化

当前 AI 回复以纯文本形式显示，缺乏格式化和代码高亮，影响可读性。下一阶段需要实现 Markdown 渲染和代码高亮，提升对话体验。

---

## 目标

### 核心目标
1. **Markdown 渲染** - 支持标题、列表、粗体、斜体、链接等基础格式
2. **代码高亮** - 支持多语言语法高亮
3. **代码块操作** - 支持复制代码、显示语言标签
4. **流式渲染优化** - 确保流式响应时 Markdown 渲染流畅

### 次要目标
5. **表格支持** - 渲染 Markdown 表格
6. **数学公式** - 支持 LaTeX 数学公式（可选）

---

## 技术选型

### Markdown 渲染库

**推荐方案：react-markdown + remark-gfm**

```bash
npm install react-markdown remark-gfm
```

**优点**：
- 轻量级，性能好
- 支持 GitHub Flavored Markdown (GFM)
- 支持自定义组件渲染
- 与 React 集成良好
- 支持流式渲染

**替代方案**：
- `marked` + `DOMPurify` - 更底层，需要手动处理安全性
- `markdown-it` - 功能强大但较重

### 代码高亮库

**推荐方案：react-syntax-highlighter**

```bash
npm install react-syntax-highlighter
npm install @types/react-syntax-highlighter --save-dev
```

**优点**：
- 支持 100+ 编程语言
- 多种主题可选
- 与 react-markdown 集成良好
- 支持行号显示

**主题选择**：
- 推荐使用 `vscDarkPlus` 或 `atomOneDark` 主题（与应用深色风格一致）

---

## 实施计划

### 任务 1：安装依赖和基础配置（30 分钟）

**步骤**：

1. **安装依赖**
   ```bash
   npm install react-markdown remark-gfm react-syntax-highlighter
   npm install @types/react-syntax-highlighter --save-dev
   ```

2. **创建 Markdown 组件**（`src/components/MarkdownRenderer.tsx`）
   ```typescript
   import ReactMarkdown from 'react-markdown';
   import remarkGfm from 'remark-gfm';
   import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
   import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

   interface MarkdownRendererProps {
     content: string;
   }

   export function MarkdownRenderer({ content }: MarkdownRendererProps) {
     return (
       <ReactMarkdown
         remarkPlugins={[remarkGfm]}
         components={{
           code({ node, inline, className, children, ...props }) {
             const match = /language-(\w+)/.exec(className || '');
             return !inline && match ? (
               <SyntaxHighlighter
                 style={vscDarkPlus}
                 language={match[1]}
                 PreTag="div"
                 {...props}
               >
                 {String(children).replace(/\n$/, '')}
               </SyntaxHighlighter>
             ) : (
               <code className={className} {...props}>
                 {children}
               </code>
             );
           }
         }}
       >
         {content}
       </ReactMarkdown>
     );
   }
   ```

**验收标准**：
- [ ] 依赖安装成功
- [ ] MarkdownRenderer 组件创建完成
- [ ] 基础 Markdown 渲染正常（标题、列表、粗体、斜体）

---

### 任务 2：集成到消息显示（1 小时）

**步骤**：

1. **更新 MessageItem 组件**（`src/components/MessageItem.tsx`）
   - 导入 `MarkdownRenderer`
   - 对于 assistant 消息，使用 `MarkdownRenderer` 渲染内容
   - 对于 user 消息，保持纯文本显示（或使用简单的换行处理）

   ```typescript
   import { MarkdownRenderer } from './MarkdownRenderer';

   function MessageItem({ message }: MessageItemProps) {
     return (
       <div className={`message-item message-${message.role}`}>
         <div className="message-avatar">
           {message.role === 'user' ? '👤' : '🤖'}
         </div>
         <div className="message-content">
           {message.role === 'assistant' ? (
             <MarkdownRenderer content={message.content} />
           ) : (
             <div className="message-text">{message.content}</div>
           )}
         </div>
       </div>
     );
   }
   ```

2. **测试基础渲染**
   - 发送包含 Markdown 格式的消息
   - 验证标题、列表、粗体、斜体正确渲染
   - 验证代码块语法高亮正常

**验收标准**：
- [ ] Assistant 消息使用 Markdown 渲染
- [ ] User 消息保持纯文本显示
- [ ] 基础 Markdown 格式正确显示

---

### 任务 3：代码块增强（1.5 小时）

**目标**：为代码块添加复制按钮、语言标签、行号等功能

**步骤**：

1. **创建 CodeBlock 组件**（`src/components/CodeBlock.tsx`）
   ```typescript
   import { useState } from 'react';
   import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
   import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

   interface CodeBlockProps {
     language: string;
     code: string;
   }

   export function CodeBlock({ language, code }: CodeBlockProps) {
     const [copied, setCopied] = useState(false);

     const handleCopy = async () => {
       await navigator.clipboard.writeText(code);
       setCopied(true);
       setTimeout(() => setCopied(false), 2000);
     };

     return (
       <div className="code-block">
         <div className="code-block-header">
           <span className="code-language">{language}</span>
           <button className="code-copy-button" onClick={handleCopy}>
             {copied ? '✓ 已复制' : '📋 复制'}
           </button>
         </div>
         <SyntaxHighlighter
           style={vscDarkPlus}
           language={language}
           PreTag="div"
           showLineNumbers
         >
           {code}
         </SyntaxHighlighter>
       </div>
     );
   }
   ```

2. **更新 MarkdownRenderer 使用 CodeBlock**
   ```typescript
   components={{
     code({ node, inline, className, children, ...props }) {
       const match = /language-(\w+)/.exec(className || '');
       const code = String(children).replace(/\n$/, '');
       
       return !inline && match ? (
         <CodeBlock language={match[1]} code={code} />
       ) : (
         <code className="inline-code" {...props}>
           {children}
         </code>
       );
     }
   }}
   ```

3. **添加样式**（`src/components/CodeBlock.css`）
   - 代码块容器样式
   - 头部工具栏样式
   - 复制按钮样式
   - 语言标签样式

**验收标准**：
- [ ] 代码块显示语言标签
- [ ] 复制按钮正常工作
- [ ] 行号正确显示
- [ ] 样式与应用整体风格一致

---

### 任务 4：流式渲染优化（1 小时）

**目标**：确保流式响应时 Markdown 渲染流畅，不闪烁

**问题分析**：
- 流式响应时，内容逐字符添加
- Markdown 解析器可能在不完整的 Markdown 上产生错误渲染
- 代码块在未闭合时可能显示异常

**解决方案**：

1. **检测不完整的代码块**
   ```typescript
   function isIncompleteCodeBlock(content: string): boolean {
     const codeBlockMatches = content.match(/```/g);
     return codeBlockMatches && codeBlockMatches.length % 2 !== 0;
   }
   ```

2. **流式渲染时的特殊处理**
   ```typescript
   function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
     // 如果正在流式传输且代码块未闭合，暂时添加闭合标记
     let processedContent = content;
     if (isStreaming && isIncompleteCodeBlock(content)) {
       processedContent = content + '\n```';
     }

     return (
       <ReactMarkdown
         remarkPlugins={[remarkGfm]}
         components={...}
       >
         {processedContent}
       </ReactMarkdown>
     );
   }
   ```

3. **更新 MessageItem 传递 isStreaming 属性**

**验收标准**：
- [ ] 流式响应时 Markdown 渲染流畅
- [ ] 不完整的代码块不会导致渲染错误
- [ ] 流式完成后，最终渲染结果正确

---

### 任务 5：样式优化（1 小时）

**目标**：优化 Markdown 渲染的样式，确保与应用整体风格一致

**步骤**：

1. **创建 Markdown 样式文件**（`src/components/MarkdownRenderer.css`）
   - 标题样式（h1-h6）
   - 列表样式（ul, ol）
   - 链接样式
   - 引用块样式
   - 表格样式
   - 行内代码样式
   - 分隔线样式

2. **样式要点**：
   - 使用应用的 CSS 变量（颜色、间距、字体）
   - 确保深色主题下可读性
   - 代码块与应用背景色协调
   - 链接颜色使用主题色

3. **响应式优化**：
   - 代码块在小屏幕上可横向滚动
   - 表格在小屏幕上可横向滚动

**验收标准**：
- [ ] Markdown 元素样式与应用风格一致
- [ ] 深色主题下可读性良好
- [ ] 响应式布局正常

---

### 任务 6：表格支持（可选，30 分钟）

**目标**：支持 Markdown 表格渲染

**步骤**：

1. **确认 remark-gfm 已启用**（已在任务 1 中完成）

2. **添加表格样式**
   ```css
   .markdown-renderer table {
     border-collapse: collapse;
     width: 100%;
     margin: var(--space-4) 0;
   }

   .markdown-renderer th,
   .markdown-renderer td {
     border: 1px solid var(--border-default);
     padding: var(--space-2) var(--space-3);
     text-align: left;
   }

   .markdown-renderer th {
     background: var(--bg-secondary);
     font-weight: var(--font-semibold);
   }
   ```

3. **测试表格渲染**

**验收标准**：
- [ ] Markdown 表格正确渲染
- [ ] 表格样式美观
- [ ] 表格在小屏幕上可滚动

---

## 测试计划

### 功能测试

1. **基础 Markdown 格式**
   - 标题（h1-h6）
   - 列表（有序、无序、嵌套）
   - 粗体、斜体、删除线
   - 链接、图片
   - 引用块
   - 分隔线

2. **代码渲染**
   - 行内代码
   - 代码块（多种语言）
   - 代码块复制功能
   - 语言标签显示
   - 行号显示

3. **流式渲染**
   - 流式响应时 Markdown 渲染流畅
   - 不完整的代码块处理正确
   - 流式完成后最终渲染正确

4. **表格渲染**（如果实现）
   - 简单表格
   - 复杂表格（多列、对齐）

### 性能测试

1. **长文本渲染**
   - 测试包含大量 Markdown 格式的长文本
   - 确保渲染性能良好

2. **多代码块渲染**
   - 测试包含多个代码块的消息
   - 确保语法高亮不影响性能

### 兼容性测试

1. **不同浏览器**
   - Chrome
   - Safari
   - Firefox

2. **不同屏幕尺寸**
   - 桌面（1920x1080）
   - 笔记本（1366x768）
   - 小屏幕（1280x720）

---

## 风险与挑战

### 风险 1：流式渲染性能

**问题**：流式响应时，频繁的 Markdown 解析可能影响性能

**缓解措施**：
- 使用 React.memo 优化组件渲染
- 考虑使用 debounce 减少解析频率
- 如果性能问题严重，考虑使用 Web Worker 进行解析

### 风险 2：不完整 Markdown 渲染

**问题**：流式响应时，不完整的 Markdown 可能导致渲染错误

**缓解措施**：
- 检测不完整的代码块并临时闭合
- 对于其他不完整的 Markdown 结构，考虑显示原始文本
- 流式完成后重新渲染确保正确性

### 风险 3：样式冲突

**问题**：Markdown 渲染的样式可能与应用现有样式冲突

**缓解措施**：
- 使用 CSS 模块或 scoped styles
- 为 Markdown 渲染器使用独立的 class 前缀
- 仔细测试各种 Markdown 元素的样式

---

## 成功标准

完成后，MicroCompany 应该：
- ✅ 支持完整的 Markdown 渲染（标题、列表、粗体、斜体、链接等）
- ✅ 支持代码块语法高亮（100+ 编程语言）
- ✅ 代码块支持复制、显示语言标签、行号
- ✅ 流式响应时 Markdown 渲染流畅，无闪烁
- ✅ 样式与应用整体风格一致
- ✅ 性能良好，长文本和多代码块渲染流畅

---

## 下一步

完成 Markdown 渲染后，可以考虑：
- **阶段 7：高级功能**
  - 网络搜索能力
  - 快捷键支持
  - 主题切换
  - 对话历史搜索
  - 导出对话记录

开始实施**任务 1：安装依赖和基础配置**。
