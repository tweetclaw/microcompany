import { invoke } from '@tauri-apps/api/core';
import { HandoffInfo } from '../types/api';

export async function extractHandoffSuggestion(
  roleName: string,
  lastMessage: string,
  availableRoles: string[]
): Promise<HandoffInfo> {
  return await invoke('extract_handoff_suggestion', {
    roleName,
    lastMessage,
    availableRoles,
  });
}
