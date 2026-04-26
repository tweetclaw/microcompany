// Message types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  requestId?: string;
}

export type AiStatusPhase = 'thinking' | 'tool_running' | 'generating' | 'finalizing';
export type AiRequestResult = 'success' | 'cancelled' | 'error';

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
  phase: AiStatusPhase;
  text: string;
  timestamp: number;
}

export interface AiRequestEndEvent {
  request_id: string;
  result: AiRequestResult;
  error_message?: string;
  final_text?: string;
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
  kind: 'request_start' | 'status' | 'tool_start' | 'tool_end' | 'request_end' | 'error';
  text: string;
  timestamp: number;
  phase?: AiStatusPhase;
  result?: AiRequestResult;
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
export type { Task, TaskRole, TaskSummary, TaskCreateRequest, RoleArchetype, RoleConfig, TaskUpdateRequest } from './api';

// Re-export settings types
export type { ProviderConfig } from './settings';
