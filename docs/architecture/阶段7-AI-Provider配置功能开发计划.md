# 阶段 7：AI Provider 配置功能 - 开发计划

**版本**: 1.0  
**创建时间**: 2026-04-15  
**预计开发时间**: 3-4 天

---

## 背景

MicroCompany 目前硬编码使用 Anthropic Claude 作为唯一的 AI provider。通过深入研究 claurst 子模块,发现它已经内置了强大的多 provider 支持能力,包括:

- **支持的 Providers**: Anthropic, OpenAI, Google, Azure, Cohere, Groq, DeepSeek, xAI, OpenRouter, Ollama, LM Studio, Llama.cpp, Minimax, GitHub Copilot, Codex 等 30+ providers
- **统一的抽象层**: 通过 `LlmProvider` trait 提供统一接口
- **灵活的配置**: 支持 API key, base URL, 模型选择等配置
- **Provider 注册机制**: `ProviderRegistry` 管理所有 provider 实例

当前 MicroCompany 的限制:
- 只能使用 Anthropic Claude
- API key 和配置硬编码在代码中
- 用户无法切换 provider 或配置不同的模型
- 缺少设置界面

---

## 目标

### 核心目标
1. **设置界面** - 添加设置按钮和设置对话框
2. **Provider 配置** - 支持配置多个 AI providers
3. **Provider 切换** - 支持在不同 provider 之间切换
4. **配置持久化** - 将配置保存到本地存储
5. **Rust 后端集成** - 更新 Rust 代码以支持多 provider

### 次要目标
6. **模型选择** - 为每个 provider 提供模型列表选择
7. **配置验证** - 验证 API key 和连接
8. **默认配置** - 提供常用 provider 的默认配置

---

## Claurst Provider 架构分析

### 1. Provider 配置结构

```rust
// claurst/src-rust/crates/core/src/lib.rs
pub struct ProviderConfig {
    /// API key (overrides environment variable)
    pub api_key: Option<String>,
    /// Override the default base URL for this provider
    pub api_base: Option<String>,
    /// Whether this provider is enabled (default: true)
    pub enabled: bool,
    /// Model ID whitelist (empty = allow all)
    pub models_whitelist: Vec<String>,
    /// Model ID blacklist
    pub models_blacklist: Vec<String>,
    /// Provider-specific options
    pub options: HashMap<String, serde_json::Value>,
}

pub struct Config {
    /// Active provider ID (default: "anthropic")
    pub provider: Option<String>,
    /// Per-provider configurations
    pub provider_configs: HashMap<String, ProviderConfig>,
    // ... 其他配置
}
```

### 2. 支持的 Providers

claurst 支持以下 providers (来自 `provider_id.rs`):

**主流商业 Providers**:
- `anthropic` - Anthropic Claude
- `openai` - OpenAI GPT
- `google` - Google Gemini
- `azure` - Azure OpenAI
- `cohere` - Cohere
- `mistral` - Mistral AI

**开源/本地 Providers**:
- `ollama` - Ollama (本地运行)
- `lm-studio` - LM Studio
- `llama-cpp` - Llama.cpp

**其他云 Providers**:
- `groq` - Groq
- `deepseek` - DeepSeek
- `xai` - xAI (Grok)
- `openrouter` - OpenRouter (聚合多个 providers)
- `together-ai` - Together AI
- `perplexity` - Perplexity
- `fireworks` - Fireworks AI

**中国 Providers**:
- `moonshot` - 月之暗面 (Kimi)
- `zhipuai` - 智谱 AI (GLM)
- `deepseek` - DeepSeek
- `minimax` - MiniMax
- `stepfun` - 阶跃星辰

### 3. Provider 初始化

```rust
// claurst/src-rust/crates/api/src/registry.rs
pub fn provider_from_config(
    config: &claurst_core::config::Config,
    provider_id: &str,
) -> Option<Arc<dyn LlmProvider>> {
    let api_key = config.resolve_provider_api_key(provider_id);
    let api_base = resolve_provider_api_base(config, provider_id);
    
    match provider_id {
        "anthropic" => { /* ... */ },
        "openai" => { /* ... */ },
        "ollama" => { /* ... */ },
        // ... 其他 providers
    }
}
```

---

## 技术方案

### 方案选择

**推荐方案**: 使用 Tauri Store + Rust ProviderRegistry

**架构**:
```
Frontend (React)
    ↓ (Tauri Commands)
Rust Backend (Tauri)
    ↓ (使用 ProviderRegistry)
Claurst Provider System
```

**优点**:
- 充分利用 claurst 的现有能力
- 配置持久化到本地文件
- 类型安全的配置管理
- 支持所有 claurst 支持的 providers

---

## 实施计划

### 任务 1: 前端设置界面 (2 小时)

**目标**: 创建设置按钮和设置对话框 UI

**步骤**:

1. **创建 Settings 组件** (`src/components/Settings.tsx`)
   ```typescript
   interface ProviderConfig {
     id: string;
     name: string;
     apiKey: string;
     baseUrl?: string;
     model: string;
     enabled: boolean;
   }

   interface SettingsData {
     activeProvider: string;
     providers: ProviderConfig[];
   }
   ```

2. **创建设置对话框 UI**
   - Provider 选择下拉框
   - API Key 输入框 (密码类型)
   - Base URL 输入框 (可选)
   - Model 输入框
   - 启用/禁用开关
   - 保存/取消按钮

3. **添加设置按钮到主界面**
   - 在 Header 或 Sidebar 添加设置图标按钮
   - 点击打开设置对话框

**验收标准**:
- [ ] 设置对话框 UI 完成
- [ ] 可以打开/关闭设置对话框
- [ ] UI 样式与应用整体风格一致

---

### 任务 2: Tauri 配置存储 (1.5 小时)

**目标**: 实现配置的持久化存储

**步骤**:

1. **添加 Tauri Store 依赖** (`src-tauri/Cargo.toml`)
   ```toml
   [dependencies]
   serde_json = "1.0"
   ```

2. **创建配置管理模块** (`src-tauri/src/config/mod.rs`)
   ```rust
   use serde::{Deserialize, Serialize};
   use std::path::PathBuf;

   #[derive(Debug, Clone, Serialize, Deserialize)]
   pub struct ProviderConfig {
       pub id: String,
       pub name: String,
       pub api_key: String,
       pub base_url: Option<String>,
       pub model: String,
       pub enabled: bool,
   }

   #[derive(Debug, Clone, Serialize, Deserialize)]
   pub struct AppConfig {
       pub active_provider: String,
       pub providers: Vec<ProviderConfig>,
   }

   impl AppConfig {
       pub fn load() -> anyhow::Result<Self> { /* ... */ }
       pub fn save(&self) -> anyhow::Result<()> { /* ... */ }
   }
   ```

3. **实现配置文件读写**
   - 配置文件路径: `~/.microcompany/config.json`
   - 使用 `serde_json` 序列化/反序列化
   - 提供默认配置

**验收标准**:
- [ ] 配置可以保存到文件
- [ ] 配置可以从文件加载
- [ ] 提供合理的默认配置

---

### 任务 3: Tauri Commands (1.5 小时)

**目标**: 创建前后端通信的 Tauri commands

**步骤**:

1. **创建配置相关 commands** (`src-tauri/src/commands/config.rs`)
   ```rust
   #[tauri::command]
   pub async fn get_config() -> Result<AppConfig, String> {
       AppConfig::load().map_err(|e| e.to_string())
   }

   #[tauri::command]
   pub async fn save_config(config: AppConfig) -> Result<(), String> {
       config.save().map_err(|e| e.to_string())
   }

   #[tauri::command]
   pub async fn get_available_providers() -> Result<Vec<ProviderInfo>, String> {
       // 返回所有支持的 providers 列表
   }

   #[tauri::command]
   pub async fn validate_provider_config(
       provider_id: String,
       api_key: String,
       base_url: Option<String>,
   ) -> Result<bool, String> {
       // 验证 provider 配置是否有效
   }
   ```

2. **注册 commands** (`src-tauri/src/main.rs`)
   ```rust
   fn main() {
       tauri::Builder::default()
           .invoke_handler(tauri::generate_handler![
               // ... 现有 commands
               get_config,
               save_config,
               get_available_providers,
               validate_provider_config,
           ])
           .run(tauri::generate_context!())
           .expect("error while running tauri application");
   }
   ```

**验收标准**:
- [ ] 前端可以获取配置
- [ ] 前端可以保存配置
- [ ] 前端可以获取可用 providers 列表
- [ ] 前端可以验证配置

---

### 任务 4: 集成 Claurst ProviderRegistry (2 小时)

**目标**: 更新 ClaurstSession 以支持多 provider

**步骤**:

1. **更新 ClaurstSession 结构** (`src-tauri/src/claurst/mod.rs`)
   ```rust
   use claurst_api::{ProviderRegistry, LlmProvider};
   use std::sync::Arc;

   pub struct ClaurstSession {
       session_id: String,
       working_dir: PathBuf,
       provider: Arc<dyn LlmProvider>,  // 改为通用 provider
       config: QueryConfig,
       messages: Vec<Message>,
       tools: Vec<Box<dyn Tool>>,
       context: ToolContext,
       cost_tracker: Arc<CostTracker>,
       storage: ConversationStorage,
   }
   ```

2. **更新初始化逻辑**
   ```rust
   impl ClaurstSession {
       pub fn new(
           session_id: String,
           working_dir: PathBuf,
           provider_config: ProviderConfig,
       ) -> anyhow::Result<Self> {
           // 1. 创建 claurst Config
           let mut config = Config::default();
           config.provider = Some(provider_config.id.clone());
           
           // 2. 设置 provider 配置
           let mut provider_cfg = claurst_core::ProviderConfig::default();
           provider_cfg.api_key = Some(provider_config.api_key);
           provider_cfg.api_base = provider_config.base_url;
           provider_cfg.enabled = provider_config.enabled;
           config.provider_configs.insert(
               provider_config.id.clone(),
               provider_cfg
           );
           
           // 3. 从 registry 获取 provider
           let provider = claurst_api::registry::provider_from_config(
               &config,
               &provider_config.id
           ).ok_or_else(|| anyhow::anyhow!("Failed to create provider"))?;
           
           // 4. 创建 QueryConfig
           let mut query_config = QueryConfig::from_config(&config);
           query_config.model = provider_config.model;
           
           // ... 其余初始化逻辑
       }
   }
   ```

3. **更新 send_message 方法**
   - 使用通用的 `provider.create_message_stream()` 而不是 `client.create_message_stream()`
   - 处理不同 provider 的流式事件

**验收标准**:
- [ ] ClaurstSession 支持任意 provider
- [ ] 可以使用配置的 provider 发送消息
- [ ] 流式响应正常工作

---

### 任务 5: 前端集成 (1.5 小时)

**目标**: 连接前端设置界面和后端

**步骤**:

1. **创建配置 Hook** (`src/hooks/useSettings.ts`)
   ```typescript
   export function useSettings() {
     const [config, setConfig] = useState<SettingsData | null>(null);
     const [loading, setLoading] = useState(false);

     const loadConfig = async () => {
       const data = await invoke<SettingsData>('get_config');
       setConfig(data);
     };

     const saveConfig = async (newConfig: SettingsData) => {
       await invoke('save_config', { config: newConfig });
       setConfig(newConfig);
     };

     return { config, loading, loadConfig, saveConfig };
   }
   ```

2. **更新 Settings 组件**
   - 使用 `useSettings` hook
   - 加载配置时显示 loading 状态
   - 保存配置时显示成功/失败提示

3. **更新会话创建逻辑**
   - 从配置中读取 active provider
   - 使用配置的 provider 创建会话

**验收标准**:
- [ ] 设置界面可以加载配置
- [ ] 设置界面可以保存配置
- [ ] 新会话使用配置的 provider

---

### 任务 6: Provider 列表和验证 (1.5 小时)

**目标**: 提供 provider 列表和配置验证

**步骤**:

1. **实现 get_available_providers**
   ```rust
   #[derive(Serialize)]
   pub struct ProviderInfo {
       pub id: String,
       pub name: String,
       pub description: String,
       pub requires_api_key: bool,
       pub default_base_url: Option<String>,
       pub default_models: Vec<String>,
   }

   pub fn get_available_providers() -> Vec<ProviderInfo> {
       vec![
           ProviderInfo {
               id: "anthropic".to_string(),
               name: "Anthropic Claude".to_string(),
               description: "Claude by Anthropic".to_string(),
               requires_api_key: true,
               default_base_url: Some("https://api.anthropic.com".to_string()),
               default_models: vec![
                   "claude-opus-4-6".to_string(),
                   "claude-sonnet-4-6".to_string(),
               ],
           },
           ProviderInfo {
               id: "openai".to_string(),
               name: "OpenAI".to_string(),
               description: "GPT models by OpenAI".to_string(),
               requires_api_key: true,
               default_base_url: Some("https://api.openai.com".to_string()),
               default_models: vec![
                   "gpt-4o".to_string(),
                   "gpt-4-turbo".to_string(),
               ],
           },
           // ... 其他 providers
       ]
   }
   ```

2. **实现配置验证**
   ```rust
   pub async fn validate_provider_config(
       provider_id: String,
       api_key: String,
       base_url: Option<String>,
   ) -> Result<bool, String> {
       // 创建临时 provider 并调用 health_check
       let mut config = Config::default();
       let mut provider_cfg = claurst_core::ProviderConfig::default();
       provider_cfg.api_key = Some(api_key);
       provider_cfg.api_base = base_url;
       config.provider_configs.insert(provider_id.clone(), provider_cfg);
       
       let provider = claurst_api::registry::provider_from_config(&config, &provider_id)
           .ok_or_else(|| "Failed to create provider".to_string())?;
       
       match provider.health_check().await {
           Ok(_) => Ok(true),
           Err(e) => Err(e.to_string()),
       }
   }
   ```

3. **前端集成**
   - Provider 选择下拉框显示可用 providers
   - 选择 provider 后自动填充默认配置
   - 添加"测试连接"按钮验证配置

**验收标准**:
- [ ] 可以获取可用 providers 列表
- [ ] 选择 provider 后自动填充默认值
- [ ] 可以验证 provider 配置

---

### 任务 7: 样式和用户体验优化 (1 小时)

**目标**: 优化设置界面的样式和交互

**步骤**:

1. **创建设置样式** (`src/components/Settings.css`)
   - 对话框样式
   - 表单布局
   - 输入框样式
   - 按钮样式
   - 响应式布局

2. **添加交互反馈**
   - 保存成功提示
   - 保存失败错误提示
   - 验证中 loading 状态
   - 表单验证错误提示

3. **添加帮助文本**
   - 每个 provider 的说明
   - API key 获取链接
   - 配置示例

**验收标准**:
- [ ] 设置界面样式美观
- [ ] 交互反馈清晰
- [ ] 提供足够的帮助信息

---

## 数据结构设计

### 前端配置结构

```typescript
interface ProviderConfig {
  id: string;           // provider ID (e.g., "anthropic", "openai")
  name: string;         // 显示名称
  apiKey: string;       // API key
  baseUrl?: string;     // 可选的 base URL
  model: string;        // 模型名称
  enabled: boolean;     // 是否启用
}

interface SettingsData {
  activeProvider: string;      // 当前激活的 provider ID
  providers: ProviderConfig[]; // 所有配置的 providers
}
```

### 后端配置文件

```json
{
  "activeProvider": "anthropic",
  "providers": [
    {
      "id": "anthropic",
      "name": "Anthropic Claude",
      "apiKey": "sk-ant-...",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-opus-4-6",
      "enabled": true
    },
    {
      "id": "openai",
      "name": "OpenAI",
      "apiKey": "sk-...",
      "model": "gpt-4o",
      "enabled": false
    }
  ]
}
```

---

## 测试计划

### 功能测试

1. **配置管理**
   - 创建新 provider 配置
   - 编辑现有配置
   - 删除配置
   - 切换 active provider

2. **配置持久化**
   - 保存配置后重启应用
   - 验证配置正确加载

3. **Provider 功能**
   - 使用 Anthropic 发送消息
   - 使用 OpenAI 发送消息
   - 使用本地 Ollama 发送消息
   - 验证流式响应

4. **配置验证**
   - 测试有效的 API key
   - 测试无效的 API key
   - 测试网络错误

### 边界测试

1. **错误处理**
   - 无效的配置文件
   - 缺少 API key
   - 网络连接失败
   - Provider 不可用

2. **兼容性**
   - 不同 provider 的响应格式
   - 不同模型的能力差异

---

## 风险与挑战

### 风险 1: Provider API 差异

**问题**: 不同 provider 的 API 可能有细微差异

**缓解措施**:
- claurst 已经提供了统一的抽象层
- 充分测试主流 providers
- 提供清晰的错误信息

### 风险 2: API Key 安全

**问题**: API key 存储在本地文件中可能有安全风险

**缓解措施**:
- 配置文件权限设置为仅用户可读
- 考虑使用系统 keychain (未来优化)
- 提醒用户不要分享配置文件

### 风险 3: 配置迁移

**问题**: 现有用户的配置需要迁移

**缓解措施**:
- 提供默认配置
- 首次启动时引导用户配置
- 保持向后兼容

---

## 成功标准

完成后,MicroCompany 应该:
- ✅ 提供设置界面配置 AI providers
- ✅ 支持多个主流 providers (Anthropic, OpenAI, Ollama 等)
- ✅ 配置持久化到本地文件
- ✅ 可以在不同 provider 之间切换
- ✅ 提供配置验证功能
- ✅ 保持良好的用户体验

---

## 下一步

完成 Provider 配置后,可以考虑:
- **阶段 8: 高级功能**
  - 快捷键支持
  - 主题切换
  - 对话历史搜索
  - 导出对话记录
  - 多语言支持

开始实施**任务 1: 前端设置界面**。
