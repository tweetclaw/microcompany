# clark `completed_tool_only` / “看起来像中断” 交接文档

## 1. 问题概述

当前 task AI（尤其是 `clark` / `bob`）多次出现这种用户感知问题：

- AI 前面已经开始说话、展示了 streaming 内容
- 中间做了多轮工具调用
- 最后用户看到 AI “像中断了一样”结束
- 有时最终展示内容也会“不对”或不像完整回复

用户明确要求：

- **优先通过 `dev.log` 定位**
- 只在必要处加日志
- 不要做无关的大改
- 重点围绕 `completed_tool_only` 场景
- 编译必须通过

---

## 2. 当前核心结论

到目前为止，**后端日志已经多次证明：这些 case 大概率不是 crash / cancel / provider error，而是正常 `EndTurn`，但最后一跳是 tool-only 结束。**

也就是说：

- query loop 正常进入
- 中间有 streaming 文本
- 工具调用正常执行
- 最后 `QueryOutcome::EndTurn`
- 但最终 message content 只包含 `tool_result`
- 因此后端把它归类为 `completed_tool_only`

用户体感上的“中断”，更像是：

1. 模型最后没有自然语言收尾  
2. 前端/产品展示把这种终态呈现成了“像中断”

---

## 3. 用户要求与约束

用户已经多次强调：

1. **先看日志，定位问题**
2. **不要扩大战线**
3. **我建议只做 `completed_tool_only` 场景补更细日志，这个，其它的不要改**
4. 用户不认同“fallback / 系统提示词才是主因”的方向
5. 若要修改，必须：
   - 尽量小改
   - 编译通过
   - 用日志证明判断

用户当前已失去信任，所以后续 AI 需要：

- 不要再泛泛分析
- 每一步都基于现有日志和代码
- 结论要能被 `dev.log` 直接支撑

---

## 4. 已完成的代码修改

### 4.1 Vite watch ignore 已调整
文件：
- `vite.config.ts`

当前内容已包含：
```ts
watch: {
  ignored: [
    '**/.claude/**',
    '**/.git/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/src-tauri/target/**',
    '**/target/**',
  ],
},
```

这个是之前为减少 reload / 闪动做的，和当前 clark 问题不是同一根因，但已生效。

---

### 4.2 后端终态协议已存在
文件：
- `src/types/index.ts`

已有关键类型：
```ts
export type AiActivityPhase = 'thinking' | 'tool_running' | 'streaming' | 'finalizing';
export type AiTerminalOutcome = 'completed' | 'completed_tool_only' | 'handoff_ready' | 'cancelled' | 'error' | 'max_tokens' | 'budget_exceeded';
export type AiTerminalReasonCode = 'user_cancelled' | 'provider_error' | 'tool_only_end_turn' | 'handoff_detected' | 'context_limit' | 'budget_limit' | 'unknown';
```

以及：
```ts
export interface AiRequestEndEvent {
  request_id: string;
  session_id?: string;
  result: AiRequestResult;
  outcome: AiTerminalOutcome;
  activity_phase_at_end: AiActivityPhase;
  reason_code?: AiTerminalReasonCode;
  error_message?: string;
  final_text?: string;
  has_visible_text?: boolean;
  handoffSuggestion?: HandoffSuggestion;
  usage?: AiUsageInfo;
  warnings?: AiWarningInfo[];
  timestamp: number;
}
```

---

### 4.3 后端已补足 `completed_tool_only` 诊断日志
核心文件：
- `src-tauri/src/claurst/mod.rs`

已经加入的重要内容：

#### (a) `summarize_message_content(...)`
用于把最终消息内容总结成结构化 JSON，区分：
- text
- tool_use
- tool_result
- other

#### (b) `CompletedToolOnlyDiagnosticContext`
记录 request 级别的：
- `tool_sequence`
- `turn_summaries`

#### (c) `ToolStart` / `ToolEnd` 记录 recent tool sequence

#### (d) `TurnComplete` 记录 turn summaries

#### (e) `QueryOutcome::EndTurn` 下对 `completed_tool_only` 输出完整诊断
关键日志名：
- `claurst_completed_tool_only_diagnostic`

它会带出：
- `assistant_message_count`
- `extracted_text_before_fallback_chars`
- `fallback_visible_text_used`
- `message_content_summary`
- `last_assistant_message_summary`
- `recent_assistant_message_summaries`
- `recent_tool_sequence`
- `turn_summaries`

这些日志已经足够证明：
- 最终是不是只有 `tool_result`
- 更早是否曾出现过自然语言文本
- 最近的工具链路是什么

---

### 4.4 前端做过一轮最小修复与日志补充
文件：
- `src/components/ChatInterface.tsx`

已做修改：

#### (a) `finalizeStreamingMessage(...)` 增加日志
新增日志点：
- missing target
- target 详情
- previous content chars / preview
- finalText chars / preview
- contentReplaced

#### (b) `ai-request-end` 收尾时增加判断
新增中间变量：
- `streamedVisibleText`
- `hadStreamedVisibleText`
- `shouldShowToolOnlyNotice`

#### (c) 对 `completed_tool_only` 的 tool-only 提示做抑制
当前逻辑改成：

- 如果这轮**前面已经有 streamed text**
  - 不再追加  
    `工具已执行完成，但本轮未返回可显示文本`
- 如果整轮确实没有任何可见文本
  - 才显示这个 fallback 提示

目标是减少：
- 前面明明说过话
- 最后却像被“工具已完成”提示收坏

---

## 5. 已完成编译验证

修改后已经跑过：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
```

结果：
- `cargo check` ✅
- `npm run build` ✅

---

## 6. 关键日志证据

### 6.1 较早的 clark 案例
一个关键 request：

- `request_id=04b94fd2-89b4-453d-988d-ab2f61428db0`

结论：
- 不是 cancel
- 不是 crash
- `run_query_loop` 正常退出
- 最终 `completed_tool_only`
- `message_content_summary` 显示最终只剩 `tool_result`
- 但更早的 assistant message 里确实有 text：
  - 类似“现在我已经完全理解了代码状态。让我开始……”

这证明：
> “前面有话”与“最后 tool-only 结束”是可同时成立的。

---

### 6.2 新增一轮 `completed_tool_only` 诊断后，另两个 request

#### request_id=`6ad84764-835e-4d0e-9259-e829a571ecf1`
- 最终 message content 含 2 个 `tool_result`
- `last_assistant_message_summary` 显示更早确实有文本：
  - “Let me check the full Task interface and WelcomePage component:”
- 最近工具链路正常
- 10 turns

#### request_id=`6b74cb6c-989e-488c-811b-e423605ed1ed`
- 最终 message 只有 1 个 `tool_result`
- `last_assistant_message_summary` 没有 text，只有 tool_use
- 更早几条 assistant summary 仍有工具使用痕迹

这两例进一步说明：
- “最后只有 tool_result”是重复出现的真实模式
- 不是单次偶发崩溃

---

### 6.3 最新 clark 测试（最重要）
本轮用户测试后的 request：

- `request_id = c4c64348-7cf9-40dd-9abf-f9c1864ffb6a`

#### 关键事实

1. 正常启动：
- `task_message_send_begin`
- `claurst_request_begin`
- `claurst_request_run_query_loop_enter`

2. 首事件就是 stream：
- `claurst_request_first_event ... first_event=stream`

3. 中间有多轮 streaming：
- `13:08:30`
- `13:08:40`
- `13:08:55`
- `13:09:18`

4. 中间有大量工具调用：
- `Read`
- `Bash`
- `Glob`
- `Grep`

5. query loop 正常退出：
- `claurst_request_run_query_loop_exit ... first_event_seen=true outcome_discriminant=Discriminant(0)`

6. 最终 outcome：
- `completed_tool_only`
- `reason_code=tool_only_end_turn`
- `has_visible_text=false`
- `fallback_visible_text_used=true`

7. 最终 terminal 文本只是 fallback：
- `final_text_preview=✓ 已完成工具执行`

8. `claurst_completed_tool_only_diagnostic` 直接显示：
```text
message_content_summary={"block_count":2,"blocks":[
  {"type":"tool_result"},
  {"type":"tool_result"}
]}
```

并且：
```text
extracted_text_before_fallback_chars=0
```

#### 结论
这轮不是“clark 突然死了”，而是：

- 前面确实 stream 过文本
- 后面持续跑工具
- 最后一跳是两个 `tool_result`
- 没有新的 text block 收尾
- 所以后端按 `completed_tool_only` 正常结束

---

## 7. 当前仍未完全确定的点

虽然前端加了新日志，但在最新这份 `dev.log` 里：

- **没有看到 `[ChatInterface] ...` 前端新增日志**

这意味着：

### 已经可以 100% 确认的
- 后端不是 crash
- 后端不是 cancel
- 后端不是 provider error
- 后端确实是 `completed_tool_only`

### 还不能直接从日志确认的
- 前端是否真的覆盖了已经 streamed 出来的正文
- 还是只是用户因为“最后没有自然语言收尾”而主观感觉成“中断”

所以当前问题还差最后一步证据链：
> 前端在 terminalization 时，是否把已有正文覆盖/替换/错误 finalize 了。

---

## 8. 当前最可信的根因判断

### 根因 1：模型/agent loop 的真实输出模式
在 task AI 的多轮工具场景下，模型常常：

- 前面输出自然语言
- 中间驱动工具
- 最后一轮只返回 `tool_result`
- 不再补一条总结性文本

### 根因 2：产品/前端展示层
用户期待的是“完整自然语言结束感”。

但当前当最后没有 text block 时：
- 终态被归成 `completed_tool_only`
- UI 可能呈现成“像中断”
- 如果还有正文收尾错位/覆盖，就会进一步放大这个感受

---

## 9. 下一个 AI 应该优先做什么

### 优先级 1：确认前端日志是否真正进入 `dev.log`
先不要继续猜。

目标：
- 确认 `ChatInterface.tsx` 新增的这些日志是否真的被当前运行方式采集：
  - `[ChatInterface] finalize request`
  - `[ChatInterface] finalizeStreamingMessage target`
  - `[ChatInterface] suppress completed_tool_only fallback notice because streamed text already exists`

如果没有进入：
- 要么日志输出位置不对
- 要么当前 dev.log 只收后端/Tauri，不收前端 console
- 先把这个采集问题搞明白

### 优先级 2：如果前端日志能拿到，验证“是否覆盖正文”
要确认：

1. request 结束时，当前 assistant message 的 content 是多少
2. `finalizeStreamingMessage` 有没有 `contentReplaced=true`
3. `completed_tool_only` 时，是否保留了之前的 streamed text
4. 是否还错误追加了 tool-only fallback notice

### 优先级 3：若日志仍无法覆盖前端，直接做产品修复
如果后端模式已经被反复证明，那么可以直接做更明确的 UI 语义修复：

对于：
- “前面已有 streamed text”
- “最后 `completed_tool_only`”

应该：
- 保留 streamed 正文
- 明确显示“本轮完成了工具执行，但未生成新的总结文本”
- 不要让它看起来像异常中断

---

## 10. 不建议继续做的方向

用户已经明确不想继续往这些方向发散：

1. **不要继续把主因归咎于 fallback / 系统提示词**
2. **不要再做无关的大重构**
3. **不要先讲大段理论，再不落地**
4. **不要继续加一堆与当前问题无关的日志**

---

## 11. 可直接复用的定位口径

下一个 AI 可以直接用这句话作为工作起点：

> 先基于 `request_id=c4c64348-7cf9-40dd-9abf-f9c1864ffb6a` 继续定位。后端已经证明这是正常 `completed_tool_only` 结束，不是 crash/cancel/error。请优先确认前端 terminalization 是否覆盖了已有 streamed 文本；如果拿不到前端日志，就直接把“前面已有 streamed text 且最终 tool-only”场景改成保留正文、只追加准确终态说明。

---

## 12. 相关文件清单

重点文件：

- `src-tauri/src/claurst/mod.rs`
- `src/components/ChatInterface.tsx`
- `src/types/index.ts`
- `src/App.tsx`
- `src/components/TaskModeLayout.tsx`
- `vite.config.ts`
- `dev.log`

如果需要看完整对话与更细上下文，可读：
- `/Users/wesley/.claude/projects/-Users-wesley-aiwithblockchain-microcompany/d5c86fd0-c0c3-45c3-a7f6-24522ff2c54f.jsonl`

---

## 13. 给下一个 AI 的一句话总结

**不要再花时间证明“是不是中断”了，后端日志已经多次证明：这类 clark/bob case 大概率是正常 `completed_tool_only` 结束。现在真正要解决的是：前端如何把“前面有 streaming 文本、最后 tool-only 收尾”正确呈现出来，而不是让用户感觉 AI 莫名中断。**
