# 手动测试指南：角色定义文件修复验证

## 测试目标

验证以下核心修复：
1. ✅ 启动时自动同步 `.md` 文件到 `~/.microcompany/archetypes/role-definitions/`
2. ✅ `Software Architect`、`Code Reviewer`、`QA Engineer` 三个新角色能正确读取 `.md` 文件
3. ✅ 角色映射表正确（`quality_assurance` → `qa_engineer.md`）
4. ✅ Handoff 自动交接流程正常工作

---

## 测试场景：UI/UX 重构项目

**任务背景**：重构 microcompany2 的 UI/UX 设计，改进用户体验

**团队配置**：
- **a. Product Manager** (PM) - 需求分析
- **b. Software Architect** - 技术方案设计 ← **新角色**
- **c. Frontend Developer** - 实现 UI 组件
- **d. QA Engineer** - 测试验证 ← **重写的角色**
- **e. Code Reviewer** - 代码审查 ← **新角色**

---

## 测试用例 1：启动验证 + 文件同步

### 目标
验证应用启动时自动同步 `.md` 文件

### 操作步骤

1. **清理运行时目录**（模拟首次启动）
   ```bash
   rm -rf ~/.microcompany/archetypes/role-definitions/
   ```

2. **启动应用**
   ```bash
   npm run tauri dev
   ```

3. **检查同步结果**
   ```bash
   ls -lh ~/.microcompany/archetypes/role-definitions/
   ```

### 预期结果

✅ 应该看到 5 个 `.md` 文件：
```
product_manager.md
frontend_developer.md
backend_developer.md
software_architect.md      ← 新创建
code_reviewer.md           ← 新创建
qa_engineer.md             ← 重写为软件 QA
```

✅ Console 日志应显示：
```
[Sync] 同步角色定义文件...
[Sync] 复制: software_architect.md
[Sync] 复制: code_reviewer.md
[Sync] 复制: qa_engineer.md
```

---

## 测试用例 2：完整 Handoff 自动交接流程

### 目标
验证 PM → Architect → Frontend → QA → Code Reviewer 的自动交接链路

### 前置准备

1. **创建 Task**
   - 名称：`UI/UX 重构`
   - 描述：`重构 ChatInterface 和 TaskModeLayout 组件，改进交互体验`
   - 工作目录：`/Users/wesley/aiwithblockchain/microcompany2`

2. **配置团队**（按顺序添加 5 个角色）

   | 角色名称 | Archetype | Model | Handoff |
   |---------|-----------|-------|---------|
   | PM | Product Manager | claude-3-7-sonnet | ✅ |
   | 架构师 | Software Architect | claude-3-7-sonnet | ✅ |
   | 前端 | Frontend Developer | claude-3-7-sonnet | ✅ |
   | QA | Quality Assurance | claude-3-7-sonnet | ✅ |
   | 审查员 | Code Reviewer | claude-3-7-sonnet | ✅ |

---

### 阶段 1：PM 需求分析

#### 操作
1. 点击 Task 进入，默认激活 **PM** 角色
2. 发送消息：
   ```
   我们需要重构 ChatInterface 组件的 UI/UX，当前的问题是：
   1. 消息列表滚动不流畅
   2. 输入框在长文本时体验不好
   3. Handoff 交接弹窗的视觉层级不清晰
   
   请分析这些问题，并给出改进建议。
   ```

#### 预期结果

✅ **Console 日志**（关键验证点）：
```
[ChatInterface] AI 开始响应...
[Tool Use] Read: ~/.microcompany/archetypes/role-definitions/product_manager.md
```

✅ **PM 的回复应该包含**：
- 对 3 个问题的分析
- 改进建议（如：虚拟滚动、自适应输入框、视觉层级优化）
- **最后一行包含 handoff 标签**：
  ```
  <handoff>b</handoff>
  ```
  （`b` 是 Software Architect 的编号）

✅ **自动弹出交接弹窗**：
- 标题：`🔄 工作交接`
- 显示：`PM 完成了当前工作，请选择接手人员继续处理`
- **AI 推荐区域**（蓝色背景）：
  ```
  💡 AI 推荐
  架构师 (Software Architect)
  推荐理由：需要设计技术方案...
  ```

---

### 阶段 2：Software Architect 技术方案设计

#### 操作
1. 在交接弹窗中，确认选择 **架构师**
2. （可选）添加交接说明：`请重点考虑性能优化`
3. 点击 **✓ 确认交接**

#### 预期结果

✅ **自动切换到架构师角色**

✅ **Console 日志**（核心验证点）：
```
[Forward] Starting handoff forwarding
  fromRoleName: "PM"
  targetRoleName: "架构师"
[ChatInterface] AI 开始响应...
[Tool Use] Read: ~/.microcompany/archetypes/role-definitions/software_architect.md  ← 关键！
```

✅ **架构师的回复应该包含**：
- 技术方案设计（组件架构、状态管理、性能优化策略）
- 实现建议（如：使用 `react-window` 虚拟滚动、`useAutosize` hook）
- **最后一行包含 handoff 标签**：
  ```
  <handoff>c</handoff>
  ```
  （`c` 是 Frontend Developer 的编号）

✅ **再次弹出交接弹窗**，推荐 **前端**

---

### 阶段 3：Frontend Developer 实现

#### 操作
1. 确认交接给 **前端**
2. 点击 **✓ 确认交接**

#### 预期结果

✅ **Console 日志**：
```
[Tool Use] Read: ~/.microcompany/archetypes/role-definitions/frontend_developer.md
```

✅ **前端的回复应该包含**：
- 代码实现（React 组件重构）
- 可能会调用 `Read` 工具读取现有代码
- **最后一行包含 handoff 标签**：
  ```
  <handoff>d</handoff>
  ```
  （`d` 是 QA Engineer 的编号）

---

### 阶段 4：QA Engineer 测试验证

#### 操作
1. 确认交接给 **QA**
2. 点击 **✓ 确认交接**

#### 预期结果

✅ **Console 日志**（核心验证点）：
```
[Tool Use] Read: ~/.microcompany/archetypes/role-definitions/qa_engineer.md  ← 关键！
```

✅ **QA 的回复应该是软件测试内容**（不是 ML 模型审计）：
- 测试用例设计（功能测试、性能测试、兼容性测试）
- 测试计划（测试范围、测试环境、验收标准）
- 可能的风险点
- **最后一行包含 handoff 标签**：
  ```
  <handoff>e</handoff>
  ```
  （`e` 是 Code Reviewer 的编号）

❌ **如果 QA 还在做 ML 模型审计**（提到 model bias、fairness、data quality），说明 `qa_engineer.md` 没有正确同步或读取

---

### 阶段 5：Code Reviewer 代码审查

#### 操作
1. 确认交接给 **审查员**
2. 点击 **✓ 确认交接**

#### 预期结果

✅ **Console 日志**（核心验证点）：
```
[Tool Use] Read: ~/.microcompany/archetypes/role-definitions/code_reviewer.md  ← 关键！
```

✅ **Code Reviewer 的回复应该包含**：
- 代码审查意见（代码质量、最佳实践、潜在问题）
- 改进建议（性能优化、可维护性、安全性）
- 可能会调用 `Read` 工具读取代码
- **最后一行包含 handoff 标签**：
  ```
  <handoff></handoff>
  ```
  （空标签表示工作完成，不需要交接）

---

## 测试用例 3：角色映射验证

### 目标
验证 `quality_assurance` archetype 正确映射到 `qa_engineer.md`

### 操作步骤

1. **创建简单 Task**
   - 名称：`映射测试`
   - 只添加 1 个角色：
     - 角色名称：`测试员`
     - Archetype：**Quality Assurance**
     - Model：`claude-3-7-sonnet`

2. **发送测试消息**
   ```
   请介绍一下你的角色和职责
   ```

### 预期结果

✅ **Console 日志**：
```
[Tool Use] Read: ~/.microcompany/archetypes/role-definitions/qa_engineer.md
```

✅ **AI 回复应该是软件 QA 的职责**：
- 测试计划编写
- 测试用例设计
- 缺陷跟踪
- 质量保证流程

❌ **不应该提到**：
- Model evaluation
- Bias detection
- Data quality assessment

---

## 故障排查

### 问题 1：AI 没有读取 .md 文件

**症状**：Console 中没有看到 `[Tool Use] Read: ...role-definitions/...`

**排查步骤**：
1. 检查文件是否存在：
   ```bash
   ls -lh ~/.microcompany/archetypes/role-definitions/
   ```
2. 检查 `mod.rs` 中的路径映射：
   ```bash
   grep -A 20 "fn get_role_definition_file_name" src-tauri/src/archetypes/mod.rs
   ```
3. 检查 Task 创建时的日志：
   ```bash
   # 在 Console 中搜索 "build_role_system_prompt"
   ```

---

### 问题 2：QA Engineer 还在做 ML 模型审计

**症状**：QA 的回复提到 "model bias"、"fairness"、"data quality"

**原因**：`qa_engineer.md` 没有正确同步或内容错误

**解决方案**：
1. 手动检查文件内容：
   ```bash
   head -n 50 ~/.microcompany/archetypes/role-definitions/qa_engineer.md
   ```
2. 应该看到：
   ```markdown
   # Quality Assurance Engineer
   
   ## Role Overview
   You are a Quality Assurance Engineer specializing in software testing...
   ```
3. 如果内容不对，重新复制：
   ```bash
   cp src-tauri/resources/role-definitions/qa_engineer.md \
      ~/.microcompany/archetypes/role-definitions/
   ```

---

### 问题 3：Handoff 弹窗没有弹出

**症状**：AI 回复包含 `<handoff>` 标签，但没有弹出交接弹窗

**排查步骤**：
1. 检查 Console 日志：
   ```
   [Handoff Observer] 检测到 handoff 标签
   ```
2. 检查角色是否启用了 Handoff：
   - 在 Task 配置中，确认 **Handoff Enabled** 开关是打开的
3. 检查是否有其他团队成员：
   - 交接需要至少 2 个角色

---

## 快速验证脚本

运行以下脚本快速检查所有修复是否生效：

```bash
#!/bin/bash

echo "🔍 检查角色定义文件..."
echo ""

# 检查文件是否存在
FILES=(
  "product_manager.md"
  "frontend_developer.md"
  "backend_developer.md"
  "software_architect.md"
  "code_reviewer.md"
  "qa_engineer.md"
)

ROLE_DIR="$HOME/.microcompany/archetypes/role-definitions"

for file in "${FILES[@]}"; do
  if [ -f "$ROLE_DIR/$file" ]; then
    size=$(wc -c < "$ROLE_DIR/$file")
    echo "✅ $file ($size bytes)"
  else
    echo "❌ $file (缺失)"
  fi
done

echo ""
echo "🔍 检查 QA Engineer 内容..."
if grep -q "software testing" "$ROLE_DIR/qa_engineer.md"; then
  echo "✅ qa_engineer.md 内容正确（软件测试）"
else
  echo "❌ qa_engineer.md 内容错误（可能还是 ML 模型审计）"
fi

echo ""
echo "🔍 检查映射表..."
if grep -q '"quality_assurance" => "qa_engineer"' src-tauri/src/archetypes/mod.rs; then
  echo "✅ quality_assurance 映射正确"
else
  echo "❌ quality_assurance 映射缺失"
fi

echo ""
echo "✅ 验证完成"
```

保存为 `verify_fix.sh`，然后运行：
```bash
chmod +x verify_fix.sh
./verify_fix.sh
```

---

## 测试通过标准

所有以下条件都满足，才算测试通过：

- [x] 启动时自动同步 5 个 `.md` 文件
- [x] Software Architect 能读取 `software_architect.md`
- [x] Code Reviewer 能读取 `code_reviewer.md`
- [x] QA Engineer 能读取 `qa_engineer.md`，且内容是软件测试（不是 ML 模型审计）
- [x] Handoff 自动交接流程正常工作（PM → Architect → Frontend → QA → Reviewer）
- [x] 交接弹窗正确显示 AI 推荐的接手人
- [x] 角色切换后，新角色能正确读取自己的 `.md` 文件

---

## 预计测试时间

- **测试用例 1**（启动验证）：5 分钟
- **测试用例 2**（完整流程）：20-30 分钟
- **测试用例 3**（映射验证）：5 分钟

**总计**：30-40 分钟

---

## 注意事项

1. **Console 日志是关键验证点**：必须看到 `[Tool Use] Read: ...role-definitions/...` 才算成功
2. **Handoff 标签格式**：AI 必须输出 `<handoff>字母编号</handoff>`，不能省略
3. **交接弹窗是自动弹出的**：不需要手动点击任何按钮触发
4. **每个角色都会读取自己的 .md 文件**：这是验证路径修复的核心
5. **QA Engineer 的内容必须是软件测试**：如果还在做 ML 模型审计，说明修复失败

---

## 相关文件

- `src-tauri/src/archetypes/mod.rs` - 路径和映射表
- `src-tauri/src/archetypes/sync.rs` - .md 文件同步逻辑
- `src-tauri/src/lib.rs` - 启动时调用同步
- `src-tauri/resources/role-definitions/*.md` - 源文件
- `~/.microcompany/archetypes/role-definitions/*.md` - 运行时文件
