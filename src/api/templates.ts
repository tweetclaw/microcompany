// Template API layer — frontend API contract for backend
// Currently using mock data. Will switch to invoke() when bob implements the backend.

import { invoke } from '@tauri-apps/api/core';
import type {
  SystemTemplate,
  UserTemplate,
  TemplateSummary,
  SaveTemplateRequest,
  CreateFromTemplateRequest,
  TemplateDraft,
} from '../types/template';

// ─── Mock Data ───────────────────────────────────────────────
// Temporary mock data so we can build and test the UI before
// bob delivers the backend APIs.

const MOCK_SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    id: 'sys-tpl-dev-team',
    name: 'Development Team',
    description: 'A full-stack development team with PM, backend, frontend, and QA roles. Best for software projects.',
    icon: 'code',
    category: 'development',
    pm_first_workflow: true,
    tags: ['development', 'full-stack', 'team'],
    source_path: 'src-tauri/resources/templates/dev-team.md',
    roles: [
      {
        name: 'Alice',
        identity: 'Product Manager',
        archetype_id: 'product_manager',
        model: 'claude-sonnet-4-20250514',
        provider: 'openrouter',
        handoff_enabled: true,
      },
      {
        name: 'Bob',
        identity: 'Backend Developer',
        archetype_id: 'backend_developer',
        model: 'claude-sonnet-4-20250514',
        provider: 'openrouter',
        handoff_enabled: true,
      },
      {
        name: 'Clark',
        identity: 'Frontend Developer',
        archetype_id: 'frontend_developer',
        model: 'claude-sonnet-4-20250514',
        provider: 'openrouter',
        handoff_enabled: true,
      },
      {
        name: 'David',
        identity: 'QA Engineer',
        archetype_id: 'qa_engineer',
        model: 'claude-sonnet-4-20250514',
        provider: 'openrouter',
        handoff_enabled: true,
      },
    ],
  },
  {
    id: 'sys-tpl-writing',
    name: 'Writing Team',
    description: 'A writing and editing team with researcher, writer, and editor roles.',
    icon: 'edit',
    category: 'writing',
    pm_first_workflow: false,
    tags: ['writing', 'content', 'editing'],
    source_path: 'src-tauri/resources/templates/writing-team.md',
    roles: [
      {
        name: 'Researcher',
        identity: 'Researcher',
        model: 'claude-sonnet-4-20250514',
        provider: 'openrouter',
        handoff_enabled: true,
      },
      {
        name: 'Writer',
        identity: 'Writer',
        model: 'claude-sonnet-4-20250514',
        provider: 'openrouter',
        handoff_enabled: true,
      },
      {
        name: 'Editor',
        identity: 'Editor',
        model: 'claude-sonnet-4-20250514',
        provider: 'openrouter',
        handoff_enabled: true,
      },
    ],
  },
  {
    id: 'sys-tpl-analysis',
    name: 'Data Analysis Team',
    description: 'A data analysis team with analyst and visualization specialist roles.',
    icon: 'chart',
    category: 'analysis',
    pm_first_workflow: true,
    tags: ['analysis', 'data', 'visualization'],
    source_path: 'src-tauri/resources/templates/analysis-team.md',
    roles: [
      {
        name: 'PM',
        identity: 'Product Manager',
        archetype_id: 'product_manager',
        model: 'claude-sonnet-4-20250514',
        provider: 'openrouter',
        handoff_enabled: true,
      },
      {
        name: 'Analyst',
        identity: 'Data Analyst',
        model: 'claude-sonnet-4-20250514',
        provider: 'openrouter',
        handoff_enabled: true,
      },
    ],
  },
];

let mockUserTemplates: UserTemplate[] = [];

// ─── API Functions (with mock implementations) ───────────────

/**
 * List all available system templates
 */
export async function listSystemTemplates(): Promise<SystemTemplate[]> {
  // TODO: switch to invoke('list_system_templates') when bob implements it
  // return invoke('list_system_templates');
  return Promise.resolve(MOCK_SYSTEM_TEMPLATES);
}

/**
 * Get a single system template by ID
 */
export async function getSystemTemplate(templateId: string): Promise<SystemTemplate | null> {
  // TODO: invoke('get_system_template', { templateId })
  const found = MOCK_SYSTEM_TEMPLATES.find((t) => t.id === templateId);
  return Promise.resolve(found ?? null);
}

/**
 * List all user-saved templates
 */
export async function listUserTemplates(): Promise<UserTemplate[]> {
  // TODO: invoke('list_user_templates')
  return Promise.resolve(mockUserTemplates);
}

/**
 * Save a task as a user template
 */
export async function saveTaskAsTemplate(request: SaveTemplateRequest): Promise<UserTemplate> {
  // TODO: invoke('save_task_as_template', { request })
  const template: UserTemplate = {
    id: `user-tpl-${Date.now()}`,
    name: request.name,
    description: request.description,
    icon: request.icon,
    pm_first_workflow: true,
    roles: [],
    source_task_id: request.source_task_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  mockUserTemplates.push(template);
  return Promise.resolve(template);
}

/**
 * Delete a user template
 */
export async function deleteUserTemplate(templateId: string): Promise<void> {
  // TODO: invoke('delete_user_template', { templateId })
  mockUserTemplates = mockUserTemplates.filter((t) => t.id !== templateId);
  return Promise.resolve();
}

/**
 * Resolve a template into a draft (with validation warnings).
 * This is the core "preview before create" step.
 */
export async function resolveTemplateDraft(
  request: CreateFromTemplateRequest
): Promise<TemplateDraft> {
  // TODO: invoke('resolve_template_draft', { request })

  // Find template
  const sysTpl = MOCK_SYSTEM_TEMPLATES.find((t) => t.id === request.template_id);
  const userTpl = mockUserTemplates.find((t) => t.id === request.template_id);
  const template = sysTpl ?? userTpl;

  if (!template) {
    throw new Error(`Template not found: ${request.template_id}`);
  }

  // Apply role overrides
  const roles = template.roles.map((role, index) => {
    const override = request.role_overrides?.[String(index)];
    return {
      ...role,
      provider: override?.provider ?? role.provider,
      model: override?.model ?? role.model,
    };
  });

  // Generate warnings
  const warnings = roles.map((role, index) => {
    if (!role.provider || role.provider.trim() === '') {
      return {
        type: 'missing_provider' as const,
        role_index: index,
        role_name: role.name,
        message: `Role "${role.name}" is missing a provider. Please select one before creating the task.`,
        blocking: true,
      };
    }
    if (!role.model || role.model.trim() === '') {
      return {
        type: 'missing_model' as const,
        role_index: index,
        role_name: role.name,
        message: `Role "${role.name}" is missing a model. Please select one before creating the task.`,
        blocking: true,
      };
    }
    return null;
  }).filter((w): w is NonNullable<typeof w> => w !== null);

  return {
    task_name: request.task_name || template.name,
    description: template.description,
    icon: template.icon,
    pm_first_workflow: template.pm_first_workflow,
    roles,
    warnings,
  };
}

/**
 * List all templates (system + user) as summaries for the picker
 */
export async function listAllTemplateSummaries(): Promise<TemplateSummary[]> {
  // TODO: invoke('list_all_template_summaries')
  const systemSummaries: TemplateSummary[] = MOCK_SYSTEM_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    category: t.category,
    source: 'system' as const,
    role_count: t.roles.length,
    tags: t.tags,
  }));

  const userSummaries: TemplateSummary[] = mockUserTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    source: 'user' as const,
    role_count: t.roles.length,
    tags: [],
    created_at: t.created_at,
    updated_at: t.updated_at,
  }));

  return [...systemSummaries, ...userSummaries];
}
