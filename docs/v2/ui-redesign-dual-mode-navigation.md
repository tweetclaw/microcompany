# UI 重构设计文档：双模式导航架构

## 1. 设计目标

将当前混乱的 Task 界面重构为清晰的双模式导航架构：
- **Normal 模式**：传统的 Session 对话模式
- **Task 模式**：多角色协作任务模式

通过最左侧的主导航栏实现模式切换，每个模式有独立的左侧列表区、中间主工作区和右侧信息面板。

## 2. 整体布局结构

```
┌─────┬──────────────┬─────────────────────────────────┬──────────────────┐
│     │              │                                 │                  │
│  主  │   左侧列表区   │         中间主工作区              │   右侧信息面板     │
│  导  │              │                                 │                  │
│  航  │  (根据模式    │      (对话界面)                  │  (根据模式显示)   │
│  栏  │   动态切换)   │                                 │                  │
│     │              │                                 │                  │
│ 40px│   240-280px  │          flex-grow             │    280-320px     │
└─────┴──────────────┴─────────────────────────────────┴──────────────────┘
```

## 3. 主导航栏设计 (最左侧 40px)

### 3.1 导航项

```
┌──────┐
│  ≡   │  ← Logo / Menu (可选)
├──────┤
│      │
│  💬  │  ← Normal 模式 (Session 对话)
│      │
├──────┤
│      │
│  📋  │  ← Task 模式 (多角色任务)
│      │
├──────┤
│      │
│      │
│      │  ← 空白区域
│      │
├──────┤
│  ⚙️  │  ← Settings (底部固定)
└──────┘
```

### 3.2 交互规则

- 点击图标切换模式
- 当前激活模式高亮显示（背景色 + 左侧边框）
- 切换模式时，左侧列表区和右侧面板内容随之切换
- 中间主工作区始终显示对话界面（复用 ChatInterface）

## 4. Normal 模式布局

### 4.1 完整布局

```
┌─────┬──────────────────┬─────────────────────────────────┬──────────────────┐
│     │ Session List     │                                 │   Inspector      │
│     │ ┌──────────────┐ │                                 │                  │
│ 💬  │ │ ➕ 新建对话   │ │                                 │  Session Info    │
│ ✓   │ └──────────────┘ │                                 │  ┌─────────────┐ │
│     │                  │                                 │  │ 标题: xxx   │ │
│     │ ┌──────────────┐ │      Chat Interface             │  │ Session ID  │ │
│ 📋  │ │ 📝 Untitled  │ │                                 │  │ 消息数: 5   │ │
│     │ │ 2 messages   │ │   ┌─────────────────────────┐   │  └─────────────┘ │
│     │ └──────────────┘ │   │                         │   │                  │
│     │                  │   │  User: Hello            │   │  Model Info      │
│     │ ┌──────────────┐ │   │                         │   │  ┌─────────────┐ │
│     │ │ 📝 Debug API │ │   │  Assistant: Hi there!   │   │  │ Provider    │ │
│     │ │ 8 messages   │ │   │                         │   │  │ Model       │ │
│     │ └──────────────┘ │   │  User: How are you?     │   │  └─────────────┘ │
│     │                  │   │                         │   │                  │
│     │ ┌──────────────┐ │   │  Assistant: I'm good!   │   │  Project Info    │
│     │ │ 📝 Feature X │ │   │                         │   │  ┌─────────────┐ │
│     │ │ 15 messages  │ │   └─────────────────────────┘   │  │ Working Dir │ │
│     │ └──────────────┘ │                                 │  │ /path/to... │ │
│     │                  │   ┌─────────────────────────┐   │  └─────────────┘ │
│     │                  │   │ 输入消息...              │   │                  │
│ ⚙️  │                  │   └─────────────────────────┘   │  Workspace       │
└─────┴──────────────────┴─────────────────────────────────┴──────────────────┘
```

### 4.2 左侧列表区：Session List

**顶部操作区**
```
┌────────────────────────┐
│  ➕ 新建对话            │  ← 点击后弹出模型选择器
└────────────────────────┘
```

**Session 列表项**
```
┌────────────────────────┐
│ 📝 Session Title       │
│ 5 messages             │
│ claude-opus-4-6        │
│ 2 hours ago            │
└────────────────────────┘
```

**交互规则**
- 点击"新建对话"弹出模型选择器（类似当前的 ModelDropdown）
- 选择模型后创建草稿对话，进入中间主工作区
- 点击列表项切换到对应 Session
- 当前激活 Session 高亮显示
- 支持右键菜单：重命名、删除

### 4.3 右侧信息面板：Inspector

显示当前 Session 的详细信息（保持现有 Inspector 功能）：
- Session Info（标题、ID、消息数）
- Model Info（Provider、Model）
- Project Info（工作目录）
- Workspace（文件树）

## 5. Task 模式布局

### 5.1 完整布局

```
┌─────┬──────────────────┬─────────────────────────────────┬──────────────────┐
│     │ Task List        │                                 │  Task Inspector  │
│     │ ┌──────────────┐ │                                 │                  │
│ 💬  │ │ ➕ 新建任务   │ │                                 │  Role List       │
│     │ └──────────────┘ │                                 │  ┌─────────────┐ │
│     │                  │                                 │  │ ✓ PM        │ │
│ 📋  │ ┌──────────────┐ │      Chat Interface             │  │   jiaogushi │ │
│ ✓   │ │ 📋 Feature X │ │                                 │  │   opus-4-6  │ │
│     │ │ 3 roles      │ │   ┌─────────────────────────┐   │  ├─────────────┤ │
│     │ │ Active       │ │   │                         │   │  │   Reviewer  │ │
│     │ └──────────────┘ │   │  User: Implement auth   │   │  │   sdf       │ │
│     │                  │   │                         │   │  │   sonnet-4  │ │
│     │ ┌──────────────┐ │   │  PM: Let me analyze...  │   │  ├─────────────┤ │
│     │ │ 📋 Bug Fix   │ │   │                         │   │  │   Dev       │ │
│     │ │ 2 roles      │ │   │  User: What's next?     │   │  │   alice     │ │
│     │ │ Completed    │ │   │                         │   │  │   haiku-4   │ │
│     │ └──────────────┘ │   │  PM: We should...       │   │  └─────────────┘ │
│     │                  │   │                         │   │                  │
│     │                  │   └─────────────────────────┘   │  Actions         │
│     │                  │                                 │  ┌─────────────┐ │
│     │                  │   ┌─────────────────────────┐   │  │ 📤 Forward  │ │
│     │                  │   │ 输入消息...              │   │  │    Reply    │ │
│     │                  │   └─────────────────────────┘   │  └─────────────┘ │
│     │                  │                                 │                  │
│     │                  │                                 │  Activity Log    │
│     │                  │                                 │  ┌─────────────┐ │
│ ⚙️  │                  │                                 │  │ 10:30 PM    │ │
└─────┴──────────────────┴─────────────────────────────────┤  │ created     │ │
                                                           │  ├─────────────┤ │
                                                           │  │ 10:35 PM    │ │
                                                           │  │ PM replied  │ │
                                                           │  ├─────────────┤ │
                                                           │  │ 10:40 PM    │ │
                                                           │  │ forwarded   │ │
                                                           │  └─────────────┘ │
                                                           └──────────────────┘
```

### 5.2 左侧列表区：Task List

**顶部操作区**
```
┌────────────────────────┐
│  ➕ 新建任务            │  ← 点击后进入 TaskBuilder
└────────────────────────┘
```

**Task 列表项**
```
┌────────────────────────┐
│ 📋 Task Name           │
│ 3 roles                │
│ Active / Completed     │
│ Created 2 days ago     │
└────────────────────────┘
```

**交互规则**
- 点击"新建任务"进入 TaskBuilder（保持现有流程）
- 点击列表项进入该 Task 的工作区
- 当前激活 Task 高亮显示
- 支持右键菜单：重命名、删除、归档

### 5.3 右侧信息面板：Task Inspector

**上半部分：Role List（角色列表）**

```
┌──────────────────────────┐
│  Roles in Task           │
├──────────────────────────┤
│  ✓ Product Manager       │  ← 当前激活角色（高亮）
│    jiaogushi             │
│    claude-opus-4-6       │
│    12 messages           │
├──────────────────────────┤
│    Reviewer              │
│    sdf                   │
│    claude-sonnet-4-6     │
│    5 messages            │
├──────────────────────────┤
│    Developer             │
│    alice                 │
│    claude-haiku-4-5      │
│    0 messages            │
└──────────────────────────┘
```

**交互规则**
- 点击角色卡片切换到该角色的 Session
- 中间主工作区的对话界面随之切换
- 当前激活角色显示 ✓ 标记和高亮背景
- 显示每个角色的基本信息：名称、身份、模型、消息数

**中间部分：Actions（操作按钮）**

```
┌──────────────────────────┐
│  📤 Forward Latest Reply │  ← 转发当前角色最新回复
└──────────────────────────┘
```

**交互规则**
- 点击"Forward Latest Reply"弹出转发弹窗（保持现有 ForwardLatestReplyModal）
- 选择目标角色和添加备注
- 转发后在 Activity Log 中记录

**下半部分：Activity Log（活动日志）**

```
┌──────────────────────────┐
│  Activity Log            │
├──────────────────────────┤
│  🕐 10:30 PM             │
│  Task created            │
├──────────────────────────┤
│  🕐 10:35 PM             │
│  PM sent message         │
├──────────────────────────┤
│  🕐 10:40 PM             │
│  Forwarded to Reviewer   │
├──────────────────────────┤
│  🕐 10:45 PM             │
│  Reviewer replied        │
└──────────────────────────┘
```

**日志内容**
- Task 创建时间
- 角色发送消息
- 转发操作记录
- 角色切换记录
- 按时间倒序排列

## 6. 组件架构

### 6.1 新增组件

```
src/components/
├── MainNavigation.tsx          # 主导航栏（最左侧）
├── NormalMode/
│   ├── NormalModeLayout.tsx    # Normal 模式布局容器
│   └── SessionListPanel.tsx    # Session 列表面板（带新建按钮）
├── TaskMode/
│   ├── TaskModeLayout.tsx      # Task 模式布局容器
│   ├── TaskListPanel.tsx       # Task 列表面板（带新建按钮）
│   └── TaskInspector.tsx       # Task 右侧面板
│       ├── RoleList.tsx        # 角色列表
│       ├── TaskActions.tsx     # 操作按钮
│       └── ActivityLog.tsx     # 活动日志
└── ChatInterface.tsx           # 对话界面（复用）
```

### 6.2 组件层级关系

```
App.tsx
├── MainNavigation
│   ├── Normal Mode Icon
│   ├── Task Mode Icon
│   └── Settings Icon
├── [根据模式渲染]
│   ├── NormalModeLayout
│   │   ├── SessionListPanel
│   │   │   ├── New Chat Button
│   │   │   └── SessionList
│   │   ├── ChatInterface
│   │   └── Inspector (现有)
│   │
│   └── TaskModeLayout
│       ├── TaskListPanel
│       │   ├── New Task Button
│       │   └── TaskList
│       ├── ChatInterface
│       └── TaskInspector
│           ├── RoleList
│           ├── TaskActions
│           └── ActivityLog
└── Settings (弹窗)
```

## 7. 状态管理

### 7.1 App.tsx 新增状态

```typescript
// 主导航模式
const [navigationMode, setNavigationMode] = useState<'normal' | 'task'>('normal');

// Task 模式状态（保持现有）
const [currentTask, setCurrentTask] = useState<Task | null>(null);
const [currentTaskRoleId, setCurrentTaskRoleId] = useState<string | null>(null);

// Normal 模式状态（保持现有）
const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
const [messages, setMessages] = useState<Message[]>([]);
```

### 7.2 模式切换逻辑

```typescript
const handleNavigationModeChange = (mode: 'normal' | 'task') => {
  setNavigationMode(mode);
  
  if (mode === 'normal') {
    // 切换到 Normal 模式
    // 保存当前 Task 状态（如果有）
    // 恢复上次的 Session（如果有）
  } else {
    // 切换到 Task 模式
    // 保存当前 Session 状态（如果有）
    // 恢复上次的 Task（如果有）
  }
};
```

## 8. 交互流程

### 8.1 Normal 模式流程

```
用户点击 Normal 图标
  ↓
左侧显示 Session List
  ↓
用户点击"新建对话"
  ↓
弹出模型选择器
  ↓
选择模型后创建草稿对话
  ↓
中间显示对话界面
  ↓
右侧显示 Inspector
  ↓
用户发送消息
  ↓
草稿转为真实 Session
```

### 8.2 Task 模式流程

```
用户点击 Task 图标
  ↓
左侧显示 Task List
  ↓
用户点击"新建任务"
  ↓
进入 TaskBuilder
  ↓
配置角色和模型
  ↓
创建 Task
  ↓
左侧列表显示新 Task
  ↓
右侧显示角色列表（默认选中第一个）
  ↓
中间显示该角色的对话界面
  ↓
用户点击其他角色
  ↓
中间对话界面切换
  ↓
用户点击"Forward Latest Reply"
  ↓
弹出转发弹窗
  ↓
选择目标角色
  ↓
转发成功，Activity Log 记录
```

## 9. 样式规范

### 9.1 主导航栏

- 宽度：40px
- 背景色：`var(--vscode-activityBar-background)`
- 图标大小：24px
- 图标颜色：`var(--vscode-activityBar-foreground)`
- 激活状态：
  - 背景色：`var(--vscode-activityBar-activeBackground)`
  - 左侧边框：2px solid `var(--vscode-activityBar-activeBorder)`

### 9.2 左侧列表区

- 宽度：240-280px（可调整）
- 背景色：`var(--vscode-sideBar-background)`
- 列表项高度：60-80px
- 列表项间距：8px
- 激活状态背景色：`var(--vscode-list-activeSelectionBackground)`

### 9.3 右侧信息面板

- 宽度：280-320px（可调整）
- 背景色：`var(--vscode-sideBar-background)`
- 分区间距：16px
- 角色卡片高度：80-100px

### 9.4 中间主工作区

- 宽度：flex-grow（自适应）
- 背景色：`var(--vscode-editor-background)`
- 复用现有 ChatInterface 样式

## 10. 实现优先级

### Phase 1: 基础架构（必须）
1. 创建 MainNavigation 组件
2. 实现模式切换逻辑
3. 重构 App.tsx 支持双模式布局

### Phase 2: Normal 模式（必须）
1. 创建 SessionListPanel（移动现有 Sidebar 逻辑）
2. 在列表顶部添加"新建对话"按钮
3. 调整 Inspector 位置到右侧

### Phase 3: Task 模式（必须）
1. 创建 TaskListPanel
2. 创建 TaskInspector（RoleList + TaskActions）
3. 实现角色切换逻辑

### Phase 4: 增强功能（可选）
1. 实现 ActivityLog
2. 添加 Task 状态管理（Active/Completed）
3. 优化动画和过渡效果

## 11. 技术注意事项

### 11.1 状态持久化

- 记住用户上次使用的模式（localStorage）
- Normal 模式记住上次打开的 Session
- Task 模式记住上次打开的 Task 和角色

### 11.2 性能优化

- 列表虚拟化（如果 Session/Task 数量很多）
- 懒加载 Session 消息
- 防抖搜索和过滤

### 11.3 响应式设计

- 小屏幕下左侧列表可折叠
- 右侧面板可隐藏
- 主导航栏始终可见

## 12. 验收标准

### 12.1 功能完整性
- ✅ 主导航栏正确切换模式
- ✅ Normal 模式显示 Session List + Inspector
- ✅ Task 模式显示 Task List + Task Inspector
- ✅ 中间对话界面在两种模式下都能正常工作
- ✅ 角色切换正确更新对话内容
- ✅ 转发功能正常工作

### 12.2 用户体验
- ✅ 模式切换流畅无卡顿
- ✅ 当前激活项清晰可见
- ✅ 操作反馈及时（加载状态、成功提示）
- ✅ 布局合理，信息层级清晰

### 12.3 代码质量
- ✅ 组件职责单一
- ✅ 状态管理清晰
- ✅ 复用现有组件（ChatInterface、Settings）
- ✅ TypeScript 类型完整

## 13. 与现有系统的兼容性

### 13.1 保持不变的部分
- ChatInterface 组件（完全复用）
- Settings 组件（完全复用）
- 后端 API（无需修改）
- Session 生命周期逻辑（无需修改）
- Task 数据结构（无需修改）

### 13.2 需要调整的部分
- App.tsx 布局结构（增加主导航栏）
- Sidebar 逻辑拆分到 SessionListPanel
- Inspector 位置调整到右侧
- TaskWorkspace 重构为 TaskModeLayout

## 14. 后续扩展可能性

### 14.1 更多模式
- 📊 Analytics 模式（查看统计数据）
- 📚 Knowledge Base 模式（管理知识库）
- 🔍 Search 模式（全局搜索）

### 14.2 更多功能
- Task 模板（快速创建常用任务）
- 角色模板（预设常用角色）
- 批量操作（批量删除、归档）
- 导入导出（Task 配置导入导出）

---

## 附录：ASCII 草图汇总

### 完整界面（Normal 模式）
```
┌─────┬──────────────────┬─────────────────────────────────┬──────────────────┐
│ 💬✓ │ ➕ 新建对话       │                                 │   Inspector      │
│ 📋  │ ┌──────────────┐ │                                 │  Session Info    │
│ ⚙️  │ │ 📝 Session 1 │ │      Chat Interface             │  Model Info      │
│     │ │ 📝 Session 2 │ │                                 │  Project Info    │
│     │ └──────────────┘ │                                 │  Workspace       │
└─────┴──────────────────┴─────────────────────────────────┴──────────────────┘
```

### 完整界面（Task 模式）
```
┌─────┬──────────────────┬─────────────────────────────────┬──────────────────┐
│ 💬  │ ➕ 新建任务       │                                 │  Role List       │
│ 📋✓ │ ┌──────────────┐ │                                 │  ┌─────────────┐ │
│ ⚙️  │ │ 📋 Task 1    │ │      Chat Interface             │  │ ✓ Role 1    │ │
│     │ │ 📋 Task 2    │ │                                 │  │   Role 2    │ │
│     │ └──────────────┘ │                                 │  └─────────────┘ │
│     │                  │                                 │  Actions         │
│     │                  │                                 │  Activity Log    │
└─────┴──────────────────┴─────────────────────────────────┴──────────────────┘
```
