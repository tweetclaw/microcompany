# Handoff 测试指南：模板预览功能

**测试目标**: 使用真实的产品需求验证 PM → Backend → Frontend → QA 的完整 handoff 流程  
**测试任务**: 实现模板预览功能（详见 [handoff-test-task-template-preview.md](./handoff-test-task-template-preview.md)）  
**预计时长**: 1-2 小时

---

## 前置准备

### 1. 确认环境就绪

```bash
# 1. 确认应用已编译最新代码（包含 handoff 修复）
cd /Users/wesley/aiwithblockchain/microcompany
cargo build

# 2. 启动应用
npm run tauri dev

# 3. 打开开发者工具（用于查看日志）
# macOS: Cmd+Option+I
# Windows: Ctrl+Shift+I
```

### 2. 确认测试任务已创建

在数据库中确认存在包含以下角色的任务：
- Product Manager (Pm-alice)
- Backend Developer
- Frontend Developer
- QA Engineer

如果尚未创建，请在应用中创建一个新任务并添加这些角色。

### 3. 准备任务文档

确保以下文档存在且可访问：
- `docs/v2/handoff-test-task-template-preview.md` - 任务摘要
- `docs/v2/team-templates-next-phase-implementation-plan.md` - 完整实施计划（PM 需要参考）
- `docs/v2/team-templates-task-team-testing-guide.md` - 团队演练手册（PM 需要参考）

---

## 测试流程

### 阶段 1: PM 阶段（Pm-alice）

#### 1.1 激活 Product Manager 角色

在任务界面中，确保当前激活角色是 **Pm-alice (Product Manager)**。

#### 1.2 发送初始需求

向 Pm-alice 发送以下消息：

```
我们需要实现 Team Templates 功能的一个核心组件：模板预览。

请先阅读以下文档：
1. docs/v2/handoff-test-task-template-preview.md - 这是我们要实现的具体任务
2. docs/v2/team-templates-next-phase-implementation-plan.md - 完整的实施计划（作为背景参考）

然后帮我：
1. 确认这个任务的范围是否清晰
2. 明确必须做什么、不做什么
3. 定义验收标准
4. 建议下一步应该交给谁，以及发给下一位角色的完整消息
```

#### 1.3 验证 PM 输出

**预期行为**:
- ✅ PM 应该阅读文档并理解任务范围
- ✅ PM 应该输出：
  - 任务范围确认（做什么、不做什么）
  - 验收标准
  - 下一步建议（通常是 Backend Developer）
  - 发给下一位角色的完整交接消息
- ✅ PM 的回复末尾应该包含 `[HANDOFF]` 块

**检查点**:
```
[HANDOFF]
recommended: yes
target_role: Backend Developer
reason: 需要先定义数据结构和接口
draft_message: [完整的交接消息]
[/HANDOFF]
```

**⚠️ 如果 PM 没有输出 HANDOFF 块**:
- 检查 PM 的回复是否明确提到"下一位角色"或"建议交给"
- 如果提到了但没有 HANDOFF 块，这是一个 bug（违反了 prompt contract）
- 如果没有提到，可能是 PM 认为需要更多信息，继续对话

#### 1.4 验证 Handoff 对话框

**预期行为**:
- ✅ 应用应该弹出交接确认对话框
- ✅ 对话框应该显示：
  - 目标角色：Backend Developer
  - 交接原因
  - 交接消息预览

**检查后端日志**（在终端中）:
```
handoff_block_found block_content_length=...
handoff_block_parsed recommended=true target_role_name=Some("Backend Developer") ...
handoff_block_extracted session_id=... recommended=true target_role_name=Some("Backend Developer")
handoff_suggestion_resolved session_id=... recommended=true target_role_id=Some("...") target_role_name=Some("Backend Developer")
```

**检查前端日志**（在浏览器控制台中）:
- ✅ 不应该有 `missing target_role_id` 警告
- ✅ 应该有 handoff suggestion 相关的日志

**❌ 如果对话框没有弹出**:

1. **检查后端日志**:
   - 如果看到 `handoff_target_unresolved`，说明角色名称不匹配
   - 记录 AI 输出的角色名称和可用的角色列表
   - 这可能是 prompt 没有正确引导 AI 使用精确的角色名称

2. **检查前端日志**:
   - 如果看到 `missing target_role_id` 警告，说明后端解析失败
   - 这通常意味着角色名称不匹配

3. **检查 HANDOFF 块格式**:
   - 确认 `target_role` 字段的值是否与数据库中的角色名称完全一致
   - 注意大小写、空格、标点符号

#### 1.5 确认交接

点击对话框中的"确认交接"按钮。

**预期行为**:
- ✅ 当前激活角色应该切换到 Backend Developer
- ✅ 交接消息应该自动发送到新角色的会话中
- ✅ 界面应该显示新角色的上下文

---

### 阶段 2: Backend 阶段

#### 2.1 验证角色切换

确认当前激活角色已切换到 **Backend Developer**。

#### 2.2 验证交接消息

**预期行为**:
- ✅ Backend Developer 的会话中应该包含 PM 发送的交接消息
- ✅ 消息应该包含：
  - 任务背景
  - 需要定义的数据结构
  - 需要实现的接口
  - 验收标准

#### 2.3 Backend 执行任务

Backend Developer 应该：
1. 阅读任务文档（`handoff-test-task-template-preview.md`）
2. 定义 `TaskTemplate` 和 `TemplateRole` 数据结构
3. 实现 `get_template_detail(id)` 接口
4. 提供 2 个 mock 模板数据示例

**不需要真正实现**（这是测试 handoff，不是真正开发）:
- 可以让 Backend Developer 输出设计方案即可
- 重点是验证 Backend 是否会建议交接给 Frontend Developer

#### 2.4 验证 Backend 的 Handoff

**预期行为**:
- ✅ Backend 完成设计后，应该建议交接给 Frontend Developer
- ✅ 回复末尾应该包含 `[HANDOFF]` 块：

```
[HANDOFF]
recommended: yes
target_role: Frontend Developer
reason: 数据结构已定义，可以开始前端实现
draft_message: [完整的交接消息，包含数据结构定义和接口说明]
[/HANDOFF]
```

#### 2.5 确认交接

重复阶段 1.4 和 1.5 的验证步骤，确认交接对话框正常弹出并完成交接。

---

### 阶段 3: Frontend 阶段

#### 3.1 验证角色切换

确认当前激活角色已切换到 **Frontend Developer**。

#### 3.2 验证交接消息

**预期行为**:
- ✅ Frontend Developer 的会话中应该包含 Backend 发送的交接消息
- ✅ 消息应该包含：
  - 数据结构定义
  - 接口说明
  - Mock 数据示例
  - 实现要求

#### 3.3 Frontend 执行任务

Frontend Developer 应该：
1. 实现 `TemplatePreview.tsx` 组件
2. 调用后端接口获取数据
3. 渲染模板信息和角色列表
4. 复用 Team Brief 的展示风格

**不需要真正实现**（这是测试 handoff，不是真正开发）:
- 可以让 Frontend Developer 输出实现方案即可
- 重点是验证 Frontend 是否会建议交接给 QA Engineer

#### 3.4 验证 Frontend 的 Handoff

**预期行为**:
- ✅ Frontend 完成实现后，应该建议交接给 QA Engineer
- ✅ 回复末尾应该包含 `[HANDOFF]` 块：

```
[HANDOFF]
recommended: yes
target_role: QA Engineer
reason: 前端实现已完成，需要测试验证
draft_message: [完整的交接消息，包含实现说明和测试要点]
[/HANDOFF]
```

#### 3.5 确认交接

重复阶段 1.4 和 1.5 的验证步骤，确认交接对话框正常弹出并完成交接。

---

### 阶段 4: QA 阶段

#### 4.1 验证角色切换

确认当前激活角色已切换到 **QA Engineer**。

#### 4.2 验证交接消息

**预期行为**:
- ✅ QA Engineer 的会话中应该包含 Frontend 发送的交接消息
- ✅ 消息应该包含：
  - 实现说明
  - 测试要点
  - 验收标准

#### 4.3 QA 执行任务

QA Engineer 应该：
1. 制定测试清单
2. 验证功能完整性
3. 验证边界情况
4. 输出测试报告

**不需要真正测试**（这是测试 handoff，不是真正开发）:
- 可以让 QA Engineer 输出测试计划即可
- 重点是验证 QA 是否会建议任务完成或返回给其他角色

#### 4.4 验证 QA 的 Handoff

**预期行为**:
- ✅ QA 完成测试后，可能会：
  - 建议任务完成（`recommended: no`）
  - 建议返回给某个角色修复问题（`recommended: yes`）

**如果建议任务完成**:
```
[HANDOFF]
recommended: no
target_role: 
reason: 所有测试通过，任务完成
draft_message: 当前无需发送交接消息
[/HANDOFF]
```

**如果建议返回修复**:
```
[HANDOFF]
recommended: yes
target_role: Frontend Developer
reason: 发现 UI 问题需要修复
draft_message: [问题描述和修复建议]
[/HANDOFF]
```

---

## 成功标准

### 功能层面

- ✅ PM 成功理解任务并输出范围定义
- ✅ Backend 成功定义数据结构和接口
- ✅ Frontend 成功设计实现方案
- ✅ QA 成功制定测试计划

### Handoff 层面

- ✅ 每个角色都能正确输出 `[HANDOFF]` 块
- ✅ 每次交接都能触发确认对话框
- ✅ 对话框显示的信息准确（目标角色、原因、消息）
- ✅ 交接后角色成功切换
- ✅ 交接消息成功传递到下一个角色

### 日志层面

**后端日志应该包含**:
```
handoff_block_found (每次 AI 输出 HANDOFF 块)
handoff_block_parsed (每次成功解析 HANDOFF 块)
handoff_block_extracted (每次提取 HANDOFF 块)
handoff_suggestion_resolved (每次成功解析目标角色)
```

**后端日志不应该包含**:
```
handoff_target_unresolved (说明角色名称不匹配)
```

**前端日志不应该包含**:
```
missing target_role_id (说明后端解析失败)
```

---

## 常见问题排查

### 问题 1: 对话框没有弹出

**可能原因**:
1. AI 没有输出 `[HANDOFF]` 块
2. AI 输出的角色名称不匹配
3. 后端解析失败
4. 前端验证失败

**排查步骤**:
1. 检查 AI 的回复是否包含 `[HANDOFF]` 块
2. 检查后端日志是否有 `handoff_target_unresolved` 警告
3. 检查前端日志是否有 `missing target_role_id` 警告
4. 对比 AI 输出的角色名称和数据库中的角色名称

**解决方案**:
- 如果 AI 没有输出 HANDOFF 块，但明确提到了交接，这是 prompt 的问题
- 如果角色名称不匹配，检查 prompt 是否正确列出了角色名称列表
- 如果后端解析失败，检查 `resolve_handoff_suggestion` 函数的逻辑
- 如果前端验证失败，检查 `handleHandoffSuggestion` 函数的逻辑

### 问题 2: AI 推荐了错误的角色

**可能原因**:
1. Prompt 中的角色列表不准确
2. AI 没有遵循 prompt 的指示
3. 推荐的下游角色列表不正确

**排查步骤**:
1. 检查 `build_handoff_output_contract` 生成的 prompt
2. 确认 `exact_role_names` 是否包含了所有可交接的角色
3. 确认 `recommended_handoff_roles` 是否正确

**解决方案**:
- 如果角色列表不准确，检查 `RolePromptContext` 的构建逻辑
- 如果 AI 没有遵循指示，可能需要进一步强化 prompt

### 问题 3: 交接消息丢失或不完整

**可能原因**:
1. AI 没有在 `draft_message` 中包含完整信息
2. 交接消息没有正确传递到下一个角色

**排查步骤**:
1. 检查 `[HANDOFF]` 块中的 `draft_message` 字段
2. 检查下一个角色的会话历史

**解决方案**:
- 如果 `draft_message` 不完整，可能需要在 prompt 中强调"完整的交接消息"
- 如果消息没有传递，检查前端的交接逻辑

### 问题 4: 角色切换后上下文丢失

**可能原因**:
1. 交接消息没有包含足够的上下文
2. 新角色没有访问权限查看之前的会话

**排查步骤**:
1. 检查交接消息是否包含任务背景、前置工作、当前状态
2. 检查新角色的会话历史是否包含交接消息

**解决方案**:
- 在 prompt 中强调交接消息必须包含完整的上下文
- 确保交接消息被正确添加到新角色的会话历史中

---

## 测试记录模板

建议在测试过程中记录以下信息：

```markdown
## 测试记录

**测试日期**: 2026-05-01  
**测试任务**: 模板预览功能  
**测试人员**: [你的名字]

### PM → Backend

- [ ] PM 输出了 HANDOFF 块
- [ ] 对话框正常弹出
- [ ] 角色成功切换到 Backend Developer
- [ ] 交接消息完整传递
- **问题**: [如果有问题，记录在这里]

### Backend → Frontend

- [ ] Backend 输出了 HANDOFF 块
- [ ] 对话框正常弹出
- [ ] 角色成功切换到 Frontend Developer
- [ ] 交接消息完整传递
- **问题**: [如果有问题，记录在这里]

### Frontend → QA

- [ ] Frontend 输出了 HANDOFF 块
- [ ] 对话框正常弹出
- [ ] 角色成功切换到 QA Engineer
- [ ] 交接消息完整传递
- **问题**: [如果有问题，记录在这里]

### QA 完成

- [ ] QA 输出了 HANDOFF 块（recommended: no 或返回修复）
- [ ] 如果建议完成，对话框没有弹出（符合预期）
- [ ] 如果建议返回修复，对话框正常弹出
- **问题**: [如果有问题，记录在这里]

### 总体评价

- **成功的交接次数**: ___ / 3
- **发现的问题数量**: ___
- **Handoff 功能是否稳定**: 是 / 否
- **备注**: [其他观察和建议]
```

---

## 下一步

完成这个测试后，你可以：

1. **如果测试成功**:
   - 记录测试结果
   - 将这个测试流程标准化，用于未来的 handoff 功能验证
   - 考虑实施更复杂的多角色协作场景

2. **如果测试失败**:
   - 根据"常见问题排查"部分定位问题
   - 修复问题后重新测试
   - 更新相关文档（如 `handoff-bug-fix-implementation.md`）

3. **扩展测试**:
   - 测试更复杂的交接场景（如 QA 返回给 Frontend 修复）
   - 测试边界情况（如只有一个角色、角色名称包含特殊字符）
   - 测试 `recommended: no` 的情况

---

## 相关文档

- [handoff-test-task-template-preview.md](./handoff-test-task-template-preview.md) - 测试任务摘要
- [handoff-bug-fix-implementation.md](./handoff-bug-fix-implementation.md) - Handoff 修复实施总结
- [handoff-bug-root-cause-analysis.md](./handoff-bug-root-cause-analysis.md) - 根本原因分析
- [team-templates-task-team-testing-guide.md](./team-templates-task-team-testing-guide.md) - 团队演练手册（背景参考）
