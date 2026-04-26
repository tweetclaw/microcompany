// Backend API types matching Rust implementation

// Task Management

/**
 * Request payload for creating a new task with multiple roles
 */
export interface TaskCreateRequest {
  name: string;
  description: string;
  icon: string;
  roles: RoleConfig[];
}

export interface RoleArchetype {
  id: string;
  label: string;
  summary: string;
  description: string;
  responsibilities: string[];
  boundaries: string[];
  deliverables: string[];
  handoffGuidance: string;
  recommendedNextArchetypes: string[];
  promptFragments: {
    roleSystem: string;
    teamGuidance: string;
    taskGuidance: string;
  };
  source: {
    repository: string;
    path: string;
  };
}

export interface RoleConfig {
  name: string;
  identity: string;
  archetype_id?: string | null;
  system_prompt_override?: string | null;
  model: string;
  provider: string;
  handoff_enabled: boolean;
  display_order: number;
}

export interface TaskUpdateRequest {
  name?: string;
  description?: string;
  icon?: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  icon: string;
  roles: TaskRole[];
  created_at: string;
  updated_at: string;
}

export interface TaskRole {
  id: string;
  name: string;
  identity: string;
  archetype_id: string | null;
  system_prompt_snapshot: string | null;
  model: string;
  provider: string;
  handoff_enabled: boolean;
  display_order: number;
  session_id: string;
  created_at: string;
}

export interface TaskSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  role_count: number;
  total_messages: number;
  created_at: string;
  updated_at: string;
}

export interface DeleteTaskResult {
  deleted_task_id: string;
  deleted_role_count: number;
  deleted_session_count: number;
  deleted_message_count: number;
}

// Session Management

/**
 * Complete session information including status and relationships
 */
export interface Session {
  id: string;
  type: 'normal' | 'task';
  name: string;
  model: string;
  provider: string;
  status: 'initializing' | 'ready' | 'error' | 'deleted';
  error_message: string | null;
  task_id: string | null;
  role_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionSummary {
  id: string;
  type: 'normal' | 'task';
  name: string;
  model: string;
  provider: string;
  status: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface DeleteSessionResult {
  deleted_session_id: string;
  deleted_message_count: number;
}

// Message Management
export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  request_id: string | null;
  is_streaming: boolean;
}

export interface MessageCreateRequest {
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  request_id?: string;
  is_streaming: boolean;
}

// Search

/**
 * Full-text search result with message content, context, and relevance ranking
 */
export interface MessageSearchResult {
  message: Message;
  session_name: string;
  session_type: 'normal' | 'task';
  task_name: string | null;
  role_name: string | null;
  snippet: string;
  rank: number;
}

// Statistics

/**
 * Global database statistics including counts, trends, and top sessions
 */
export interface Statistics {
  total_tasks: number;
  total_sessions: number;
  total_messages: number;
  normal_sessions: number;
  task_sessions: number;
  messages_by_day: DailyMessageCount[];
  top_sessions: TopSession[];
}

export interface DailyMessageCount {
  date: string;
  count: number;
}

export interface TopSession {
  session_id: string;
  session_name: string;
  session_type: string;
  message_count: number;
}

/**
 * Task-specific statistics with role breakdown and daily trends
 */
export interface TaskStatistics {
  task_id: string;
  task_name: string;
  total_messages: number;
  messages_by_role: RoleMessageCount[];
  messages_by_day: DailyMessageCount[];
  created_at: string;
}

export interface RoleMessageCount {
  role_id: string;
  role_name: string;
  message_count: number;
}

// Backup

/**
 * Backup file metadata including path, size, and creation timestamp
 */
export interface BackupInfo {
  backup_path: string;
  backup_size: number;
  created_at: string;
}

export interface VacuumResult {
  size_before: number;
  size_after: number;
  space_reclaimed: number;
}
