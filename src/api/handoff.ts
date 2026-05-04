import { invoke } from '@tauri-apps/api/tauri';
import { HandoffInfo } from '../types/api';

export async function extractHandoffSuggestion(
  roleName: string,
  lastMessage: string
): Promise<HandoffInfo> {
  return await invoke('extract_handoff_suggestion', {
    roleName,
    lastMessage,
  });
}
