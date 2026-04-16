# 自定义标题栏实现方案

## 当前情况分析

### 1. Tauri 配置
- **没有自定义标题栏配置**：`tauri.conf.json` 中使用的是默认的系统标题栏
- 窗口配置：1680x1050，最小尺寸 1280x800
- **这就是你看到白色顶部栏的原因** - 那是 macOS 的系统标题栏

### 2. 当前布局结构
```
App.tsx (根组件)
  └─ ChatInterface.tsx
       ├─ Toolbar (工具栏，包含工作目录、模型选择、新建按钮、3个切换按钮、设置按钮)
       └─ IDE Workspace (左侧栏、主区域、右侧栏、底部终端)
```

### 3. 样式系统
- 使用深色主题：`--bg-primary: #0A1628`（深蓝黑色）
- Toolbar 背景：`--bg-tertiary: #1A2942`（稍浅的深蓝色）
- 工具栏高度：`--toolbar-height: 56px`

## 实现方案

采用**自定义标题栏方案**，具体实现：

### 第一步：修改 Tauri 配置
在 `tauri.conf.json` 的 windows 配置中添加：
```json
"decorations": false,  // 隐藏系统标题栏
"titleBarStyle": "Overlay"  // 或者使用 overlay 模式
```

### 第二步：创建 TitleBar 组件
新建 `src/components/TitleBar.tsx`，包含：
- **左侧**：应用图标/名称（可选）
- **中间**：可拖拽区域（使用 `data-tauri-drag-region` 属性）
- **右侧**：
  - 3个面板切换按钮（左侧栏、右侧栏、底部终端）
  - 分隔线
  - 窗口控制按钮（最小化、最大化/还原、关闭）

### 第三步：调整布局
- 将 TitleBar 放在 `App.tsx` 或 `ChatInterface.tsx` 的最顶层
- 调整 Toolbar 的内容，移除重复的切换按钮
- 或者将 Toolbar 和 TitleBar 合并成一个组件

### 第四步：实现窗口控制逻辑
使用 Tauri API：
```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();
appWindow.minimize();
appWindow.toggleMaximize();
appWindow.close();
```

## 优势
1. ✅ 完全控制标题栏颜色，与深色主题完美匹配
2. ✅ 3个切换按钮和窗口控制按钮在同一行
3. ✅ 类似 VS Code 的专业 IDE 体验
4. ✅ 可以自定义拖拽区域和按钮位置

## 需要注意的点
- macOS、Windows、Linux 的窗口控制按钮位置不同（macOS 在左，Windows/Linux 在右）
- 需要处理最大化/还原状态的图标切换
- 拖拽区域需要正确设置，避免影响按钮点击
