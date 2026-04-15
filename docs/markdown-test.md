# Markdown 渲染测试文档

这个文档用于测试 MicroCompany 的 Markdown 渲染功能。

## 功能清单

### ✅ 已完成的功能

1. **Markdown 渲染** - 支持标题、列表、粗体、斜体、链接等
2. **代码高亮** - 使用 react-syntax-highlighter 和 Prism
3. **代码块增强** - 复制按钮、语言标签、行号
4. **流式渲染优化** - 处理不完整的代码块
5. **样式优化** - 与应用整体风格一致

## 测试用例

### 基础格式

这是一段**粗体文本**和*斜体文本*。

这是一个[链接示例](https://example.com)。

### 列表

无序列表：
- 项目 1
- 项目 2
  - 嵌套项目 2.1
  - 嵌套项目 2.2
- 项目 3

有序列表：
1. 第一步
2. 第二步
3. 第三步

### 代码示例

行内代码：`const greeting = "Hello World";`

代码块示例（TypeScript）：

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

function greetUser(user: User): string {
  return `Hello, ${user.name}!`;
}
```

代码块示例（Python）：

```python
def fibonacci(n: int) -> int:
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# 测试
print(fibonacci(10))
```

### 引用块

> 这是一段引用文本。
> 可以包含多行内容。

### 表格

| 功能 | 状态 | 优先级 |
|------|------|--------|
| Markdown 渲染 | ✅ 完成 | 高 |
| 代码高亮 | ✅ 完成 | 高 |
| 表格支持 | ✅ 完成 | 中 |

### 分隔线

---

## 测试方法

1. 启动开发服务器：`npm run dev`
2. 在聊天界面发送包含 Markdown 格式的消息
3. 验证以下功能：
   - 标题、列表、粗体、斜体正确渲染
   - 代码块有语法高亮
   - 代码块显示语言标签和复制按钮
   - 复制按钮可以正常工作
   - 表格正确显示

## 技术栈

- **react-markdown** - Markdown 解析和渲染
- **remark-gfm** - GitHub Flavored Markdown 支持
- **react-syntax-highlighter** - 代码语法高亮
- **Prism** - 语法高亮引擎
- **vscDarkPlus** - VS Code 深色主题
