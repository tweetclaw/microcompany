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

export async function addTaskRole(
  taskId: string,
  roleName: string,
  identity: string,
  archetypeId: string | null,
  provider: string,
  displayOrder?: number,
  handoffEnabled?: boolean,
  systemPromptAppend?: string | null,
  customSystemPrompt?: string | null,
): Promise<Task> {
  try {
    const result = await invoke<Task>('add_task_role', {
      taskId,
      roleName,
      identity,
      archetypeId,
      provider,
      displayOrder: displayOrder ?? null,
      handoffEnabled: handoffEnabled ?? true,
      systemPromptAppend: systemPromptAppend ?? null,
      customSystemPrompt: customSystemPrompt ?? null,
    });
    return result;
  } catch (error) {
    console.error(`[api/index.ts] addTaskRole: Failed to add role:`, error);
    throw error;
  }
}

export async function updateTaskRole(
  taskId: string,
  roleId: string,
  updates: {
    name?: string;
    identity?: string;
    archetypeId?: string | null;
    provider?: string;
    model?: string;
    displayOrder?: number;
  }
): Promise<Task> {
  console.log(`[api/index.ts] updateTaskRole: Updating role ${roleId} in task ${taskId}`);
  console.log(`[api/index.ts] updateTaskRole: Updates:`, updates);
  
  try {
    const result = await invoke<Task>('update_task_role', {
      taskId,
      roleId,
      name: updates.name ?? null,
      identity: updates.identity ?? null,
      archetypeId: updates.archetypeId ?? null,
      provider: updates.provider ?? null,
      model: updates.model ?? null,
      displayOrder: updates.displayOrder ?? null,
    });
    console.log(`[api/index.ts] updateTaskRole: Role updated successfully`);
    return result;
  } catch (error) {
    console.error(`[api/index.ts] updateTaskRole: Failed to update role:`, error);
    throw error;
  }
}

export async function deleteTaskRole(
  taskId: string,
  roleId: string
): Promise<Task> {
  console.log(`[api/index.ts] deleteTaskRole: Deleting role ${roleId} from task ${taskId}`);
  
  try {
    const result = await invoke<Task>('delete_task_role', {
      taskId,
      roleId,
    });
    console.log(`[api/index.ts] deleteTaskRole: Role deleted successfully`);
    return result;
  } catch (error) {
    console.error(`[api/index.ts] deleteTaskRole: Failed to delete role:`, error);
    throw error;
  }
}

export async function reorderTaskRoles(
  taskId: string,
  roleOrders: Array<{ roleId: string; displayOrder: number }>
): Promise<Task> {
  console.log(`[api/index.ts] reorderTaskRoles: Reordering ${roleOrders.length} roles in task ${taskId}`);
  console.log(`[api/index.ts] reorderTaskRoles: New order:`, roleOrders);
  
  try {
    const result = await invoke<Task>('reorder_task_roles', {
      taskId,
      roleOrders,
    });
    console.log(`[api/index.ts] reorderTaskRoles: Roles reordered successfully`);
    return result;
  } catch (error) {
    console.error(`[api/index.ts] reorderTaskRoles: Failed to reorder roles:`, error);
    throw error;
  }
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

export async function listNormalSessions(workingDirectory?: string): Promise<SessionSummary[]> {
  return invoke('list_normal_sessions', { workingDirectory: workingDirectory || null });
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
