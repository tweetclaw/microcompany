# 系统提示词架构重构方案（文件资源方案）

**文档版本**：3.0（对话消息方案）  
**更新日期**：2026-05-05  
**状态**：部分完成，新方案待实施

## 重要更新（2026-05-05）

### 测试发现

通过集成测试发现：
- ✅ **系统提示词重构成功**：从 5000+ tokens 降至 724 字符（85% 优化）
- ❌ **system 参数方案失败**：AI 不输出交接标签
- ✅ **对话消息方案成功**：将系统提示词作为第一条 user 消息，AI 正确输出交接标签

### 新实施方案

**核心改变：**
- 系统提示词不再作为 API 的 `system` 参数
- 改为在 Session 创建时作为第一条 `user` 消息发送
- Task 生命周期增加"准备中"状态

**详见：** 第 13 节「系统提示词作为对话消息的实施方案」

---

## 1. 当前问题分析

### 1.1 架构问题
- **混合层次**：角色定义（通用）和团队配置（任务特定）混在一起
- **不够专业**：缺乏像 agency-agents 那样的专业角色定义
- **不够灵活**：无法复用角色定义，每次都重新生成
- **维护困难**：修改角色定义需要改代码
- **系统提示词过大**：完整的角色定义塞进系统提示词，消耗大量 tokens

### 1.2 具体问题
1. 角色定义缺乏个性和方法论
2. 团队配置信息硬编码在提示词生成逻辑中
3. 无法独立更新角色定义
4. 系统提示词过于冗长（5000+ tokens）
5. 用户无法看到或自定义角色定义

## 2. 新架构设计

### 2.1 核心思路

**关键洞察：**
- 角色定义是**通用的、专业的、可复用的**内容
- 不应该每次都塞进系统提示词
- 应该让 AI **按需读取**角色定义文件（这是 Claude 的核心能力）

**新架构：**
```
┌─────────────────────────────────────┐
│   最终系统提示词 (Final Prompt)      │
│   - 读取角色定义文件的指令           │
│   - 当前团队配置（动态）             │
│   - 交接规则（应用层协议）           │
│   大小：~500 tokens                 │
│   注：任务内容由用户随时输入         │
└─────────────────────────────────────┘
                 ↓
         AI 主动读取
                 ↓
┌─────────────────────────────────────┐
│   角色定义文件 (Role Definition)     │
│   - 存储在 resources/ 目录           │
│   - 直接复用 agency-agents 内容      │
│   - 角色职责、方法论、工作流程       │
│   - 不包含应用层协议（如交接格式）   │
│   - 用户可见、可编辑                 │
│   - 随 app 打包发布                 │
└─────────────────────────────────────┘
```

**关键分离：**
- **角色定义文件**：通用的、专业的角色能力描述（来自 agency-agents）
- **系统提示词**：应用特定的规则和约束（团队配置、交接格式）
- **任务内容**：用户随时输入，不在系统提示词中硬编码

### 2.2 方案优势

| 维度 | 旧方案 | 新方案 |
|------|--------|--------|
| 系统提示词大小 | 5000+ tokens | ~500 tokens |
| 角色定义存储 | 代码中硬编码 | md 文件资源 |
| 维护方式 | 修改代码 | 编辑文件 |
| 用户可见性 | 不可见 | 完全可见 |
| 自定义能力 | 无 | 用户可编辑 |
| 专业性 | 需要手写 | 直接复用 agency-agents |
| Token 消耗 | 每次都发送 | 按需读取 |

## 3. 资源目录结构

### 3.1 目录组织

```
resources/
└── role-definitions/
    ├── product-manager.md          # 产品经理
    ├── backend-developer.md        # 后端开发
    ├── frontend-developer.md       # 前端开发
    ├── designer.md                 # 设计师
    ├── qa-engineer.md              # 测试工程师
    └── devops-engineer.md          # 运维工程师
```

### 3.2 角色定义文件格式

每个 md 文件直接从 agency-agents 提取或参考其结构编写：

```markdown
---
name: Product Manager
description: 负责需求澄清、范围判断和产品决策
color: "#5C7CFA"
emoji: 📋
vibe: 澄清需求，定义边界，推动决策
---

# Product Manager Agent

你是 **Product Manager**，在多角色协作任务中负责需求澄清、范围判断和产品决策。

## 你的身份

- **角色**: 产品经理和需求架构师
- **个性**: 好奇、系统化、决策导向
- **记忆**: 你记住哪些需求澄清方法有效，哪些决策框架产生了好结果
- **经验**: 你见过无数需求不清导致的返工，也见过清晰边界带来的高效交付

## 核心使命

[详细的工作方法和框架]

## 职责范围

- 澄清任务目标、用户价值与验收边界
- 识别范围取舍、优先级与关键风险
- 为后续设计或研发提供清晰输入

## 职责边界

- 不直接替代工程角色制定实现细节
- 不替代评审角色做最终质量裁定

## 工作方法

[具体的方法论和框架]

## 交付物

- 需求澄清结论
- 范围与优先级说明
- 关键验收标准
```

## 4. 系统提示词模板

### 4.1 新的系统提示词结构

系统提示词变得非常简洁，只包含：
1. 读取角色定义文件的指令
2. 当前团队配置（动态生成）
3. 交接规则（应用层协议）
4. 工作目录

**注意：任务内容由用户随时输入，不在系统提示词中。**

**系统提示词模板：**

```
# 角色：{role_name}

## 🔴 首要任务：读取角色定义

务必使用 Read 工具读取 **`{role_definition_path}`** 文件，理解自己的角色约束

***务必先读取再回答问题***  
***务必全程记住自己的角色定位***

## 当前团队配置

**团队成员：**
{team_roster}

（示例格式：
a. Alice - Product Manager
b. Bob - Backend Developer
c. Charlie - Backend Developer
d. Diana - Frontend Developer
）

**交接规则：**
当你认为需要交接给其他团队成员时，在回答末尾添加：
<handoff>成员编号</handoff>

如果不需要交接，添加：
<handoff></handoff>

**示例：**
- 交接给 Bob (编号b): <handoff>b</handoff>
- 交接给 Diana (编号d): <handoff>d</handoff>
- 不需要交接: <handoff></handoff>

**重要：**
- 使用成员编号（字母），不是角色名称
- 在正文中说明交接原因和目标成员的角色

## 工作目录
{working_directory}
```

**说明：**
- **交接规则**是应用层协议，不在角色定义文件中
- **任务内容**由用户在对话中输入，不在系统提示词中
- 角色定义文件（agency-agents）只关注角色能力，不包含应用特定规则

### 4.2 AI 工作流

1. **Session 启动**：AI 收到系统提示词
2. **读取角色定义**：AI 看到"立即阅读"指令，使用 Read 工具读取 md 文件
3. **理解角色**：AI 理解自己的完整职责和工作方法
4. **确认就绪**：AI 在第一条回复中确认已理解角色
5. **接收任务**：用户分配具体任务
6. **开始工作**：AI 按照角色定义开始工作

## 5. 技术实现方案

### 5.1 Tauri 资源打包

**文件：** `src-tauri/tauri.conf.json`

在 `bundle.resources` 中添加角色定义文件：

```json
{
  "bundle": {
    "resources": [
      "resources/role-definitions/*"
    ]
  }
}
```

这样在打包时，所有 `resources/role-definitions/` 下的 md 文件都会被包含在应用中。

### 5.2 资源路径解析

**文件：** `src-tauri/src/archetypes/prompt_builder.rs`

添加获取角色定义文件路径的函数：

```rust
use tauri::api::path::resource_dir;
use std::path::PathBuf;

/// 获取角色定义文件的绝对路径
pub fn get_role_definition_path(
    package_info: &tauri::PackageInfo,
    env: &tauri::Env,
    role_id: &str,
) -> Result<PathBuf, String> {
    let resource_dir = resource_dir(package_info, env)
        .ok_or("Failed to get resource directory")?;
    
    let role_file = resource_dir
        .join("role-definitions")
        .join(format!("{}.md", role_id));
    
    if !role_file.exists() {
        return Err(format!("Role definition file not found: {:?}", role_file));
    }
    
    Ok(role_file)
}
```

### 5.3 系统提示词构建器重构

**文件：** `src-tauri/src/archetypes/prompt_builder.rs`

**当前函数签名：**
```rust
pub fn build_role_system_prompt(
    archetype: Option<&RoleArchetype>,
    role_name: &str,
    role_identity: &str,
    task_name: &str,
    task_description: &str,
    system_prompt_append: Option<&str>,
    handoff_enabled: bool,
    role_context: Option<&RolePromptContext>,
    working_directory: Option<&str>,
) -> String
```

**重构为：**

```rust
/// 构建简化的系统提示词（包含读取文件指令）
pub fn build_role_system_prompt(
    role_name: &str,
    role_identity: &str,
    role_definition_path: &str,  // 新增：角色定义文件路径
    role_context: Option<&RolePromptContext>,
    working_directory: Option<&str>,
) -> String {
    let mut prompt = String::new();
    
    // 1. 角色标题
    prompt.push_str(&format!("# 角色：{}\n\n", role_name));
    
    // 2. 读取角色定义文件的指令
    prompt.push_str("## 🔴 首要任务：读取角色定义\n\n");
    prompt.push_str("务必使用 Read 工具读取 **`{}`** 文件，理解自己的角色约束\n\n", role_definition_path);
    prompt.push_str("***务必先读取再回答问题***\n");
    prompt.push_str("***务必全程记住自己的角色定位***\n\n");
    
    // 3. 团队配置（如果有）
    if let Some(ctx) = role_context {
        prompt.push_str(&build_team_composition(role_name, role_identity, ctx));
    }
    
    // 4. 工作目录
    if let Some(dir) = working_directory {
        prompt.push_str(&format!("\n## 工作目录\n{}\n", dir));
    }
    
    prompt
}

/// 生成团队配置信息
fn build_team_composition(
    role_name: &str,
    role_identity: &str,
    ctx: &RolePromptContext,
) -> String {
    let mut section = String::from("## 当前团队配置\n\n");
    
    // 团队成员列表（带编号）
    section.push_str("**团队成员：**\n");
    for (index, role) in ctx.all_roles.iter().enumerate() {
        let letter = (b'a' + index as u8) as char;
        if role.name == role_name {
            section.push_str(&format!("{}. {} - {} (你)\n", letter, role.member_name, role.name));
        } else {
            section.push_str(&format!("{}. {} - {}\n", letter, role.member_name, role.name));
        }
    }
    section.push_str("\n");
    
    // 交接规则
    section.push_str("**交接规则：**\n");
    section.push_str("当你认为需要交接给其他团队成员时，在回答末尾添加：\n");
    section.push_str("<handoff>成员编号</handoff>\n\n");
    section.push_str("如果不需要交接，添加：\n");
    section.push_str("<handoff></handoff>\n\n");
    section.push_str("**重要：**\n");
    section.push_str("- 使用成员编号（字母），不是角色名称\n");
    section.push_str("- 在正文中说明交接原因和目标成员的角色\n\n");
    
    section
}
```

### 5.4 调用点更新

**文件：** `src-tauri/src/claurst/mod.rs`

在调用 `build_role_system_prompt` 之前，先获取角色定义文件路径：

```rust
// 获取角色定义文件路径
let role_definition_path = match get_role_definition_path(
    &app_handle.package_info(),
    &app_handle.env(),
    &archetype.id,
) {
    Ok(path) => path.to_string_lossy().to_string(),
    Err(e) => {
        log::warn!("Failed to get role definition path: {}, using fallback", e);
        format!("resources/role-definitions/.md", archetype.id)
    }
};

// 构建系统提示词
let prompt = build_role_system_prompt(
    &role.name,
    &role.identity,
    &role_definition_path,  // 传入文件路径
    Some(&role_context),
    Some(&working_dir),
);
```

## 6. 实施步骤

### 阶段一：资源准备（1-2小时）

1. **创建资源目录**
   ```bash
   mkdir -p resources/role-definitions
   ```

2. **从 agency-agents 提取角色定义**
   - 复制或改写 product-manager.md
   - 复制或改写 backend-developer.md
   - 复制或改写 frontend-developer.md
   - 复制或改写 designer.md
   - 复制或改写 qa-engineer.md

3. **配置 Tauri 打包**
   - 修改 `tauri.conf.json`
   - 添加 `resources/role-definitions/*` 到 bundle.resources

4. **验证资源打包**
   ```bash
   cargo tauri build
   # 检查打包后的应用是否包含 role-definitions 文件
   ```

### 阶段二：代码重构（2-3小时）

1. **添加路径解析函数**
   - 在 `prompt_builder.rs` 中添加 `get_role_definition_path()`
   - 处理开发环境和生产环境的路径差异

2. **重构系统提示词构建器**
   - 简化 `build_role_system_prompt()` 函数
   - 移除角色定义内容生成逻辑
   - 添加"读取文件"指令生成逻辑
   - 保留团队配置生成逻辑（`build_team_composition()`）

3. **更新调用点**
   - 修改 `claurst/mod.rs` 中的调用代码
   - 传入角色定义文件路径
   - 添加错误处理和回退逻辑

4. **编写单元测试**
   
   **单元测试（快速、稳定、默认运行）：**
   - 测试 `get_role_definition_path()` 函数
     - 测试正常路径解析
     - 测试文件不存在的情况
     - 测试不同平台的路径格式
   
   - 测试 `build_role_system_prompt()` 函数
     - 测试生成的系统提示词包含读取指令
     - 测试文件路径正确嵌入
     - 测试团队配置正确生成
     - 测试交接规则格式正确
   
   - 测试 `build_team_composition()` 函数
     - 测试团队成员列表格式（字母编号）
     - 测试多个同角色成员的编号
     - 测试当前成员标记（"你"）
     - 测试交接规则说明
   
   **集成测试（可选、自动读取配置、手动运行）：**
   - 使用 `#[ignore]` 标记，默认不运行
   - 自动读取 `~/.microcompany/config.json` 获取 API key
   - 使用应用的 active_provider 配置
   - 如果配置文件不存在或无 API key，自动跳过
   - 创建真实的 AI session
   - 发送生成的系统提示词
   - 验证 AI 的第一条回复包含 Read 工具调用
   - 验证 AI 确认理解了角色
   - 手动运行：`cargo test -- --ignored`
   
   **示例代码：**
   ```rust
   #[cfg(test)]
   mod tests {
       #[test]
       fn test_system_prompt_format() {
           let prompt = build_role_system_prompt(...);
           assert!(prompt.contains("🔴 首要任务：读取角色定义"));
           assert!(prompt.contains("务必先读取再回答问题"));
       }
       
       #[test]
       #[ignore]  // 手动运行：cargo test -- --ignored
       async fn test_ai_reads_role_definition() {
           // 读取应用配置
           let config = match AppConfig::load() {
               Ok(cfg) => cfg,
               Err(_) => {
                   println!("跳过：无法加载配置");
                   return;
               }
           };
           
           // 获取 API key
           let provider = config.providers
               .iter()
               .find(|p| p.id == config.active_provider)
               .expect("未找到 active provider");
           
           if provider.api_key.is_empty() {
               println!("跳过：未配置 API key");
               return;
           }
           
           // 创建测试 session，验证 AI 行为
           // ...
       }
   }
   ```

5. **编译测试**
   ```bash
   cargo build
   cargo test
   # 修复编译错误和测试失败
   ```

### 阶段三：功能测试（1-2小时）

1. **创建测试任务**
   - 创建包含 Product Manager 角色的任务
   - 启动 AI session

2. **验证 AI 读取文件**
   - 检查 dev.log，确认系统提示词包含"读取文件"指令
   - 检查 AI 的第一条回复，确认它读取了角色定义文件
   - 检查 AI 是否确认理解了角色

3. **验证角色行为**
   - 给 AI 分配任务
   - 观察 AI 是否按照角色定义工作
   - 验证交接功能是否正常

4. **验证系统提示词大小**
   - 检查 dev.log 中的系统提示词
   - 确认大小从 5000+ tokens 降低到 ~500 tokens

### 阶段四：多角色测试（1小时）

1. **测试不同角色**
   - 创建包含多个角色的任务
   - 测试 Backend Developer
   - 测试 Frontend Developer
   - 测试 Designer

2. **测试角色交接**
   - 触发 PM → Backend Developer 交接
   - 验证智能路由推荐正确
   - 验证新角色正确读取自己的角色定义

3. **测试错误处理**
   - 测试角色定义文件不存在的情况
   - 验证错误提示友好
   - 验证回退机制正常

## 7. 验证计划

### 7.1 系统提示词验证

**验证点：**
- [ ] 系统提示词包含"立即阅读角色定义"指令
- [ ] 文件路径正确且可访问
- [ ] 团队配置信息动态生成正确
- [ ] 交接规则说明清晰
- [ ] 总大小 < 1000 tokens

**验证方法：**
```bash
# 查看 dev.log 中的系统提示词
grep -A 50 "FULL_SYSTEM_PROMPT_START" dev.log
```

### 7.2 AI 行为验证

**验证点：**
- [ ] AI 在第一条消息中使用 Read 工具读取角色定义
- [ ] AI 确认理解了自己的角色
- [ ] AI 按照角色定义的方法论工作
- [ ] AI 正确使用 HANDOFF 格式交接

**验证方法：**
- 观察 AI 的第一条回复
- 检查 dev.log 中的 Read 工具调用
- 测试实际任务执行

### 7.3 资源打包验证

**验证点：**
- [ ] 开发环境可以找到角色定义文件
- [ ] 打包后的应用包含角色定义文件
- [ ] 不同平台（macOS/Windows/Linux）路径正确

**验证方法：**
```bash
# 开发环境
ls -la resources/role-definitions/

# 打包后（macOS）
# 检查 .app/Contents/Resources/role-definitions/

# 打包后（Windows）
# 检查应用目录下的 resources/role-definitions/
```

## 8. 成功标准

只有当以下所有条件都满足时，才认为功能完成：

### 8.1 资源文件就绪
- [ ] `resources/role-definitions/` 目录存在
- [ ] 至少包含 5 个角色定义文件（PM, Backend, Frontend, Designer, QA）
- [ ] 每个文件格式正确，包含完整的角色定义
- [ ] 文件内容专业，参考 agency-agents 结构

### 8.2 代码重构完成
- [ ] `get_role_definition_path()` 函数实现正确
- [ ] `build_role_system_prompt()` 简化完成
- [ ] `build_team_composition()` 独立实现
- [ ] 调用点更新完成
- [ ] 编译无错误

### 8.3 资源打包正确
- [ ] `tauri.conf.json` 配置正确
- [ ] 开发环境可以找到文件
- [ ] 打包后应用包含文件
- [ ] 路径解析在不同平台正常工作

### 8.4 功能测试通过
- [ ] AI 正确读取角色定义文件
- [ ] AI 确认理解角色
- [ ] AI 按照角色定义工作
- [ ] 交接功能正常
- [ ] 多角色协作正常

### 8.5 性能改善明显
- [ ] 系统提示词大小从 5000+ tokens 降低到 < 1000 tokens
- [ ] Session 启动时间可接受（多一次 Read 操作）
- [ ] 无明显性能退化

## 9. 预期效果

### 9.1 Token 消耗大幅降低
- **系统提示词**：从 5000+ tokens → ~500 tokens
- **每次对话节省**：~4500 tokens
- **长对话收益**：对话越长，节省越多

### 9.2 维护性大幅提升
- **修改角色定义**：编辑 md 文件即可，无需改代码
- **添加新角色**：添加新 md 文件，无需数据库迁移
- **版本控制**：md 文件可以用 git 管理

### 9.3 用户体验改善
- **透明度**：用户可以看到每个角色的完整定义
- **可定制**：用户可以编辑或添加自定义角色
- **专业性**：直接使用 agency-agents 的专业内容

### 9.4 开发体验改善
- **调试更容易**：角色定义独立于代码
- **测试更简单**：可以快速修改角色定义测试不同行为
- **协作更顺畅**：非技术人员也可以编辑角色定义

## 10. 风险和注意事项

### 10.1 启动延迟
**风险**：Session 启动时多一次 Read 操作，可能增加延迟

**缓解措施**：
- Read 操作通常很快（< 100ms）
- 只在 session 开始时发生一次
- 收益（token 节省）远大于成本

### 10.2 AI 可能忘记读取
**风险**：AI 可能忽略"立即阅读"指令

**缓解措施**：
- 在系统提示词中使用醒目标记（🔴）
- 使用强调语气（"必须"、"立即"）
- 在第一条消息中再次提醒
- 如果 AI 没有读取，用户可以手动提醒

### 10.3 文件路径问题
**风险**：不同平台的资源路径可能不同

**缓解措施**：
- 使用 Tauri 的 `resource_dir()` API
- 添加错误处理和日志
- 提供回退机制
- 在多平台测试

### 10.4 角色定义质量
**风险**：手写的角色定义可能不够专业

**缓解措施**：
- 直接复用 agency-agents 的内容
- 参考其结构和风格
- 逐步迭代优化
- 收集用户反馈

### 10.5 向后兼容性
**风险**：现有任务可能受影响

**缓解措施**：
- 保留旧的系统提示词生成逻辑作为回退
- 如果角色定义文件不存在，使用旧逻辑
- 逐步迁移，不强制升级

## 11. 后续优化方向

### 11.1 UI 管理界面
- 提供角色定义编辑器（在应用内编辑 md 文件）
- 支持预览和测试角色定义
- 提供角色定义模板
- 支持导入/导出角色定义

### 11.2 自定义角色
- 允许用户创建自定义角色
- 提供角色定义向导
- 支持从现有角色复制和修改
- 支持角色定义分享

### 11.3 版本控制
- 角色定义版本管理
- 支持回滚到历史版本
- 支持对比不同版本
- 支持导出版本历史

### 11.4 智能推荐
- 根据任务类型推荐合适的角色组合
- 根据历史数据优化角色定义
- 提供角色效果分析
- 支持 A/B 测试不同的角色定义

### 11.5 多语言支持
- 提供中英文角色定义
- 根据用户语言自动选择
- 支持用户自定义翻译
- 支持社区贡献翻译

## 12. 总结

### 核心改进
1. **架构更清晰**：角色定义与团队配置分离
2. **Token 消耗更低**：系统提示词从 5000+ → 724 字符
3. **维护更简单**：编辑 md 文件即可，无需改代码
4. **用户体验更好**：透明、可定制、专业

### 关键优势
- 利用 AI 的原生能力（读取文件）
- 直接复用 agency-agents 的专业内容
- 用户可以看到和编辑角色定义
- 更小的系统提示词，更低的 token 消耗

### 实施建议
1. 先完成资源准备和打包配置
2. 再进行代码重构
3. 充分测试多角色协作
4. 逐步迁移，保持向后兼容

---

## 13. 系统提示词延迟合并方案（最终方案）

### 13.1 方案演进历史

**方案1：system 参数方案（失败）**
- 系统提示词作为 API 的 `system` 参数
- 问题：AI 在生成长回答时"遗忘"格式要求，不输出交接标签

**方案2：立即发送方案（已废弃）**
- 创建任务时立即发送系统提示词作为第一条消息
- 问题：任务创建慢，对话历史包含技术性初始化消息

**方案3：延迟合并方案（当前方案）✅**
- 创建任务时不发送系统提示词
- 用户发送第一条消息时，将系统提示词合并到用户消息中
- 优势：任务创建快，对话历史清晰，AI 正确理解角色

### 13.2 延迟合并方案设计

**核心思路：**
不在任务创建时发送系统提示词，而是在用户发送第一条消息时，将系统提示词和用户消息合并后发送给 AI。

**关键特性：**
1. ✅ **任务创建快速**：不需要等待 AI 响应，任务立即变为 ready
2. ✅ **对话历史清晰**：用户只看到自己的问题和 AI 的回答
3. ✅ **系统提示词生效**：AI 收到合并后的消息，正确理解角色定位
4. ✅ **格式要求有效**：系统提示词作为对话内容，AI 能记住格式要求

**消息流程：**
```
用户发送第一条消息："帮我设计一个登录页面"
                ↓
后端检测到是第一条消息（message_count == 1）
                ↓
读取 system_prompt_snapshot
                ↓
构造合并消息：
  {系统提示词}
  ---
  以上是你的角色定位，现在处理用户问题：
  
  帮我设计一个登录页面
                ↓
发送合并消息给 AI API
                ↓
数据库保存：
  - 用户消息：帮我设计一个登录页面（原始）
  - AI 响应：[AI 的回答]
                ↓
用户看到的对话历史：
  用户：帮我设计一个登录页面
  AI：[AI 的回答]
```

**Task 生命周期：**
```
旧流程：创建 → 准备中 → 可用 → 进行中 → 完成
              ↑
         等待 AI 初始化响应（慢）

新流程：创建 → 可用 → 进行中 → 完成
              ↑
         立即可用（快）
```

### 13.3 技术实现方案

#### 13.3.1 核心修改点

**文件1：`src-tauri/src/api/task_impl.rs`**

**删除内容：**
- 删除 `send_initialization_message` 函数（不再需要）
- 删除任务创建时的初始化消息调用

**效果：**
- 任务创建流程简化
- 任务状态直接变为 'ready'（不需要 'preparing' 状态）

**文件2：`src-tauri/src/claurst/mod.rs`**

**修改位置：** `send_message` 函数（第582行开始）

**添加逻辑：**
```rust
pub async fn send_message(&mut self, message: &str, ...) -> Result<String> {
    // 1. 添加用户消息到 self.messages
    self.messages.push(Message::user(message.to_string()));
    
    // 2. 保存用户原始消息到数据库
    save_to_database(session_id, "user", message);
    
    // 3. 检测是否是第一条用户消息
    let message_count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM messages WHERE session_id = ?1 AND role = 'user'",
        params![&self.session_id],
        |row| row.get(0),
    ).unwrap_or(0);
    
    if message_count == 1 {
        // 4. 对于任务会话的第一条消息，合并系统提示词
        if task_session {
            if let Ok(system_prompt) = conn.query_row(
                "SELECT r.system_prompt_snapshot
                 FROM sessions s
                 JOIN roles r ON r.id = s.role_id
                 WHERE s.id = ?1",
                params![&self.session_id],
                |row| row.get::<_, Option<String>>(0),
            ) {
                if let Some(prompt) = system_prompt {
                    // 构造合并消息
                    let merged_message = format!(
                        "{}\n\n---\n\n以上是你的角色定位，现在处理用户问题：\n\n{}",
                        prompt,
                        message
                    );
                    
                    // 修改 self.messages 中的最后一条消息
                    if let Some(last_msg) = self.messages.last_mut() {
                        *last_msg = Message::user(merged_message);
                    }
                }
            }
        }
    }
    
    // 5. 发送消息给 AI API（如果是第一条，发送的是合并后的消息）
    // 6. 保存 AI 响应到数据库
    // 7. 返回 AI 响应
}
```

**关键点：**
- 数据库保存的是用户原始消息（第2步）
- 发送给 AI 的是合并后的消息（第4-5步）
- 用户看到的对话历史是原始消息 + AI 响应

#### 13.3.2 数据库 Schema

**无需修改：**
- 不需要添加 'preparing' 状态
- 任务创建后直接为 'ready' 状态
- 使用现有的 `system_prompt_snapshot` 字段存储系统提示词

#### 13.3.3 衔接语句设计

**格式：**
```
{系统提示词}

---

以上是你的角色定位，现在处理用户问题：

{用户原始消息}
```

**示例：**
```
你是一名专业的 UI/UX 设计师...
[完整的系统提示词]
...
输出格式：在回答末尾添加 <handoff>角色名</handoff>

---

以上是你的角色定位，现在处理用户问题：

帮我设计一个登录页面
```

### 13.4 优势分析

**相比立即发送方案的优势：**

| 维度 | 立即发送方案 | 延迟合并方案 ✅ |
|------|------------|--------------|
| 任务创建速度 | 慢（需等待AI响应） | 快（立即完成） |
| 对话历史 | 包含技术性初始化消息 | 只有真实对话 |
| 用户体验 | 需要等待"准备中" | 立即可用 |
| 系统提示词生效 | ✅ 生效 | ✅ 生效 |
| 格式要求有效性 | ✅ 有效 | ✅ 有效 |
| 代码复杂度 | 高（需要初始化流程） | 低（只需检测首条消息） |
| API 调用次数 | 多（每个角色1次） | 少（按需调用） |

**成本分析：**
- 无额外 API 调用成本（不需要初始化消息）
- 任务创建时间：< 1秒（vs 立即发送方案的 5-15秒）
- 代码维护成本：低（逻辑简单）

### 13.5 前端 UI 影响

**无需修改：**
- 不需要显示"准备中"状态
- 任务创建后立即可用
- 对话历史保持清晰（只显示真实对话）

**用户体验：**
- ✅ 任务创建即可用
- ✅ 对话历史清晰
- ✅ 无需等待初始化

### 13.6 实施步骤

#### 步骤 1：删除初始化消息逻辑 ✅
- [x] 删除 `send_initialization_message` 函数
- [x] 删除任务创建时的初始化消息调用
- [x] 任务状态直接设为 'ready'

**文件：** `src-tauri/src/api/task_impl.rs`

#### 步骤 2：添加延迟合并逻辑 ✅
- [x] 在 `send_message` 函数中检测第一条消息
- [x] 读取 `system_prompt_snapshot`
- [x] 构造合并消息
- [x] 修改 `self.messages` 中的最后一条消息
- [x] 添加日志记录

**文件：** `src-tauri/src/claurst/mod.rs`

#### 步骤 3：测试验证
- [ ] 创建新任务，验证立即变为 ready
- [ ] 发送第一条消息，检查日志确认合并
- [ ] 验证 AI 响应正确理解角色定位
- [ ] 验证对话历史只显示原始消息
- [ ] 测试多角色任务

### 13.7 验证标准

**成功标准：**
- [x] 任务创建后立即为 'ready' 状态（无需等待）
- [x] 第一条消息时系统提示词自动合并
- [ ] AI 响应正确理解角色定位
- [ ] AI 正确输出交接标签
- [ ] 对话历史只显示用户原始消息和 AI 响应
- [ ] 任务创建时间 < 1秒

**日志验证：**
```
task_created task_id=xxx name=xxx status=ready role_count=3
task_first_message_merged session_id=xxx original_length=20 merged_length=1500
```

---

**文档版本**：4.0（延迟合并方案）  
**创建日期**：2026-05-05  
**更新日期**：2026-05-05  
**状态**：已实施，待测试验证


