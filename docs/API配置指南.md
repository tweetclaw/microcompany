# API 配置指南

## 配置 Anthropic API Key

MicroCompany 现在支持真实的 Claude AI 对话功能。要启用此功能，你需要配置 Anthropic API Key。

### 方法 1：环境变量（推荐用于开发）

在启动应用前设置环境变量：

```bash
export ANTHROPIC_API_KEY='your-api-key-here'
export ANTHROPIC_MODEL='claude-sonnet-4-6'  # 可选，默认为 claude-sonnet-4-6

# 然后启动应用
./dev.sh
```

### 方法 2：配置文件（推荐用于生产）

创建配置文件 `~/.microcompany/config.json`：

```json
{
  "anthropic_api_key": "your-api-key-here",
  "model": "claude-sonnet-4-6"
}
```

### 获取 API Key

1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 登录或注册账号
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 复制 API Key 并按照上述方法配置

### 支持的模型

- `claude-opus-4-6` - 最强大的模型
- `claude-sonnet-4-6` - 平衡性能和成本（默认）
- `claude-haiku-4-5-20251001` - 最快速的模型

### 测试配置

启动应用后：
1. 选择一个工作目录
2. 发送一条消息
3. 如果配置正确，你会收到真实的 Claude AI 回复
4. 如果配置不正确，你会看到配置指引

### 故障排除

**问题：收到 "API Key Not Configured" 消息**
- 检查环境变量是否正确设置
- 检查配置文件路径是否正确（`~/.microcompany/config.json`）
- 确保 API Key 格式正确

**问题：API 错误**
- 检查 API Key 是否有效
- 检查网络连接
- 查看 `dev.log` 文件获取详细错误信息

**问题：模型不可用**
- 确保使用的模型名称正确
- 检查你的 Anthropic 账户是否有权限访问该模型
