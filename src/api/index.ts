import { invoke } from '@tauri-apps/api/core';
import type {
  Task,
  TaskCreateRequest,
  TaskUpdateRequest,
  TaskSummary,
  DeleteTaskResult,
  TeamBrief,
  RoleArchetype,
  Session,
  SessionSummary,
  DeleteSessionResult,
  Message,
  MessageCreateRequest,
  MessageSearchResult,
  Statistics,
  TaskStatistics,
  BackupInfo,
  VacuumResult,
} from '../types/api';

// Task Management APIs
export async function createTask(task: TaskCreateRequest): Promise<Task> {
  return invoke('create_task', { task });
}

export async function getTask(taskId: string): Promise<Task> {
  return invoke('get_task', { taskId });
}

export async function restartTaskRoleSession(taskId: string, roleId: string): Promise<Task> {
  return invoke('restart_task_role_session', { taskId, roleId });
}

export async function getTeamBrief(taskId: string): Promise<TeamBrief> {
  return invoke('get_team_brief', { taskId });
}

export async function listTasks(): Promise<TaskSummary[]> {
  return invoke('list_tasks');
}

export async function updateTask(taskId: string, updates: TaskUpdateRequest): Promise<Task> {
  return invoke('update_task', { taskId, updates });
}

export async function deleteTask(taskId: string): Promise<DeleteTaskResult> {
  return invoke('delete_task', { taskId });
}

export async function listRoleArchetypes(): Promise<RoleArchetype[]> {
  return invoke('list_role_archetypes');
}

// Session Management APIs
export async function createNormalSession(
  name: string,
  model: string,
  provider: string,
  workingDirectory: string
): Promise<string> {
  return invoke('create_normal_session', { name, model, provider, workingDirectory });
}

export async function getSession(sessionId: string): Promise<Session> {
  return invoke('get_session', { sessionId });
}

export async function listNormalSessions(): Promise<SessionSummary[]> {
  return invoke('list_normal_sessions');
}

export async function deleteSession(sessionId: string): Promise<DeleteSessionResult> {
  return invoke('delete_session_api', { sessionId });
}

// Message Management APIs
export async function getMessages(
  sessionId: string,
  limit?: number,
  offset?: number
): Promise<Message[]> {
  return invoke('get_messages', { sessionId, limit, offset });
}

export async function saveMessage(message: MessageCreateRequest): Promise<string> {
  return invoke('save_message', { message });
}

export async function updateMessageContent(
  messageId: string,
  content: string,
  isStreaming: boolean
): Promise<void> {
  return invoke('update_message_content', { messageId, content, isStreaming });
}

// Search API
export async function searchMessages(
  query: string,
  limit?: number
): Promise<MessageSearchResult[]> {
  return invoke('search_messages', { query, limit });
}

// Statistics APIs
export async function getStatistics(): Promise<Statistics> {
  return invoke('get_statistics');
}

export async function getTaskStatistics(taskId: string): Promise<TaskStatistics> {
  return invoke('get_task_statistics', { taskId });
}

// Backup APIs
export async function createBackup(): Promise<BackupInfo> {
  return invoke('create_backup');
}

export async function listBackups(): Promise<BackupInfo[]> {
  return invoke('list_backups');
}

export async function restoreBackup(backupPath: string): Promise<void> {
  return invoke('restore_backup', { backupPath });
}

export async function vacuumDatabase(): Promise<VacuumResult> {
  return invoke('vacuum_database');
}

// Database initialization
export async function initializeDatabase(): Promise<void> {
  return invoke('initialize_database');
}
