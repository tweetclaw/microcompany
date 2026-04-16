# UI/UX 重构计划 - IDE 级别界面升级

## 项目目标

将 MicroCompany 从小窗口聊天应用升级为专业 IDE 级别的桌面应用，参考 VS Code、Cursor、Antigravity 等现代 IDE 的设计理念。

## 当前问题分析

### 1. 窗口尺寸问题
- **当前**: 800x600 像素（过小，导致所有界面元素拥挤）
- **对比**:
  - VS Code: 默认 1280x720，最小 400x400
  - Cursor: 默认 1400x900，最小 800x600
  - Antigravity: 默认 1600x1000，最小 1024x768
  - Claude Desktop: 默认 1200x800

### 2. 布局系统问题
- 缺少响应式断点
- 组件间距不够（IDE 需要更多呼吸空间）
- 没有最小窗口限制
- 不支持多显示器优化

### 3. 视觉密度问题
- 字体过小（当前窗口下显得拥挤）
- 间距系统不适合大窗口
- 设置对话框在小窗口中显示不全

## 设计参考分析

### VS Code 设计理念
- **窗口策略**: 智能初始尺寸（屏幕的 70-80%）
- **最小尺寸**: 400x400（保证基本可用）
- **布局**: 侧边栏 + 主编辑区 + 面板区（三栏布局）
- **响应式**: 窗口缩小时自动隐藏次要元素

### Cursor 设计理念
- **窗口策略**: 更大的默认尺寸（1400x900）
- **AI 面板**: 右侧固定宽度 400-500px
- **编辑器**: 左侧自适应宽度
- **最小尺寸**: 800x600（保证 AI 对话可读）

### Antigravity 设计理念
- **窗口策略**: 大窗口优先（1600x1000）
- **分屏**: 支持多个 AI 对话并行
- **布局**: 灵活的面板系统
- **视觉**: 现代玻璃态、渐变、动效

## 重构方案

### 阶段 1: 窗口系统重构 (优先级: 🔴 最高)

#### 1.1 智能窗口尺寸
```json
// tauri.conf.json 更新
{
  "app": {
    "windows": [
      {
        "title": "MicroCompany",
        "width": 1400,           // 从 800 增加到 1400
        "height": 900,           // 从 600 增加到 900
        "minWidth": 1024,        // 新增：最小宽度
        "minHeight": 768,        // 新增：最小高度
        "center": true,          // 新增：居中显示
        "resizable": true,
        "fullscreen": false
      }
    ]
  }
}
```

**实现细节**:
- 检测屏幕分辨率，动态计算初始窗口大小（屏幕的 75%）
- 对于小屏幕（<1366px），使用最大化窗口
- 记住用户上次的窗口大小和位置（localStorage）

#### 1.2 响应式断点系统
```typescript
// src/utils/breakpoints.ts
export const BREAKPOINTS = {
  compact: 1024,    // 紧凑模式（最小可用）
  comfortable: 1280, // 舒适模式（标准）
  spacious: 1600,   // 宽敞模式（大屏）
  ultrawide: 2560   // 超宽屏
};
```

### 阶段 2: 布局系统重构 (优先级: 🔴 最高)

#### 2.1 三栏布局架构
```
┌─────────────────────────────────────────────────────────┐
│  Toolbar (固定高度 50px)                                  │
├──────────┬────────────────────────────────┬──────────────┤
│          │                                │              │
│ Sidebar  │     Main Content Area          │  Inspector   │
│ (可折叠)  │     (Chat Interface)           │  (可选)       │
│ 280px    │     (自适应宽度)                 │  320px       │
│          │                                │              │
│ - 会话列表 │  - 消息列表                      │ - 文件树      │
│ - 设置    │  - 输入框                        │ - 上下文      │
│          │  - 工具指示器                     │ - 变量       │
│          │                                │              │
└──────────┴────────────────────────────────┴──────────────┘
```

**响应式行为**:
- `< 1024px`: 隐藏 Inspector，Sidebar 可折叠
- `1024-1280px`: 显示 Sidebar + Main
- `1280-1600px`: 显示 Sidebar + Main + Inspector（可折叠）
- `> 1600px`: 全部显示，增加间距

#### 2.2 组件层级结构
```
App
├── Toolbar (固定顶部)
│   ├── Logo
│   ├── WorkingDirectory (只读显示)
│   ├── Actions (New Chat, Settings)
│   └── UserProfile
├── MainLayout (flex 布局)
│   ├── Sidebar (可折叠)
│   │   ├── SessionList
│   │   └── SettingsButton
│   ├── ContentArea (flex-grow)
│   │   ├── WelcomePage (无会话时)
│   │   └── ChatInterface (有会话时)
│   │       ├── MessageList
│   │       ├── ToolIndicator
│   │       └── InputBox
│   └── Inspector (可选，可折叠)
│       ├── FileTree
│       ├── ContextView
│       └── VariablesPanel
└── Modals
    ├── Settings
    └── Dialogs
```

### 阶段 3: 视觉设计系统升级 (优先级: 🟡 中)

#### 3.1 间距系统（Scale Up）
```css
/* 当前间距（为小窗口设计） */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;

/* 新间距（为 IDE 级别设计） */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;   /* 新增 */
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;  /* 新增 */
--space-12: 48px;  /* 新增 */
--space-16: 64px;  /* 新增 */
```

#### 3.2 字体系统（Scale Up）
```css
/* 当前字体 */
--text-xs: 12px;
--text-sm: 14px;
--text-base: 16px;
--text-lg: 18px;
--text-xl: 20px;

/* 新字体（更适合大窗口） */
--text-xs: 11px;
--text-sm: 13px;
--text-base: 14px;   /* IDE 标准 */
--text-md: 15px;     /* 新增 */
--text-lg: 16px;
--text-xl: 18px;
--text-2xl: 24px;    /* 新增：标题 */
--text-3xl: 32px;    /* 新增：大标题 */
```

#### 3.3 组件尺寸调整
```css
/* Toolbar */
.toolbar {
  height: 50px;  /* 保持不变 */
}

/* Sidebar */
.sidebar {
  width: 280px;           /* 从 250px 增加 */
  min-width: 240px;       /* 新增 */
  max-width: 400px;       /* 新增 */
}

/* MessageItem */
.message-item {
  padding: var(--space-6) var(--space-8);  /* 从 space-4 增加 */
  max-width: 900px;       /* 从 800px 增加 */
}

/* InputBox */
.input-box {
  min-height: 120px;      /* 从 100px 增加 */
  max-height: 400px;      /* 从 300px 增加 */
}

/* Settings Dialog */
.settings-dialog {
  width: 900px;           /* 从 700px 增加 */
  height: 700px;          /* 从 600px 增加 */
  max-width: 90vw;        /* 响应式 */
  max-height: 90vh;       /* 响应式 */
}
```

### 阶段 4: 高级功能（参考 IDE）(优先级: 🟢 低)

#### 4.1 多面板支持
- 支持拆分视图（Split View）
- 支持多个 AI 对话并行
- 支持拖拽调整面板大小

#### 4.2 工作区管理
- 保存窗口布局状态
- 支持多工作区切换
- 记住每个工作区的布局偏好

#### 4.3 快捷键系统
```typescript
// 参考 VS Code 快捷键
Cmd/Ctrl + B: 切换侧边栏
Cmd/Ctrl + J: 切换面板
Cmd/Ctrl + \: 拆分视图
Cmd/Ctrl + W: 关闭当前会话
Cmd/Ctrl + N: 新建会话
Cmd/Ctrl + ,: 打开设置
```

## 实施优先级

### P0 (立即执行)
1. ✅ 更新 `tauri.conf.json` 窗口配置
2. ✅ 实现响应式断点系统
3. ✅ 调整核心组件尺寸（Sidebar, MessageItem, InputBox, Settings）

### P1 (本周完成)
4. 实现三栏布局架构
5. 升级间距和字体系统
6. 优化设置对话框布局

### P2 (下周完成)
7. 添加 Inspector 面板（可选）
8. 实现面板折叠/展开动画
9. 添加窗口状态持久化

### P3 (未来优化)
10. 多面板支持
11. 拆分视图
12. 快捷键系统

## 技术实现细节

### 1. 窗口尺寸检测
```typescript
// src/utils/window.ts
export async function getOptimalWindowSize() {
  const screen = await window.__TAURI__.window.primaryMonitor();
  const { width, height } = screen.size;
  
  // 使用屏幕的 75%
  const optimalWidth = Math.floor(width * 0.75);
  const optimalHeight = Math.floor(height * 0.75);
  
  // 限制在合理范围内
  return {
    width: Math.max(1024, Math.min(optimalWidth, 2560)),
    height: Math.max(768, Math.min(optimalHeight, 1600))
  };
}
```

### 2. 响应式 Hook
```typescript
// src/hooks/useBreakpoint.ts
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('comfortable');
  
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 1024) setBreakpoint('compact');
      else if (width < 1280) setBreakpoint('comfortable');
      else if (width < 1600) setBreakpoint('spacious');
      else setBreakpoint('ultrawide');
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return breakpoint;
}
```

### 3. 布局状态持久化
```typescript
// src/utils/layoutState.ts
export interface LayoutState {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  inspectorWidth: number;
  inspectorVisible: boolean;
  windowSize: { width: number; height: number };
  windowPosition: { x: number; y: number };
}

export function saveLayoutState(state: LayoutState) {
  localStorage.setItem('layout-state', JSON.stringify(state));
}

export function loadLayoutState(): LayoutState | null {
  const saved = localStorage.getItem('layout-state');
  return saved ? JSON.parse(saved) : null;
}
```

## 设计原则

### 1. 渐进式增强
- 小窗口下保证基本可用
- 大窗口下提供更多功能和空间
- 不强制用户使用大窗口

### 2. 性能优先
- 使用 CSS transforms 实现动画（GPU 加速）
- 虚拟滚动处理长消息列表
- 懒加载非关键组件

### 3. 一致性
- 遵循 IDE 行业标准（VS Code 风格）
- 保持现有的视觉语言（深色主题、科技感）
- 快捷键与主流 IDE 对齐

### 4. 可访问性
- 支持键盘导航
- 保持足够的对比度
- 支持缩放（Cmd/Ctrl + +/-）

## 成功指标

1. **窗口体验**
   - ✅ 默认窗口尺寸增加到 1400x900
   - ✅ 设置对话框完整显示
   - ✅ 消息内容不再拥挤

2. **响应式**
   - ✅ 支持 1024px 到 2560px+ 的窗口宽度
   - ✅ 自动适配不同屏幕尺寸
   - ✅ 面板可折叠/展开

3. **专业感**
   - ✅ 视觉密度接近 VS Code/Cursor
   - ✅ 布局清晰、层次分明
   - ✅ 动画流畅、响应迅速

## 风险与挑战

### 技术风险
- **Tauri 窗口 API 限制**: 某些高级窗口功能可能需要原生代码
- **性能**: 大窗口下的渲染性能需要优化
- **兼容性**: 不同操作系统的窗口行为差异

### 设计风险
- **学习曲线**: 用户需要适应新布局
- **向后兼容**: 现有用户的窗口大小偏好
- **屏幕适配**: 小屏幕用户（<1366px）的体验

### 缓解措施
1. 保存用户的窗口偏好
2. 提供"紧凑模式"切换
3. 充分测试不同分辨率
4. 渐进式推出（先修复窗口大小，再优化布局）

## 参考资源

- [VS Code UI Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)
- [Tauri Window API](https://tauri.app/v1/api/js/window)
- [Cursor Design System](https://cursor.sh)
- [Antigravity UI Patterns](https://antigravity.dev)

## 下一步行动

1. **立即执行**: 更新 `tauri.conf.json` 窗口配置
2. **创建分支**: `feature/ui-redesign-ide-layout`
3. **实现 P0 任务**: 窗口配置 + 响应式系统 + 组件尺寸调整
4. **测试**: 在不同分辨率下测试（1024px, 1280px, 1920px, 2560px）
5. **用户反馈**: 收集早期用户对新布局的反馈

---

**文档版本**: v1.0  
**创建日期**: 2026-04-16  
**负责人**: AI Assistant  
**状态**: 待审核
