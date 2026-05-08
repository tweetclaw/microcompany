// Message types
import type { HandoffSuggestion, RoleArchetype, RoleConfig, Task, TaskCreateRequest, TaskRole, TaskSummary, TaskUpdateRequest, TeamBrief } from './api';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  requestId?: string;
  timeline?: TimelineItem[];
  toolCalls?: ToolCallRecord[]; // Legacy field for backward compatibility
}

export interface TimelineItem {
  id: string;
  type: 'thinking' | 'tool_call' | 'output';
  timestamp: number;
  content?: string; // For thinking and output
  tool?: string; // For tool_call
  action?: string; // For tool_call
  status?: 'running' | 'success' | 'error'; // For tool_call
  result?: string; // For tool_call
}

// Legacy structure - kept for backward compatibility during migration
export interface ToolCallRecord {
  id: string;
  tool: string;
  action: string;
  status: 'running' | 'success' | 'error';
  result?: string;
  timestamp: number;
}

export type AiActivityPhase = 'thinking' | 'tool_running' | 'streaming' | 'finalizing';
export type AiTerminalOutcome = 'completed' | 'completed_tool_only' | 'handoff_ready' | 'cancelled' | 'error' | 'max_tokens' | 'budget_exceeded';
export type AiTerminalReasonCode = 'user_cancelled' | 'provider_error' | 'tool_only_end_turn' | 'handoff_detected' | 'context_limit' | 'budget_limit' | 'unknown';
export type AiRequestResult = 'success' | 'cancelled' | 'error';

export interface AiUsageInfo {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  total_tokens?: number;
  estimated_cost_usd?: number;
}

export interface AiWarningInfo {
  warning_type: string;
  message: string;
}

export type AiRunState =
  | 'idle'
  | 'running_thinking'
  | 'running_tool'
  | 'running_generating'
  | 'finalizing'
  | 'cancelled'
  | 'error'
  | 'completed';

export interface AiRequestStartEvent {
  request_id: string;
  session_id: string;
  timestamp: number;
}

export interface AiStatusEvent {
  request_id: string;
  phase: AiActivityPhase;
  text: string;
  timestamp: number;
}

export interface AiRequestLifecycleEvent {
  request_id: string;
  session_id: string;
  phase: AiActivityPhase;
  label?: string;
  source: string;
  timestamp: number;
}

export interface AiRequestUsageEvent {
  request_id: string;
  session_id: string;
  scope: 'current_turn' | 'cumulative';
  usage: AiUsageInfo;
  timestamp: number;
}

export interface AiTokenWarningEvent {
  request_id: string;
  session_id: string;
  warning_type: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

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

export interface AiMessageChunkEvent {
  request_id: string;
  chunk: string;
}

export interface AiToolStartEvent {
  request_id: string;
  tool: string;
  action: string;
}

export interface AiToolEndEvent {
  request_id: string;
  tool: string;
  success: boolean;
  result: string;
}

export interface ProcessTimelineItem {
  id: string;
  requestId: string;
  kind: 'request_start' | 'status' | 'tool_start' | 'tool_end' | 'request_end' | 'error' | 'lifecycle' | 'warning';
  text: string;
  timestamp: number;
  phase?: AiActivityPhase;
  result?: AiRequestResult;
  outcome?: AiTerminalOutcome;
  tool?: string;
  success?: boolean;
}

// Session configuration
export interface SessionConfig {
  workingDirectory: string;
}

// Chat state
export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

// Tool call types
export interface ToolCall {
  tool: string;
  action: string;
  status: 'running' | 'success' | 'error';
  result?: string;
}

// App state
export interface AppState {
  isSessionInitialized: boolean;
  workingDirectory: string | null;
  messages: Message[];
  isLoading: boolean;
  inputValue: string;
  error: string | null;
}

// Re-export Task types from API (unified type system)
export type { Task, TaskRole, TaskSummary, TaskCreateRequest, RoleArchetype, RoleConfig, TaskUpdateRequest, HandoffSuggestion, TeamBrief } from './api';

// Re-export settings types
export type { ProviderConfig } from './settings';
