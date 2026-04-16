# Settings 页面重构修改计划

## 1. 背景与目标

当前 `src/components/Settings.tsx` 的设置界面以 AI Providers 为中心组织，整体结构偏单一，不适合继续承载后续的搜索引擎配置、主题配置等更多设置项。

结合现有实现和 `docs/网络搜索集成方案.md`，本次重构的核心目标如下：

1. 将 Settings 从“单一 Provider 配置页”重构为“多分区设置中心”
2. 将 AI Providers 作为其中一个独立分区，而不是整个页面的唯一主体
3. 为后续 Brave Search 接入预留独立的 Search Engine 设置区域
4. 增加 Theme 设置区域，形成统一的设置结构
5. 调整 AI Provider 的添加/编辑交互方式，使其更符合用户心智
6. 改为 Auto-save 模式，移除当前底部统一 Save 按钮
7. 当前阶段优先完成多分区 Settings 重构，其中 AI Provider 配置需要真实可保存、可切换、可使用；Search Engine 和 Theme 先完成 UI 与结构预留

---

## 2. 当前实现分析

### 2.1 当前文件

- 主要文件：`src/components/Settings.tsx`
- 样式文件：`src/components/Settings.css`
- 相关类型：`src/types/settings`（已在组件中引用）

### 2.2 当前页面特点

当前 Settings 页面具有以下特征：

1. 页面主体几乎完全围绕 AI Providers 展开
2. Provider 的新增方式依赖下拉框选择已有 provider 类型，入口不够直接
3. Provider 编辑表单字段固定为：
   - name
   - apiKey
   - baseUrl
   - model
4. 当前 provider 的“名称”和“provider 类型”概念混在一起
5. 页面底部存在全局 `Save Settings` 按钮，采用手动保存模式
6. 未体现 Search Engine / Theme 等其他设置分类

### 2.3 当前问题

#### 问题 1：信息架构单一
当前设置页面缺少分组结构，后续扩展搜索、主题等配置时会持续堆积在同一页面里，导致可维护性和可用性下降。

#### 问题 2：Provider 数据语义不清
当前 `name` 既承担“显示名称”作用，又隐含“provider 类型”意义，难以支持：
- 用户自定义 provider 名称
- 通过 provider type 决定默认字段行为
- 后续支持更多 provider 模板

#### 问题 3：新增 Provider 的交互不自然
当前“下拉选择 provider 后进入编辑”更像内部配置流，不像面向用户的创建流程。用户更自然的预期是：
- 点击 Add
- 新建一个 Provider
- 填写名称
- 选择类型
- 补充接入配置

#### 问题 4：保存机制偏重
底部统一保存会带来：
- 用户需要额外理解“局部改动未生效”状态
- 多区域设置增多后，统一保存的反馈更弱
- 不利于更细粒度的交互反馈

#### 问题 5：无法承载搜索配置
根据 `docs/网络搜索集成方案.md`，未来需要支持 Brave Search API Key 等配置。当前页面结构无法自然接入这类非 provider 设置。

---

## 3. 重构总体方向

本次重构采用“设置中心 + 分区卡片”的结构。

### 3.1 页面结构调整

建议将 Settings 页面拆分为以下 3 个主要区域：

1. **AI Providers**
   - 管理多个 AI provider
   - 设置 active provider
   - 新增 / 编辑 / 删除 provider

2. **Search Engine**
   - 配置网络搜索能力
   - 首期面向 Brave Search
   - 提供 API Key 输入与启用状态展示

3. **Theme**
   - 配置应用主题
   - 当前阶段先提供 UI 占位或基础选项

### 3.2 交互模式调整

- 由“全局 Save”改为“Auto-save”
- 每个字段或每次有效修改后自动持久化
- 页面底部保留关闭操作，不再保留 Save Settings 按钮
- Close 行为明确为“关闭设置窗口”，而不是“保存设置”

### 3.3 实施范围

**当前阶段不是纯 UI 占位，而是“AI Providers 完整可用 + 其他分区先做 UI 预留”。**

包括：
- 页面结构改造
- 分区布局
- Provider 编辑表单重组
- AI Provider 的真实新增 / 编辑 / 删除 / 激活切换 / 保存能力
- AI Provider 配置改动后可真实持久化，并能作为可用配置使用
- Search / Theme 区块 UI
- Auto-save 的视觉与交互预留

不包括：
- Search Engine 真正调用后端保存逻辑
- Theme 真正应用到全局样式
- Search / Theme 的即时生效逻辑
- Provider type 驱动的复杂 schema 校验

---

## 4. 新版 Settings 信息架构

### 4.1 顶层布局建议

建议采用以下结构：

- Header
  - 标题：Settings
  - 右上角关闭按钮（明确是关闭设置）
- Content
  - Section 1: AI Providers
  - Section 2: Search Engine
  - Section 3: Theme
- Footer
  - 可取消传统保存按钮
  - 如需要，可仅保留轻量状态信息，例如：
    - All changes saved
    - Saving...

### 4.2 分区展示形式

每个设置分区建议采用统一样式：

- 分区标题
- 简短描述文案
- 分区内容区域
- 分区内部允许独立表单和状态提示

这样有利于：
- 后续继续扩展更多设置项
- 样式一致
- 用户快速建立认知

---

## 5. AI Providers 分区重构方案

## 5.1 目标

将 AI Providers 从“当前唯一配置主体”重构为“支持列表管理 + 明确编辑表单”的独立设置分区。

### 5.2 列表区改造

当前状态：
- Provider 列表在上方
- 下方通过 dropdown 添加 provider

改造后：
- 保留 Provider 列表
- 移除主区域下拉添加方式
- 在分区标题栏或列表上方增加 **Add Provider** 按钮

建议布局：

- 分区标题：AI Providers
- 分区描述：Manage your AI model providers and choose the active one
- 右侧操作按钮：`Add Provider`
- 下方展示 Provider 卡片列表

### 5.3 Provider 列表项展示字段

每个 Provider 列表项建议至少展示：

1. `name`：用户自定义名称
2. `type`：Provider 类型（如 Anthropic / OpenAI / OpenAI Compatible / Custom）
3. `model`：当前模型
4. `active` 状态标签（若为当前激活）
5. 操作按钮：
   - Set Active
   - Edit
   - Delete

### 5.4 新建 / 编辑 Provider 表单结构

表单字段顺序建议调整为：

1. **Provider Name**
   - 用户自定义
   - 示例：My Work Anthropic / Company OpenAI / Local Model
   - 不再等同于 provider 类型

2. **Type**
   - 下拉选择
   - 示例选项：
     - Anthropic
     - OpenAI
     - OpenAI Compatible
     - Custom
   - 后续可扩展更多类型

3. **Access Configuration**
   - 根据 type 决定显示哪些字段
   - 当前阶段不仅要完成条件渲染，还要保证这些字段能真实保存并用于 AI Provider 配置

4. **Model**
   - 当前先保留手动输入
   - 在文档与代码中注明 TODO：后续增加模型候选或校验，降低 typo 风险

### 5.5 Type 驱动的字段显示建议

#### Anthropic
建议显示：
- API Key
- Base URL（可选）
- Model

#### OpenAI
建议显示：
- API Key
- Base URL（可选）
- Model

#### OpenAI Compatible
建议显示：
- Base URL（必填）
- API Key（通常必填）
- Model

#### Custom
建议显示：
- Base URL
- API Key
- Model
- 后续扩展字段预留

### 5.6 Provider 数据语义调整建议

建议在前端视角中，明确拆分以下概念：

- `name`: 用户自定义显示名称
- `type`: provider 类型
- `apiKey`: 接口密钥
- `baseUrl`: 接口地址
- `model`: 模型标识
- `enabled`: 是否启用

即使当前底层类型还没有 `type` 字段，UI 方案文档中也应先明确这一目标数据结构，为后续类型调整做准备。

### 5.7 Add Provider 交互建议

点击 `Add Provider` 后：

- 进入 Provider 编辑态
- 默认创建一份空白 provider 草稿
- 默认字段建议：
  - name: 空
  - type: Anthropic 或空
  - apiKey: 空
  - baseUrl: 空或类型默认值
  - model: 空

### 5.8 编辑态与列表态切换

建议继续保持单页内切换，但视觉上更明确：

- 列表态：展示所有 provider
- 编辑态：展示 provider 表单
- 编辑态顶部明确显示：
  - Add Provider
  - Edit Provider

必要时可在编辑区增加：
- Back to list
- Delete Provider（编辑现有 provider 时）

---

## 6. Search Engine 分区设计

### 6.1 设计依据

根据 `docs/网络搜索集成方案.md`，首期搜索能力围绕 Brave Search API 集成，因此设置页应预留独立的搜索配置区域。

### 6.2 当前阶段 UI 目标

当前阶段 Search Engine 分区先完成 UI 结构和字段布局，不要求现在真实接通逻辑。

建议包含以下内容：

1. **Search Engine 开关或状态区域**
   - 例如：Enable web search
   - 或展示当前是否已配置搜索能力

2. **Provider 类型说明**
   - 当前固定展示：Brave Search
   - 后续可扩展更多搜索提供方

3. **API Key 输入框**
   - 对应 `brave_search_api_key`
   - 使用密码输入样式

4. **说明文案**
   - 简要说明：配置 Brave Search API Key 后，AI 可进行网络搜索

5. **帮助提示 / 链接占位**
   - 如：How to get a Brave Search API key
   - 当前阶段可以只做文本提示，不接真实跳转

### 6.3 建议字段

建议 Search Engine 分区首期 UI 包含：

- Search Provider: Brave Search
- API Key
- Status / Enabled indicator
- Description text

### 6.4 与配置文档的对应关系

该分区应与 `docs/网络搜索集成方案.md` 中的以下配置项对齐：

- `brave_search_api_key`

后续如果扩展搜索配置，还可继续增加：
- 搜索结果数量默认值
- 搜索开关
- 搜索类型偏好

---

## 7. Theme 分区设计

### 7.1 当前目标

Theme 区域当前主要用于补齐 Settings 的整体结构，为未来主题能力预留入口。

### 7.2 UI 建议

首期可以只提供简单主题选项：

- Theme
  - Light
  - Dark
  - System

展示形式可选：
- 单选按钮组
- 下拉框
- 分段选择器

### 7.3 当前阶段定位

如果主题逻辑尚未具备，当前可以：
- 只做 UI 占位
- 在文案中注明 future support
- 不要求即时生效

---

## 8. Auto-save 方案

### 8.1 目标

将当前手动保存机制改为自动保存机制，让用户修改后无需再点击 `Save Settings`。

### 8.2 当前问题

当前流程是：
- 修改内存状态
- 点击底部 Save Settings
- 调用 `save_config`

该模式在多分区设置下体验较重。

### 8.3 新交互建议

改为：
- 用户修改字段
- 本地状态立即更新
- UI 显示 `Saving...`
- 保存成功后显示 `All changes saved`
- 保存失败时显示局部错误提示

### 8.4 当前阶段实现边界

当前阶段需要区分 AI Providers 与其他分区的实现深度：

1. **AI Providers**
   - 移除底部 `Save Settings` 按钮
   - 改为真实的 auto-save / 自动持久化方向
   - Provider 的新增、编辑、删除、激活切换需要真正可用
   - Provider 配置修改后需要能够真实保存，并作为后续实际可使用的配置

2. **Search Engine / Theme**
   - 当前先完成 UI 结构
   - 可以展示字段、状态文案、说明信息
   - 暂不要求真实保存与即时生效

3. **保存状态展示**
   - 页面保留状态文案区域，例如：
     - Saving...
     - Changes saved
     - Failed to save changes

### 8.5 后续实现建议

正式落地 auto-save 时建议采用：

- 对输入进行 debounce 保存
- 对开关/选择类配置可即时保存
- 避免每个 keystroke 都直接请求后端
- 保存失败时提供可见反馈与重试机制

---

## 9. Close 按钮重构建议

### 9.1 当前问题

当前页面底部存在 Close，同时顶部也有关闭按钮，整体语义略重复。

### 9.2 调整建议

在 Auto-save 模式下，页面应强调“关闭设置”而不是“保存并关闭”。

建议：

1. 保留 Header 右上角关闭按钮作为主关闭入口
2. 按钮视觉改为更明确的设置关闭样式
3. 底部不再保留 Save Settings
4. 底部如果仍保留按钮，可只保留：
   - Close
   或直接移除底部按钮栏

更推荐方案：
- Header 右上角关闭按钮 + 页面内无额外 Save 按钮

---

## 10. UI 草图建议

## 10.1 列表态

```text
┌──────────────────────────────────────────────┐
│ Settings                                 [×] │
├──────────────────────────────────────────────┤
│ AI Providers                      [Add]      │
│ Manage your AI model providers...            │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ My Anthropic                [Active]     │ │
│ │ Type: Anthropic                         │ │
│ │ Model: claude-opus-4-6                  │ │
│ │ [Edit] [Delete]                         │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ Search Engine                                │
│ Configure web search for real-time answers   │
│ Provider: Brave Search                       │
│ API Key: [***************            ]       │
│ Status: Configured                           │
│                                              │
│ Theme                                        │
│ Choose how the app looks                     │
│ ( ) Light  ( ) Dark  (•) System              │
│                                              │
│                         All changes saved    │
└──────────────────────────────────────────────┘
```

### 10.2 Provider 编辑态

```text
┌──────────────────────────────────────────────┐
│ Settings                                 [×] │
├──────────────────────────────────────────────┤
│ ← Back                                       │
│ Add Provider                                 │
│                                              │
│ Provider Name *                              │
│ [ My Work Provider                     ]     │
│                                              │
│ Type *                                       │
│ [ Anthropic ▼                          ]     │
│                                              │
│ API Key *                                    │
│ [ ************************************ ]     │
│                                              │
│ Base URL                                     │
│ [ https://api.anthropic.com           ]      │
│                                              │
│ Model *                                      │
│ [ claude-opus-4-6                     ]      │
│                                              │
│ TODO: later provide model validation/list    │
│                                              │
│ [Cancel]                      Saving...      │
└──────────────────────────────────────────────┘
```

---

## 11. 组件拆分建议

虽然当前文件是单个 `Settings.tsx`，但本次重构后建议按 UI 结构拆分子组件，降低复杂度。

建议候选组件：

- `Settings.tsx`
  - 顶层容器
  - 加载配置
  - 控制当前编辑态

- `ProviderSection.tsx`
  - Provider 列表区
  - Add 按钮
  - Active 状态

- `ProviderEditor.tsx`
  - Provider 新建/编辑表单
  - 根据 type 条件渲染字段

- `SearchSettingsSection.tsx`
  - Brave Search 配置区

- `ThemeSettingsSection.tsx`
  - Theme 配置区

- `SaveStatusIndicator.tsx`
  - Saving / Saved / Error 状态展示

如果当前阶段不想拆文件太多，也至少建议在 `Settings.tsx` 内部先按逻辑分块，避免继续膨胀。

---

## 12. 数据结构调整建议

### 12.1 Provider 前端模型建议

建议未来的 Provider 配置结构显式支持 `type` 字段：

```ts
interface ProviderConfigDraft {
  id: string;
  name: string;
  type: 'anthropic' | 'openai' | 'openai-compatible' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model: string;
  enabled: boolean;
}
```

### 12.2 Settings 顶层结构扩展建议

为了支持 Search 和 Theme，Settings 数据结构未来可扩展为：

```ts
interface SettingsData {
  providers: ProviderConfigDraft[];
  activeProvider: string;
  search?: {
    provider: 'brave';
    apiKey: string;
    enabled: boolean;
  };
  theme?: 'light' | 'dark' | 'system';
}
```

当前阶段不要求立刻改完底层结构，但文档中应先明确方向。

---

## 13. 推荐实施步骤

### 阶段 1：页面结构重组

1. 重构 Settings 页面布局
2. 新增 3 个 section：AI Providers / Search Engine / Theme
3. 移除底部 Save Settings 按钮
4. 统一 Header close 交互

### 阶段 2：Provider UI + 可用逻辑重构

1. 移除 Add Provider 下拉框
2. 改为 Add 按钮
3. 重构 Provider 编辑表单字段顺序
4. 增加 Type 字段
5. 根据 Type 条件展示字段
6. 打通 Provider 新增 / 编辑 / 删除 / 激活切换的真实保存逻辑
7. 确保保存后的 Provider 配置可被实际使用

### 阶段 3：Search / Theme UI 接入

1. 加入 Brave Search API Key 输入区
2. 加入 Theme 选择区
3. 增加状态说明文案
4. 当前先不要求 Search / Theme 真实保存与即时生效

### 阶段 4：Auto-save 骨架

1. 删除手动保存按钮
2. 增加保存状态展示
3. 预留自动保存状态与后续逻辑接入点

---

## 14. 风险与注意事项

### 14.1 类型迁移风险

当前 `ProviderConfig` 是否支持 `type` 需要确认。如果不支持，则 UI 与底层数据之间会存在过渡期映射逻辑。

### 14.2 Auto-save 风险

如果后续直接对每次输入变更都调用保存，可能导致：
- 频繁请求
- 输入体验卡顿
- 保存顺序竞争问题

因此正式落地时必须考虑 debounce / cancellation。

### 14.3 编辑态复杂度上升

随着 provider type 增多，表单条件渲染会变复杂，应尽早避免把全部逻辑堆在一个组件里。

### 14.4 搜索设置与现有配置结构对齐

`docs/网络搜索集成方案.md` 中展示了 `brave_search_api_key`，实际前后端配置结构需要确保一致，避免 UI 字段存在但无法保存。

---

## 15. 本阶段交付定义

本阶段完成标准建议定义为：

1. Settings 页面已调整为多分区结构
2. AI Providers 已改为列表 + Add 按钮模式
3. Provider 编辑表单首字段为 Name，包含 Type 字段
4. AI Provider 的新增、编辑、删除、激活切换已真实可用
5. AI Provider 配置修改后可以真实保存，并能作为实际可使用配置生效
6. Search Engine 分区已出现 Brave Search 配置 UI
7. Theme 分区已提供基础 UI
8. 全局 Save Settings 按钮已移除
9. 页面已体现 Auto-save 状态
10. Search / Theme 当前允许先停留在 UI 层，不要求即时生效

---

## 16. 后续 TODO

1. 为 Model 字段提供候选列表或校验机制，减少 typo
2. 为不同 Provider Type 建立标准默认值策略
3. 继续完善 auto-save（debounce、并发控制、错误恢复）
4. 将 Search Engine 设置接入真实配置持久化
5. 将 Theme 设置接入全局主题系统
6. 根据实际复杂度进一步拆分 Settings 子组件

---

## 17. 总结

本次 Settings 重构的本质，不只是“改一下 Provider 表单”，而是把设置页从单一功能面板升级为可持续扩展的设置中心。

核心变化包括：

- 从单一 Provider 页面升级为多分区 Settings
- 从下拉添加 Provider 改为更自然的 Add 流程
- 从“名称即类型”改为“Name + Type + Access Config”分离
- 从手动保存改为 Auto-save 方向
- AI Providers 本阶段即需真实可用
- 为 Brave Search 与 Theme 能力预留清晰入口

建议先完成“AI Providers 可用化 + 多分区 UI 重构”，再逐步补齐 Search / Theme 的真实生效逻辑。
