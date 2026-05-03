# 清理无效 Handoff 方案

**文档状态**: 待执行  
**创建日期**: 2026-05-03  
**原因**: 经过测试，当前的 handoff bug 修复方案无效，需要清理相关代码和文档

---

## 背景

当前实施的 handoff 模板占位符替换方案（`{{role}}` 替换机制）经过实际测试后证明**无效**。为避免代码库中保留无效实现，需要系统性清理相关代码和文档。

---

## 清理范围

### 1. 文档清理

需要删除以下 5 个文档：

- `docs/v2/handoff-bug-fix-implementation.md` - 修复实施方案
- `docs/v2/handoff-bug-root-cause-analysis.md` - 根因分析报告
- `docs/v2/handoff-investigation-transfer.md` - 调查工作交接
- `docs/v2/handoff-test-guide-template-preview.md` - 测试指南模板预览
- `docs/v2/handoff-test-task-template-preview.md` - 任务模板预览

### 2. 代码清理

根据最终确定的**混合方案**（AI 推荐 + 用户确认），采用以下清理策略：

#### 清理范围

**需要删除**：
- 所有与 `{{role}}` 占位符替换相关的代码
- 模板解析中的占位符处理逻辑
- 角色解析中的占位符处理逻辑
- 消息格式化中的占位符处理逻辑

**需要保留**：
- handoff 内容生成逻辑（因为旧方案确实能产生 handoff 内容）
- 现有的对话流程和消息传递机制
- 角色管理和团队协作的基础代码

**需要新增**：
- JSON API 调用逻辑（用于提取和结构化 handoff 内容）
- UI 接手按钮组件
- 任务摘要显示组件
- 角色推荐高亮逻辑

---

## 清理步骤

### 阶段 1：确定清理策略

1. 阅读 `docs/v2/intelligent-routing-design.md`
2. 根据最终选定的智能路由方案，确定采用方案 A 还是方案 B
3. 与团队确认清理范围

### 阶段 2：代码清理

**待智能路由方案确定后补充具体清理步骤**

可能涉及的文件（需进一步确认）：
- 前端模板渲染相关代码
- 后端角色解析相关代码
- 消息格式化相关代码

### 阶段 3：文档清理

执行以下命令删除无效文档：

```bash
rm docs/v2/handoff-bug-fix-implementation.md
rm docs/v2/handoff-bug-root-cause-analysis.md
rm docs/v2/handoff-investigation-transfer.md
rm docs/v2/handoff-test-guide-template-preview.md
rm docs/v2/handoff-test-task-template-preview.md
```

### 阶段 4：验证清理结果

1. 搜索代码库中是否还有对已删除逻辑的引用
2. 确认没有遗留的测试用例引用已删除的代码
3. 运行项目确保没有因清理导致的运行时错误

---

## 注意事项

1. **先确定智能路由方案，再执行代码清理** - 避免删除可能复用的代码
2. **保留 Git 历史** - 不要使用 `git filter-branch` 等工具删除历史记录
3. **创建清理分支** - 在独立分支上执行清理工作，便于回滚
4. **记录清理决策** - 在 commit message 中说明为什么删除这些代码

---

## 后续工作

清理完成后，根据 `docs/v2/intelligent-routing-design.md` 中确定的方案，开始实施新的智能路由机制。

---

## 相关文档

- [智能路由方案设计](./intelligent-routing-design.md) - 新的 handoff 机制设计
