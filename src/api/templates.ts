// Template API layer — frontend API contract for backend
// Backed by Tauri + SQLite.

import { invoke } from '@tauri-apps/api/core';
import type {
  SystemTemplate,
  UserTemplate,
  TemplateSummary,
  SaveTemplateRequest,
  CreateFromTemplateRequest,
  TemplateDraft,
  TemplateRole,
} from '../types/template';

function normalizeRole(role: Partial<TemplateRole> & { name: string; identity: string }): TemplateRole {
  return {
    name: role.name,
    identity: role.identity,
    archetype_id: role.archetype_id ?? null,
    system_prompt_append: role.system_prompt_append ?? null,
    custom_system_prompt: role.custom_system_prompt ?? null,
    model: role.model ?? '',
    provider: role.provider ?? '',
    handoff_enabled: role.handoff_enabled ?? true,
  };
}

export async function listSystemTemplates(): Promise<SystemTemplate[]> {
  console.log('[templates.ts] listSystemTemplates: Fetching system templates from DB');
  const templates = await invoke<SystemTemplate[]>('list_system_templates');
  console.log(`[templates.ts] listSystemTemplates: Loaded ${templates.length} system templates`);
  return templates.map((template) => ({
    ...template,
    roles: template.roles.map(normalizeRole),
    tags: template.tags ?? [],
  }));
}

export async function getSystemTemplate(templateId: string): Promise<SystemTemplate | null> {
  console.log(`[templates.ts] getSystemTemplate: Fetching template with ID: ${templateId}`);
  const template = await invoke<SystemTemplate | null>('get_system_template', { templateId });
  if (!template) {
    console.warn(`[templates.ts] getSystemTemplate: Template not found: ${templateId}`);
    return null;
  }

  console.log(`[templates.ts] getSystemTemplate: Loaded template "${template.name}" with ${template.roles.length} roles`);
  return {
    ...template,
    roles: template.roles.map(normalizeRole),
    tags: template.tags ?? [],
  };
}

export async function listUserTemplates(): Promise<UserTemplate[]> {
  console.log('[templates.ts] listUserTemplates: Fetching user templates from DB');
  const templates = await invoke<UserTemplate[]>('list_user_templates');
  console.log(`[templates.ts] listUserTemplates: Loaded ${templates.length} user templates`);
  return templates.map((template) => ({
    ...template,
    roles: template.roles.map(normalizeRole),
  }));
}

export async function saveTaskAsTemplate(request: SaveTemplateRequest): Promise<UserTemplate> {
  console.log(`[templates.ts] saveTaskAsTemplate: Saving task "${request.source_task_id}" as template "${request.name}"`);
  const template = await invoke<UserTemplate>('save_task_as_template', { request });
  console.log(`[templates.ts] saveTaskAsTemplate: Saved template with ID: ${template.id}`);
  return {
    ...template,
    roles: template.roles.map(normalizeRole),
  };
}

export async function updateUserTemplate(
  templateId: string,
  updates: {
    name?: string;
    description?: string;
    icon?: string;
    roles?: Array<{
      name: string;
      identity: string;
      archetype_id?: string | null;
      system_prompt_append?: string | null;
      custom_system_prompt?: string | null;
      provider?: string;
      model?: string;
      handoff_enabled?: boolean;
    }>;
  }
): Promise<UserTemplate> {
  console.log(`[templates.ts] updateUserTemplate: Updating template "${templateId}" in DB`);
  console.log('[templates.ts] updateUserTemplate: Updates payload:', updates);

  const payload = {
    ...updates,
    roles: updates.roles?.map((role) => normalizeRole(role)),
  };

  const updated = await invoke<UserTemplate>('update_template', {
    templateId,
    updates: payload,
  });

  console.log(`[templates.ts] updateUserTemplate: Template updated successfully: ${updated.id}`);
  return {
    ...updated,
    roles: updated.roles.map(normalizeRole),
  };
}

export async function deleteUserTemplate(templateId: string): Promise<void> {
  console.warn(`[templates.ts] deleteUserTemplate: Not implemented yet for template ${templateId}`);
  throw new Error('deleteUserTemplate is not implemented yet');
}

export async function resolveTemplateDraft(
  request: CreateFromTemplateRequest
): Promise<TemplateDraft> {
  console.log(`[templates.ts] resolveTemplateDraft: Resolving template "${request.template_id}"`);
  const draft = await invoke<TemplateDraft>('resolve_template_draft', { request });
  console.log(`[templates.ts] resolveTemplateDraft: Resolved draft with ${draft.roles.length} roles and ${draft.warnings.length} warnings`);
  return {
    ...draft,
    roles: draft.roles.map(normalizeRole),
  };
}

export function isTemplateComplete(template: SystemTemplate | UserTemplate): boolean {
  return template.roles.every((role) => role.provider && role.provider.trim() !== '');
}

export async function listAllTemplateSummaries(): Promise<TemplateSummary[]> {
  console.log('[templates.ts] listAllTemplateSummaries: Fetching all template summaries from DB');
  const summaries = await invoke<TemplateSummary[]>('list_all_template_summaries');
  console.log(`[templates.ts] listAllTemplateSummaries: Loaded ${summaries.length} summaries`);
  return summaries.map((summary) => ({
    ...summary,
    tags: summary.tags ?? [],
  }));
}
