# 首次启动 AI Provider 配置提示

**文档状态**: ⏳ 待开发  
**优先级**: 高  
**预计工作量**: 1-2 天  
**创建日期**: 2026-05-09  
**版本**: v1.0

---

## 📋 任务概述

当用户首次启动系统时，不再自动写入默认的 AI Provider 配置，而是在用户尝试使用 AI 功能时，检测到没有配置 AI Provider 的情况下，显示友好的提示弹窗，引导用户前往系统设置配置 AI Provider。

---

## 🎯 目标

1. **移除默认配置写入** - 系统首次启动时不自动创建任何 AI Provider 配置
2. **添加配置检测** - 在用户尝试使用 AI 功能时检测是否有可用的 AI Provider
3. **友好的提示界面** - 显示清晰的提示信息和跳转按钮
4. **无缝跳转** - 点击按钮后直接跳转到设置页面的 AI Provider 配置区域

---

## 🔍 问题分析

### 当前问题

1. **误导用户**
   - 系统首次启动时自动写入默认的 AI Provider 配置
   - 用户误以为已经配置好，但实际上缺少 API Key
   - 导致用户在使用时才发现配置无效

2. **配置不透明**
   - 用户不知道需要配置 AI Provider
   - 没有明确的引导流程

3. **用户体验差**
   - 错误提示不友好
   - 没有快速跳转到配置页面的入口

### 期望行为

1. **首次启动**
   - 不写入任何默认配置
   - `providers` 数组为空

2. **尝试使用 AI 功能时**
   - 检测到没有可用的 AI Provider
   - 显示友好的提示弹窗：
     ```
     ⚠️ 需要配置 AI Provider
     
     您还没有配置任何 AI Provider。
     请先配置 AI Provider 才能使用 AI 功能。
     
     [前往配置] [稍后]
     ```

3. **点击"前往配置"**
   - 打开系统设置弹窗
   - 自动切换到 "AI Providers" 选项卡
   - 用户可以立即添加 AI Provider

---

## 🛠️ 实施方案

### 1. 移除默认配置写入逻辑

**需要检查的文件：**
- `src-tauri/src/config.rs` 或类似的配置初始化文件
- 查找首次启动时写入默认配置的代码

**修改内容：**
```rust
// 移除类似这样的代码：
// if config.providers.is_empty() {
//     config.providers.push(default_provider());
// }

// 改为：
// 不写入任何默认配置，保持 providers 为空数组
```

### 2. 创建 AI Provider 检测组件

**新建文件**: `src/components/NoAIProviderPrompt.tsx`

```typescript
interface NoAIProviderPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToSettings: () => void;
}

export function NoAIProviderPrompt({ isOpen, onClose, onGoToSettings }: NoAIProviderPromptProps) {
  // 显示友好的提示弹窗
  // 提供"前往配置"和"稍后"按钮
}
```

**新建文件**: `src/components/NoAIProviderPrompt.css`
- 现代化的弹窗样式
- 警告图标和清晰的文字说明

### 3. 在关键入口添加检测逻辑

**需要修改的文件：**
- `src/App.tsx` - 添加检测逻辑和状态管理
- `src/components/WelcomePage.tsx` - 在"新建对话"时检测
- `src/components/TaskBuilder.tsx` - 在"新建 Task"时检测

**检测逻辑：**
```typescript
function hasAvailableAIProvider(providers: ProviderConfig[]): boolean {
  return providers.some(provider => 
    provider.enabled && 
    provider.apiKey.trim().length > 0
  );
}

// 在用户尝试使用 AI 功能时调用
if (!hasAvailableAIProvider(availableProviders)) {
  setShowNoAIProviderPrompt(true);
  return; // 阻止继续操作
}
```

### 4. 实现跳转逻辑

**在 App.tsx 中添加：**
```typescript
const handleGoToAIProviderSettings = () => {
  setShowNoAIProviderPrompt(false);
  setIsSettingsOpen(true);
  // 需要传递一��参数让 Settings 组件知道要切换到 providers 选项卡
};
```

**修改 Settings 组件：**
```typescript
interface SettingsProps {
  // ... 现有 props
  initialSection?: SettingsSection; // 新增：初始显示的选项卡
}

// 在 useEffect 中：
useEffect(() => {
  if (isOpen && initialSection) {
    setActiveSection(initialSection);
  }
}, [isOpen, initialSection]);
```

---

## 📝 实施步骤

### Step 1: 后端修改（1-2 小时）
1. 找到配置初始化代码
2. 移除默认 AI Provider 写入逻辑
3. 测试首次启动时配置为空

### Step 2: 创建提示组件（2-3 小时）
1. 创建 `NoAIProviderPrompt.tsx` 和 CSS
2. 实现友好的提示界面
3. 添加"前往配置"和"稍后"按钮

### Step 3: 添加检测逻辑（3-4 小时）
1. 在 App.tsx 中添加状态管理
2. 创建 `hasAvailableAIProvider` 检测函数
3. 在 WelcomePage 和 TaskBuilder 中添加检测

### Step 4: 实现跳转功能（2-3 小时）
1. 修改 Settings 组件支持 `initialSection`
2. 实现跳转逻辑
3. 测试跳转流程

### Step 5: 测试和优化（2-3 小时）
1. 测试首次启动流程
2. 测试提示弹窗显示
3. 测试跳转到设置页面
4. 优化用户体验

---

## 🧪 测试要点

### 测试场景 1: 首次启动
1. 删除配置文件（或使用全新环境）
2. 启动应用
3. **预期**: 不显示任何默认 AI Provider

### 测试场景 2: 尝试新建对话（无配置）
1. 在没有 AI Provider 的情况下
2. 点击"新建对话"
3. **预期**: 显示提示弹窗，阻止创建

### 测试场景 3: 尝试新建 Task（无配置）
1. 在没有 AI Provider 的情况下
2. 点击"新建 Task"
3. **预期**: 显示提示弹窗，阻止创建

### 测试场景 4: 跳转到设置
1. 在提示弹窗中点击"前往配置"
2. **预期**: 
   - 关闭提示弹窗
   - 打开设置弹窗
   - 自动切换到 "AI Providers" 选项卡

### 测试场景 5: 配置后正常使用
1. 添加一个有效的 AI Provider
2. 关闭设置
3. 尝试新建对话或 Task
4. **预期**: 正常创建，不再显示提示

---

## 🎨 UI/UX 设计建议

### 提示弹窗样式
```
┌─────────────────────────────────────┐
│  ⚠️  需要配置 AI Provider           │
│                                     │
│  您还没有配置任何 AI Provider。     │
│  请先配置 AI Provider 才能使用      │
│  AI 功能。                          │
│                                     │
│  [前往配置]  [稍后]                 │
└─────────────────────────────────────┘
```

### 视觉特点
- 使用警告色（橙色或黄色）
- 大图标（⚠️ 或自定义 SVG）
- 清晰的文字说明
- 明显的"前往配置"按钮（主按钮样式）
- 次要的"稍后"按钮（次按钮样式）

---

## 🔗 相关文件

### 需要查找的后端文件
- `src-tauri/src/config.rs`
- `src-tauri/src/main.rs`
- 或其他配置初始化相关文件

### 需要修改的前端文件
- `src/App.tsx`
- `src/components/WelcomePage.tsx`
- `src/components/TaskBuilder.tsx`
- `src/components/Settings.tsx`

### 需要创建的新文件
- `src/components/NoAIProviderPrompt.tsx`
- `src/components/NoAIProviderPrompt.css`

---

## ⚠️ 注意事项

1. **向后兼容**
   - 已有配置的用户不受影响
   - 只影响首次启动的新用户

2. **检测时机**
   - 在用户尝试使用 AI 功能时检测
   - 不要在应用启动时就弹出提示（太突兀）

3. **用户体验**
   - 提示信息要友好、清晰
   - 跳转要无缝、快速
   - 不要重复提示（用户点击"稍后"后，本次会话不再提示）

4. **错误处理**
   - 如果跳转失败，显示错误提示
   - 提供手动打开设置的说明

---

## 📊 验收标准

- ✅ 首次启动时不写入任何默认 AI Provider 配置
- ✅ 在没有 AI Provider 时尝试使用 AI 功能，显示提示弹窗
- ✅ 提示弹窗显示清晰的说明和按钮
- ✅ 点击"前往配置"后，正确跳转到设置页面的 AI Providers 选项卡
- ✅ 点击"稍后"后，关闭弹窗，本次会话不再提示
- ✅ 配置 AI Provider 后，可以正常使用 AI 功能
- ✅ 已有配置的用户不受影响

---

## 🚀 后续优化

1. **引导流程**
   - 首次启动时显示欢迎向导
   - 引导用户配置 AI Provider

2. **配置模板**
   - 提供常见 AI Provider 的配置模板
   - 用户只需填写 API Key

3. **配置验证**
   - 添加 AI Provider 后自动测试连接
   - 显示配置是否有效

---

**文档结束**
