# 开发任务：阶段 3 - UI Handoff 确认界面实现

**任务编号**: Phase 3  
**创建日期**: 2026-05-04  
**预计工期**: 2-3 天  
**前置依赖**: Phase 2 - JSON API 实现完成  
**后续任务**: Phase 4 - 测试与优化

---

## 1. 任务目标

实现用户友好的 handoff 确认界面，显示任务摘要、关键需求和 AI 推荐的接手角色。

### 核心价值

> **让用户清晰地看到任务交接内容，并保留最终决策权，避免 AI 误判导致的工作流混乱。**

---

## 2. UI 设计规范

### 2.1 整体布局

```
┌─────────────────────────────────────────────────┐
│ 产品经理 (当前对话)                                │
│ [对话内容...]                                      │
│                                                   │
│ > 需求分析完成,建议交接给开发工程师                  │
│                                                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 📋 任务摘要                                       │
│ 实现用户登录、数据展示和报表导出功能                │
│                                                   │
│ 关键需求:                                         │
│ • 用户登录                                        │
│ • 数据展示                                        │
│ • 报表导出                                        │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 选择接手成员                                      │
│                                                   │
│ ⭐ 开发工程师  [接手] ← AI 推荐 (高亮显示)         │
│    测试工程师  [接手]                             │
│    设计师      [接手]                             │
│                                                   │
└─────────────────────────────────────────────────┘
```

### 2.2 组件设计

#### 组件 1：任务摘要卡片 (TaskSummaryCard)

**功能**：
- 显示任务摘要（`task_summary`）
- 显示关键需求列表（`key_requirements`）
- 提供清晰的视觉层次

**Props**：
```typescript
interface TaskSummaryCardProps {
  taskSummary: string;
  keyRequirements: string[];
}
```

**样式要求**：
- 使用卡片容器，带边框和阴影
- 标题使用图标 📋 + "任务摘要"
- 关键需求使用列表样式，每项前加 • 符号
- 响应式设计，移动端友好

#### 组件 2：角色选择列表 (RoleSelectionList)

**功能**：
- 显示所有可接手的角色
- 高亮显示 AI 推荐的角色（⭐ 标记）
- 提供【接手】按钮
- 支持点击选择

**Props**：
```typescript
interface RoleSelectionListProps {
  roles: Role[];
  suggestedRoleId?: string;
  currentRoleId: string;
  onSelectRole: (roleId: string) => void;
}
```

**样式要求**：
- 推荐角色使用高亮背景色（如浅蓝色）
- 推荐角色前显示 ⭐ 图标
- 【接手】按钮使用主色调
- Hover 状态提供视觉反馈

#### 组件 3：Handoff 确认对话框 (HandoffConfirmationModal)

**功能**：
- 整合任务摘要卡片和角色选择列表
- 提供确认和取消操作
- 处理用户选择并触发 handoff

**Props**：
```typescript
interface HandoffConfirmationModalProps {
  visible: boolean;
  handoffInfo: HandoffInfo;
  roles: Role[];
  currentRoleId: string;
  onConfirm: (targetRoleId: string) => Promise<void>;
  onCancel: () => void;
}
```

---

## 3. 实施步骤

### 3.1 创建任务摘要卡片组件

**文件**：`src/components/TaskSummaryCard.tsx`

**实现要点**：
1. 接收 `taskSummary` 和 `keyRequirements` props
2. 使用 Tailwind CSS 实现卡片样式
3. 关键需求使用列表渲染
4. 添加适当的间距和排版

**示例代码**：
```typescript
export function TaskSummaryCard({ taskSummary, keyRequirements }: TaskSummaryCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">📋</span>
        <h3 className="text-lg font-semibold">任务摘要</h3>
      </div>
      <p className="text-gray-700 mb-3">{taskSummary}</p>
      {keyRequirements.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">关键需求:</p>
          <ul className="space-y-1">
            {keyRequirements.map((req, index) => (
              <li key={index} className="text-gray-700 flex items-start">
                <span className="mr-2">•</span>
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

### 3.2 创建角色选择列表组件

**文件**：`src/components/RoleSelectionList.tsx`

**实现要点**：
1. 过滤掉当前角色（不能交接给自己）
2. 高亮显示推荐角色
3. 为每个角色添加【接手】按钮
4. 处理点击事件

**示例代码**：
```typescript
export function RoleSelectionList({
  roles,
  suggestedRoleId,
  currentRoleId,
  onSelectRole,
}: RoleSelectionListProps) {
  const availableRoles = roles.filter(role => role.id !== currentRoleId);

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold mb-3">选择接手成员</h3>
      {availableRoles.map(role => {
        const isRecommended = role.id === suggestedRoleId;
        return (
          <div
            key={role.id}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              isRecommended
                ? 'bg-blue-50 border-blue-200'
                : 'bg-white border-gray-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {isRecommended && <span className="text-yellow-500">⭐</span>}
              <span className="font-medium">{role.name}</span>
              {isRecommended && (
                <span className="text-xs text-blue-600">AI 推荐</span>
              )}
            </div>
            <button
              onClick={() => onSelectRole(role.id)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              接手
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

### 3.3 创建 Handoff 确认对话框

**文件**：`src/components/HandoffConfirmationModal.tsx`

**实现要点**：
1. 整合任务摘要卡片和角色选择列表
2. 使用 Modal 组件包装
3. 处理确认和取消操作
4. 添加加载状态

**示例代码**：
```typescript
export function HandoffConfirmationModal({
  visible,
  handoffInfo,
  roles,
  currentRoleId,
  onConfirm,
  onCancel,
}: HandoffConfirmationModalProps) {
  const [loading, setLoading] = useState(false);

  const handleSelectRole = async (targetRoleId: string) => {
    setLoading(true);
    try {
      await onConfirm(targetRoleId);
    } catch (error) {
      console.error('Handoff failed:', error);
      // 显示错误提示
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal onClose={onCancel}>
      <div className="space-y-4">
        <TaskSummaryCard
          taskSummary={handoffInfo.task_summary}
          keyRequirements={handoffInfo.key_requirements}
        />
        <RoleSelectionList
          roles={roles}
          suggestedRoleId={handoffInfo.suggested_role}
          currentRoleId={currentRoleId}
          onSelectRole={handleSelectRole}
        />
      </div>
    </Modal>
  );
}
```

### 3.4 集成到 ChatInterface

**文件**：`src/components/ChatInterface.tsx`

**实现要点**：
1. 在 AI 对话结束后调用 Phase 2 的 API
2. 如果 `has_handoff: true`，显示确认对话框
3. 处理用户选择并执行 handoff
4. 更新 UI 状态

**集成代码**：
```typescript
const [handoffInfo, setHandoffInfo] = useState<HandoffInfo | null>(null);
const [showHandoffModal, setShowHandoffModal] = useState(false);

const handleAIResponseComplete = async () => {
  if (!currentRole || !lastAIMessage) return;
  
  try {
    const info = await extractHandoffSuggestion(
      currentRole.name,
      lastAIMessage.content,
      apiKey,
      model
    );
    
    if (info.has_handoff) {
      setHandoffInfo(info);
      setShowHandoffModal(true);
    }
  } catch (error) {
    console.error('Failed to extract handoff info:', error);
  }
};

const handleHandoffConfirm = async (targetRoleId: string) => {
  // 执行 handoff 逻辑
  await forwardToRole(targetRoleId, handoffInfo);
  setShowHandoffModal(false);
  setHandoffInfo(null);
};

return (
  <>
    {/* 现有的聊天界面 */}
    
    <HandoffConfirmationModal
      visible={showHandoffModal}
      handoffInfo={handoffInfo}
      roles={taskRoles}
      currentRoleId={currentRole.id}
      onConfirm={handleHandoffConfirm}
      onCancel={() => setShowHandoffModal(false)}
    />
  </>
);
```

---

## 4. UI 交互逻辑

### 4.1 触发时机

1. AI 对话结束后自动调用 JSON API
2. 如果 `has_handoff: true`，显示确认对话框
3. 如果 `has_handoff: false`，不显示任何 UI

### 4.2 用户操作流程

```
AI 对话结束
    ↓
自动调用 JSON API
    ↓
has_handoff: true?
    ↓ Yes
显示任务摘要卡片
    ↓
显示角色选择列表（推荐角色高亮）
    ↓
用户点击某个角色的【接手】按钮
    ↓
执行 handoff（传递 task_summary 和 key_requirements）
    ↓
切换到目标角色的对话界面
    ↓
目标角色收到初始消息（包含任务摘要）
```

### 4.3 边界情况处理

**情况 1：API 调用失败**
- 不显示确认对话框
- 记录错误日志
- 用户可以手动选择角色（使用现有的 handoff 机制）

**情况 2：推荐角色不在团队中**
- 仍然显示确认对话框
- 不高亮任何角色
- 用户可以从所有角色中选择

**情况 3：只有一个其他角色**
- 显示确认对话框
- 自动高亮该角色（如果 AI 推荐了它）
- 用户仍需点击确认

**情况 4：用户取消操作**
- 关闭确认对话框
- 不执行 handoff
- 用户可以继续与当前角色对话

---

## 5. 测试要求

### 5.1 组件测试

**TaskSummaryCard 测试**：
- 正确显示任务摘要
- 正确渲染关键需求列表
- 空需求列表时不显示列表部分

**RoleSelectionList 测试**：
- 过滤掉当前角色
- 正确高亮推荐角色
- 点击按钮触发回调

**HandoffConfirmationModal 测试**：
- 正确整合子组件
- 处理确认和取消操作
- 显示加载状态

### 5.2 集成测试

**测试场景 1：完整的 handoff 流程**
1. AI 完成对话
2. 自动提取 handoff 信息
3. 显示确认对话框
4. 用户选择推荐角色
5. 成功切换到目标角色

**测试场景 2：用户选择非推荐角色**
1. AI 推荐角色 A
2. 用户选择角色 B
3. 成功切换到角色 B

**测试场景 3：用户取消操作**
1. 显示确认对话框
2. 用户点击取消
3. 对话框关闭
4. 保持在当前角色

### 5.3 用户体验测试

**测试要点**：
- 对话框显示是否流畅
- 推荐角色高亮是否明显
- 按钮点击反馈是否及时
- 移动端显示是否正常
- 长文本是否正确换行

---

## 6. 成功标准

只有当下面这些条件都满足时，才认为阶段 3 完成：

1. ✅ TaskSummaryCard 组件实现完成
2. ✅ RoleSelectionList 组件实现完成
3. ✅ HandoffConfirmationModal 组件实现完成
4. ✅ 集成到 ChatInterface 完成
5. ✅ AI 推荐角色正确高亮显示
6. ✅ 用户可以选择任意角色接手
7. ✅ 任务摘要和关键需求正确显示
8. ✅ 组件测试通过
9. ✅ 集成测试通过（3 个测试场景）
10. ✅ 用户体验测试通过
11. ✅ 响应式设计在移动端正常工作

---

## 7. 样式规范

### 7.1 颜色方案

- **推荐角色背景**：`bg-blue-50`（浅蓝色）
- **推荐角色边框**：`border-blue-200`
- **推荐角色标签**：`text-blue-600`
- **按钮主色**：`bg-blue-600`
- **按钮 Hover**：`bg-blue-700`
- **卡片边框**：`border-gray-200`
- **文本主色**：`text-gray-700`
- **文本次要色**：`text-gray-600`

### 7.2 间距规范

- **卡片内边距**：`p-4`
- **组件间距**：`space-y-4`
- **列表项间距**：`space-y-2`
- **按钮内边距**：`px-4 py-2`

### 7.3 圆角规范

- **卡片圆角**：`rounded-lg`
- **按钮圆角**：`rounded-md`

---

## 8. 与现有 UI 的关系

### 8.1 ForwardLatestReplyModal

**现有组件**：`src/components/ForwardLatestReplyModal.tsx`

**关系**：
- 现有组件用于手动 handoff（用户主动触发）
- 新组件用于 AI 推荐 handoff（AI 对话结束后自动触发）
- 两者可以共存，互不冲突

**复用策略**：
- 可以复用现有的 handoff 执行逻辑
- 可以复用现有的角色选择 UI 元素
- 新组件增加任务摘要显示功能

### 8.2 集成方式

**选项 1：创建新组件**
- 优点：独立性强，不影响现有功能
- 缺点：可能有代码重复

**选项 2：扩展现有组件**
- 优点：代码复用，统一管理
- 缺点：可能增加组件复杂度

**推荐**：选项 1（创建新组件），因为：
- 触发时机不同（自动 vs 手动）
- UI 需求不同（有任务摘要 vs 无任务摘要）
- 保持现有功能稳定

---

## 9. 注意事项

### 9.1 性能优化

- 使用 `React.memo` 优化组件渲染
- 避免不必要的状态更新
- 对话框使用懒加载

### 9.2 可访问性

- 添加适当的 ARIA 标签
- 支持键盘导航
- 确保颜色对比度符合 WCAG 标准

### 9.3 国际化

- 预留国际化支持
- 文本使用变量而非硬编码
- 考虑不同语言的文本长度

---

## 10. 相关文档

- `docs/v2/intelligent-routing-design.md` - 智能路由方案设计
- `docs/v2/task-card-ai-handoff-implementation.md` - 完整实施计划
- `docs/task/phase2-json-api-handoff-extraction.md` - 阶段 2 JSON API 实现

---

**任务状态**: 待开始  
**负责人**: 待分配  
**开始日期**: 待定  
**完成日期**: 待定
