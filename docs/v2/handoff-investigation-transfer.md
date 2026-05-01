# Handoff Investigation Transfer

## Current development track

The main product work in progress is centered on:

`docs/v2/team-templates-next-phase-implementation-plan.md`

This is not an unrelated chat bug. The missing handoff confirmation is happening inside the broader multi-role task-room workflow we are actively building.

In the real scenario that exposed the bug, the AI was answering in the context of that document and explicitly concluded that the next step should go to **Backend Engineer**. The product should have surfaced a user-confirmed handoff UI at that moment, but it did not.

---

## Problem statement

### User-visible behavior
In the task room, the AI reply clearly says the work should be handed off to another teammate, but the app does **not**:

- open a handoff confirmation dialog
- show a confirmation button for handoff
- let the user complete the transfer to the next role

### What this is not
This is not primarily:

- a copywriting problem
- a generic frontend styling issue
- the earlier cancel/stuck-request issue
- proof that the frontend has no handoff UI at all

### What this most likely is
This is most likely a failure in the structured handoff pipeline:

> the assistant’s natural-language recommendation did not become a valid runtime `handoffSuggestion` payload that the frontend can use to open the confirmation modal.

---

## Confirmed facts

### 1. The frontend already has handoff modal logic
`src/App.tsx` already contains modal state and a handoff handler.

Relevant behavior:

```ts
const handleHandoffSuggestion = (event: AiRequestEndEvent) => {
  if (!event.handoffSuggestion?.recommended) return;
  setPendingHandoffSuggestion(event.handoffSuggestion);
  setShowForwardModal(true);
};
```

Meaning:

- if `handoffSuggestion` is missing, no modal
- if `handoffSuggestion.recommended !== true`, no modal

So the modal path is not entirely absent. It is gated.

---

### 2. `ChatInterface.tsx` only reacts to structured handoff data
The chat UI listens for `ai-request-end` and only forwards the event upstream when `payload.handoffSuggestion` exists.

Meaning:

> plain visible text like “next this should go to Backend Engineer” is not enough.

The UI does not infer handoff from natural language. It requires structured runtime data.

---

### 3. Backend handoff emission depends on a machine-readable `[HANDOFF]` block
In `src-tauri/src/claurst/mod.rs`, the current logic is:

1. collect final text
2. call `extract_handoff_block(&text)`
3. call `resolve_handoff_suggestion(&self.session_id, parsed)`
4. emit `ai-request-end` with optional `handoffSuggestion`

Meaning:

> no valid `[HANDOFF] ... [/HANDOFF]` block, or no valid resolved target, means no `handoffSuggestion` reaches the frontend.

---

### 4. Prompt contract logs show structured handoff was intended
`dev.log` shows the task prompt contract version included structured handoff support.

Observed log facts already confirmed:

- `prompt_contract_version=task-role-v6-structured-handoff`
- prompt text instructed that handoff is only a suggestion and must wait for user confirmation
- prompt text instructed that the model may output a HANDOFF block when handoff is appropriate

Meaning:

> the product intention already exists in prompt contract and architecture.

---

### 5. The failing scenario was a successful reply, not a failed request
The logs showed the request completed successfully and produced a long final response.

Meaning:

> this is not explained by transport failure or request cancellation.

The failure is after successful completion, in the handoff suggestion path.

---

## Critical warning: do not inspect the wrong database
A previous investigation step mistakenly queried:

`src-tauri/data.db`

That was incorrect and must be ignored. SQLite can create an empty file there, which makes the results misleading.

### Correct runtime database path
The real application database path was confirmed from logs:

`/Users/immeta/Library/Application Support/com.microcompany.desktop/.mc/data.db`

All future database inspection for this bug must use that runtime database.

---

## Most likely root-cause directions

### Direction A, highest probability
The assistant reply contained only natural-language handoff advice, but **did not include a valid `[HANDOFF] ... [/HANDOFF]` block**.

Symptoms:

- user sees “hand this to Backend Engineer” in visible text
- backend gets no machine-readable block
- frontend gets no `handoffSuggestion`
- modal never opens

---

### Direction B
A HANDOFF block exists, but its format does not match parser expectations.

Possible causes:

- wrong field names
- malformed wrapper
- missing required fields
- mixed Chinese/English labels the parser does not accept
- invalid `recommended` value

---

### Direction C, also highly likely
The HANDOFF block parsed, but `target_role` did not resolve to a real roster member.

This is especially suspicious because:

- the user saw a recommendation for **Backend Engineer**
- the actual roster in logs used **Backend Developer**

If the resolver expects exact or near-exact matching, then:

- `Backend Engineer` may fail to resolve
- `resolve_handoff_suggestion(...)` may return `None`
- modal will not appear

This is a strong candidate.

---

### Direction D
A structured handoff suggestion was generated, but `recommended` was false.

This is possible, but less likely than A or C based on the observed user behavior.

---

## Recommended investigation plan for the next AI

### Step 1, highest priority
Query the **real runtime database** and inspect the latest assistant message content for the failing session.

Goal:

- confirm whether the stored assistant reply contains a `[HANDOFF] ... [/HANDOFF]` block
- inspect its exact fields if present

Questions to answer:

1. Does the assistant message contain `[HANDOFF]` at all?
2. Does it contain `recommended: yes`?
3. What exact value is used for `target_role`?
4. Is it `Backend Engineer`?
5. Is the block structurally valid?

This step separates “model never emitted structured handoff” from “backend/UI mishandled structured handoff”.

---

### Step 2, if no HANDOFF block exists
Investigate prompt-contract enforcement.

Check whether:

- the structured handoff instructions are definitely injected for the active role
- the contract is too weak and lets the model mention handoff in prose without requiring the machine-readable suffix

Likely fix direction if this is the cause:

- strengthen prompt contract so that when the assistant recommends handoff, it must append a valid HANDOFF block

---

### Step 3, if a HANDOFF block exists
Investigate backend parsing and target resolution.

Focus areas:

- `extract_handoff_block(...)`
- `resolve_handoff_suggestion(...)`
- roster matching rules

Questions to answer:

1. Did the parser successfully extract the block?
2. Did it parse `recommended` as true?
3. Did `target_role` fail to match because of naming mismatch?
4. Did `Backend Engineer` fail against roster member `Backend Developer`?
5. Was the suggestion dropped as invalid/self/non-roster?

---

### Step 4, only after backend confirmation
If backend is proven to emit a valid `handoffSuggestion`, then inspect frontend runtime consumption.

Check:

- whether `ChatInterface.tsx` receives the `ai-request-end` payload
- whether `payload.handoffSuggestion` is present in the event
- whether `recommended` is true
- whether `handleHandoffSuggestion(...)` runs
- whether `showForwardModal` becomes true

Based on current code reading, frontend is not the first suspect.

---

## Best current repair directions

### Fix direction 1
Improve target-role resolution so the resolver can tolerate role-name variants.

Example:

- model says `Backend Engineer`
- real roster says `Backend Developer`

The resolver should ideally map through:

- role label
- archetype identity
- normalized aliases
- other roster-safe matching logic

This looks like the most practical repo-local fix if the structured block already exists.

---

### Fix direction 2
Strengthen the structured handoff prompt contract.

If the assistant is currently allowed to recommend handoff in prose without adding the machine block, then the product will keep failing silently.

The contract should make it explicit:

- if recommending handoff, append a valid HANDOFF block
- otherwise do not mention a handoff recommendation as if it were actionable

---

### Fix direction 3
Add clearer logging around handoff extraction and resolution.

Useful logs would include:

- whether a HANDOFF block was detected
- parsed `recommended`
- parsed `target_role`
- roster resolution result
- whether `handoffSuggestion` was emitted or dropped

That would make this class of bug much cheaper to debug.

---

## Why this matters to the active product work
This issue is directly on the main workflow path of the current multi-role task-room product direction.

The intended behavior is:

1. a role completes its current stage
2. AI may recommend the next teammate
3. the user sees a confirmation UI
4. the user chooses whether and where to hand off

Right now step 3 is broken in the observed scenario.

That means the current product experience is only half-implemented:

- the AI can talk about handoff
- but the product cannot operationalize that recommendation

So this is not a cosmetic bug. It is a workflow break in the active multi-role collaboration feature.

---

## One-line brief for the next AI
Use the real runtime database at:

`/Users/immeta/Library/Application Support/com.microcompany.desktop/.mc/data.db`

First verify whether the latest failing assistant reply contains a valid `[HANDOFF]` block. If not, investigate prompt-contract enforcement. If yes, focus immediately on why `target_role` like `Backend Engineer` is not resolving to the real roster target such as `Backend Developer`.
