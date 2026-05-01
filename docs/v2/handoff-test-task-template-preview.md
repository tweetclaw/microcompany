# Handoff 测试任务：实现模板预览功能

**任务类型**: 功能开发  
**预计时长**: 1-2 小时协作  
**难度**: 中等  
**目标**: 测试 PM → Backend → Frontend → QA 的完整 handoff 流程

---

## 1. 任务背景

从 Team Templates 完整实施计划中提取的**最小可测试功能**：

> **让用户在选择模板前能看到模板的详细预览,包括模板名称、说明、角色列表、推荐 archetype 和角色顺序。**

这个功能是 Team Templates 的核心用户体验之一,但范围足够小,适合用来测试多角色协作流程。

---

## 2. 为什么选择这个任务

### 2.1 范围适中
- 不需要完整实现整个 Team Templates 系统
- 只需要实现"读取模板 → 展示预览"这一条路径
- 可以先用 mock 数据,不需要完整的存储系统

### 2.2 角色分工清晰
- **PM**: 定义预览界面应该展示什么信息
- **Backend**: 定义模板数据结构和查询接口
- **Frontend**: 实现预览 UI 组件
- **QA**: 验证预览信息的完整性和准确性

### 2.3 可独立验证
- 不依赖其他未完成的功能
- 可以通过 UI 直观验证结果
- 容易判断是否完成

---

## 3. 任务范围定义

## 3.1 纳入范围

**后端部分**:
- 定义 `TaskTemplate` 和 `TemplateRole` 数据结构
- 实现读取单个模板详情的接口
- 可以先用硬编码的 mock 数据(1-2 个示例模板)

**前端部分**:
- 实现模板预览组件 `TemplatePreview`
- 展示模板基本信息(名称、说明)
- 展示角色列表(名称、身份、archetype、顺序)
- 复用 Team Brief 的展示风格

**测试部分**:
- 验证预览信息完整性
- 验证角色顺序正确
- 验证 archetype 显示正确

## 3.2 明确不做

- ❌ 不实现模板列表
- ❌ 不实现模板选择逻辑
- ❌ 不实现从模板创建 task
- ❌ 不实现保存模板功能
- ❌ 不实现真实的数据库存储
- ❌ 不实现模板编辑功能

---

## 4. 预期产出

### 4.1 PM 产出
- 模板预览界面的信息架构
- 必须展示的字段清单
- 与 Team Brief 的复用策略

### 4.2 Backend 产出
- `TaskTemplate` 类型定义
- `TemplateRole` 类型定义
- `get_template_detail(id)` 接口定义
- 2 个 mock 模板数据示例

### 4.3 Frontend 产出
- `TemplatePreview.tsx` 组件
- 调用后端接口获取数据
- 渲染模板信息和角色列表
- 基本样式(复用 Team Brief 风格)

### 4.4 QA 产出
- 模板预览功能测试清单
- 边界情况测试(空模板、单角色模板等)
- UI 展示验证标准

---

## 5. 技术约束

### 5.1 数据结构参考

```typescript
// 后端应定义的最小结构
interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  roles: TemplateRole[];
}

interface TemplateRole {
  id: string;
  name: string;
  identity: string;
  recommendedArchetypeId?: string | null;
  displayOrder: number;
}
```

### 5.2 Mock 数据示例

```typescript
// 示例 1: 软件交付团队
{
  id: "template-001",
  name: "Software Delivery Team",
  description: "A standard team for feature development",
  isSystem: true,
  roles: [
    {
      id: "role-001",
      name: "Product Manager",
      identity: "Product Manager",
      recommendedArchetypeId: "product_manager",
      displayOrder: 0
    },
    {
      id: "role-002",
      name: "Backend Developer",
      identity: "Backend Developer",
      recommendedArchetypeId: "backend_developer",
      displayOrder: 1
    },
    {
      id: "role-003",
      name: "Frontend Developer",
      identity: "Frontend Developer",
      recommendedArchetypeId: "frontend_developer",
      displayOrder: 2
    }
  ]
}
```

### 5.3 UI 复用策略

- 优先复用 `TeamBrief` 组件的展示逻辑
- 角色卡片样式与 Team Brief 保持一致
- 不需要重新设计全新的视觉风格

---

## 6. 验收标准

### 6.1 功能完整性
- ✅ 可以通过接口获取模板详情
- ✅ 前端可以渲染模板名称和说明
- ✅ 前端可以渲染角色列表
- ✅ 角色按 `displayOrder` 正确排序
- ✅ 每个角色显示名称、身份、推荐 archetype

### 6.2 代码质量
- ✅ 类型定义清晰
- ✅ 接口命名合理
- ✅ 组件结构清晰
- ✅ 复用现有代码(Team Brief)

### 6.3 用户体验
- ✅ 预览界面信息完整
- ✅ 视觉风格与现有 UI 一致
- ✅ 加载状态处理得当

---

## 7. 与完整计划的关系

这个任务是 `docs/v2/team-templates-next-phase-implementation-plan.md` 中的一个子集:

**完整计划中的位置**:
- 属于 "前端实施计划 Phase 2: 模板列表与模板预览"
- 是整个 Team Templates 功能的基础组件
- 后续可以在此基础上扩展模板列表、模板选择等功能

**简化点**:
- 不实现完整的模板管理系统
- 不实现数据库存储
- 只实现预览这一个核心交互

---

## 8. 成功标准

当以下条件都满足时,认为任务完成:

1. **PM 成功收敛范围**: 明确了预览界面应该展示什么,不应该展示什么
2. **Backend 成功定义接口**: 数据结构清晰,mock 数据可用
3. **Frontend 成功实现 UI**: 组件可渲染,信息完整,样式合理
4. **QA 成功验证功能**: 测试清单覆盖主流程和边界情况
5. **团队协作流畅**: handoff 建议合理,角色接力顺畅

---

## 9. 时间预估

- **PM 阶段**: 10-15 分钟
- **Backend 阶段**: 15-20 分钟
- **Frontend 阶段**: 20-30 分钟
- **QA 阶段**: 10-15 分钟
- **总计**: 约 1-1.5 小时

---

## 10. 风险控制

### 10.1 范围蔓延风险
**控制策略**: 严格限制在"预览"这一个功能,不扩展到列表、选择、创建等

### 10.2 过度设计风险
**控制策略**: 优先复用 Team Brief,不重新设计全新组件

### 10.3 技术债务风险
**控制策略**: 使用 mock 数据是临时方案,但数据结构应该是最终版本

---

## 11. 后续扩展方向

完成这个任务后,可以继续扩展:

1. 实现模板列表界面
2. 实现模板选择逻辑
3. 实现从模板创建 task draft
4. 实现真实的数据库存储
5. 实现保存 task 为模板

但这些都不在本次测试任务的范围内。

---

## 12. 一句话总结

> **实现一个最小的模板预览组件,让用户能看到模板的基本信息和角色列表,用这个小而完整的功能来测试 PM → Backend → Frontend → QA 的完整 handoff 协作流程。**
