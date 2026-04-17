# One-API 集成需求说明

## 文档信息
- **创建日期**: 2026-04-17
- **版本**: v1.0
- **状态**: 待实现

## 需求概述

将 MicroCompany 桌面应用的 AI 调用和搜索功能统一接入 one-api 计费系统，实现：
1. 所有 AI provider 通过 one-api 代理和计费
2. WebSearch 工具调用成功后上报计费
3. 统一使用 token 作为计费单位

## 架构设计

### 当前架构
```
桌面应用 → 直接调用 AI Provider API (Claude/OpenAI/...)
         → 直接调用 Brave Search API
```

### 目标架构
```
桌面应用 → one-api 服务器 → AI Provider API (Claude/OpenAI/...)
         ↓
         监听 WebSearch 成功 → 上报计费到 one-api
         ↓
         直接调用 Brave Search API (用户自己的 key)
```

## 功能需求

### 1. AI Provider 统一代理

**需求描述**：
- 所有 AI provider 的 baseUrl 改为指向 one-api 服务器
- 用户配置的 API key 实际是 one-api 的用户 token
- one-api 负责：
  - 验证用户 token
  - 代理请求到真实的 AI provider
  - 按 token 消耗自动计费
  - 返回响应

**配置变更**：
```json
// 当前配置
{
  "providers": [
    {
      "id": "anthropic",
      "name": "Claude",
      "apiKey": "sk-ant-xxx",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-6"
    }
  ]
}

// 目标配置
{
  "oneApiUrl": "https://your-one-api-server.com",
  "providers": [
    {
      "id": "anthropic",
      "name": "Claude",
      "apiKey": "one-api-user-token-xxx",
      "baseUrl": "https://your-one-api-server.com/v1",
      "model": "claude-sonnet-4-6"
    }
  ]
}
```

### 2. WebSearch 计费上报

**需求描述**：
- WebSearchTool 继续直接调用 Brave Search API（使用用户自己的 Brave API key）
- 在应用层监听 `QueryEvent::ToolEnd` 事件
- 当 `tool_name == "WebSearch"` 且 `!is_error` 时，上报到 one-api
- one-api 扣除对应的 token（如 1 次搜索 = 100 tokens）

**实现位置**：
- 文件：`src-tauri/src/claurst/mod.rs`
- 事件：`QueryEvent::ToolEnd`
- 上报接口：`POST {oneApiUrl}/api/billing/usage`

**上报数据格式**：
```json
{
  "user_token": "one-api-user-token-xxx",
  "tool": "web_search",
  "count": 1,
  "tokens": 100
}
```

### 3. 配置管理

**新增配置项**：
- `oneApiUrl`: one-api 服务器地址
- `oneApiEnabled`: 是否启用 one-api 集成（默认 false，向后兼容）

**配置界面**：
- Settings 中新增 "One-API 配置" 区域
- 字段：
  - One-API Server URL
  - Enable One-API Integration (开关)
  - 说明文案：启用后，所有 AI 调用和搜索将通过 One-API 统一计费

## 技术实现

### 1. 前端改动

**文件**：
- `src/types/settings.ts`: 新增 `oneApiUrl` 和 `oneApiEnabled` 字段
- `src/components/Settings.tsx`: 新增 One-API 配置 UI
- `src/App.tsx`: 传递 one-api 配置到后端

### 2. 后端改动

**文件**：
- `src-tauri/src/config/mod.rs`: 
  - 新增 `one_api_url` 和 `one_api_enabled` 字段
  - 保存/加载配置

- `src-tauri/src/commands/session.rs`:
  - 在 `init_session` 中，如果启用 one-api，修改 provider 的 baseUrl

- `src-tauri/src/claurst/mod.rs`:
  - 在 `QueryEvent::ToolEnd` 中监听 WebSearch 成功
  - 调用上报接口

- `src-tauri/src/api/one_api.rs` (新建):
  - 实现上报计费的 HTTP 客户端
  - 函数：`report_usage(one_api_url, user_token, tool, count, tokens)`

### 3. One-API 服务端

**需要实现的接口**：

1. **AI 代理接口**（one-api 已有）
   - 兼容 OpenAI/Anthropic API 格式
   - 自动计费

2. **计费上报接口**（需要扩展）
   ```
   POST /api/billing/usage
   Headers:
     Authorization: Bearer {user_token}
   Body:
     {
       "tool": "web_search",
       "count": 1,
       "tokens": 100
     }
   ```

## 实现阶段

### Phase 1: 配置层（1-2 天）
- [ ] 前端：新增 one-api 配置 UI
- [ ] 后端：新增配置字段和持久化
- [ ] 测试：配置保存和加载

### Phase 2: AI Provider 代理（2-3 天）
- [ ] 后端：根据配置修改 provider baseUrl
- [ ] 测试：通过 one-api 调用 Claude/OpenAI
- [ ] 验证：计费是否正确

### Phase 3: WebSearch 计费（2-3 天）
- [ ] 后端：实现计费上报客户端
- [ ] 后端：在 ToolEnd 事件中上报
- [ ] 测试：搜索成功后计费是否正确

### Phase 4: One-API 服务端扩展（3-5 天）
- [ ] 实现计费上报接口
- [ ] 定义 WebSearch 的 token 换算规则
- [ ] 集成到 one-api 计费系统

### Phase 5: 集成测试（2-3 天）
- [ ] 端到端测试
- [ ] 性能测试
- [ ] 错误处理和降级方案

## 非功能需求

### 1. 向后兼容
- 默认 `oneApiEnabled = false`，保持当前直接调用 API 的行为
- 用户可选择是否启用 one-api 集成

### 2. 错误处理
- one-api 服务不可用时，降级到直接调用（可选）
- 计费上报失败时，记录日志但不阻塞用户操作

### 3. 安全性
- one-api user token 加密存储
- HTTPS 通信
- 不在日志中暴露 token

### 4. 性能
- 计费上报异步执行，不阻塞主流程
- 批量上报（可选优化）

## 风险和依赖

### 风险
1. one-api 服务稳定性影响用户体验
2. 计费上报失败可能导致计费不准确
3. 网络延迟增加（多一跳代理）

### 依赖
1. one-api 服务部署和运维
2. one-api 需要扩展支持 WebSearch 计费
3. 用户需要注册 one-api 账号并充值

## 成功标准

1. 所有 AI 调用通过 one-api 代理，计费准确
2. WebSearch 调用成功后计费准确
3. 用户可以在 one-api 后台看到详细账单
4. 向后兼容，不影响现有用户
5. 性能无明显下降（延迟增加 < 100ms）

## 参考资料

- one-api 项目：https://github.com/songquanpeng/one-api
- Brave Search API 文档：https://brave.com/search/api/
- Anthropic API 文档：https://docs.anthropic.com/
