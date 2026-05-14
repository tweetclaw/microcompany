// Template type definitions for Team Templates MVP
// These correspond to backend Rust types that bob needs to implement

/**
 * A role configuration within a template definition
 * Similar to RoleConfig but doesn't include display_order (template-level)
 */
export interface TemplateRole {
  name: string;
  identity: string;
  archetype_id?: string | null;
  system_prompt_append?: string | null;
  custom_system_prompt?: string | null;
  model: string;
  provider: string;
  handoff_enabled: boolean;
}

/**
 * System template: pre-defined, read-only templates shipped with the app
 */
export interface SystemTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Category for grouping (e.g., "development", "writing", "analysis") */
  category: string;
  /** Whether this template uses PM-first workflow */
  pm_first_workflow: boolean;
  /** Pre-configured roles in the template */
  roles: TemplateRole[];
  /** Tags for filtering */
  tags: string[];
  /** Path to the template definition file (for reloading/editing) */
  source_path: string;
}

/**
 * User template: a template saved by the user from an existing task
 */
export interface UserTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  pm_first_workflow: boolean;
  roles: TemplateRole[];
  /** ID of the source task, if any */
  source_task_id?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Summary view of a template for list displays
 */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  category?: string;
  /** 'system' | 'user' */
  source: 'system' | 'user';
  role_count: number;
  tags: string[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Request to save a task as a user template
 */
export interface SaveTemplateRequest {
  name: string;
  description: string;
  icon: string;
  source_task_id: string;
}

/**
 * Request to create a task from a template
 */
export interface CreateFromTemplateRequest {
  template_id: string;
  template_source: 'system' | 'user';
  task_name: string;
  /** Optional overrides for role configs (provider changes) */
  role_overrides?: Record<string, { provider?: string; model?: string }>;
}

/**
 * Result of resolving a template into a task draft.
 * Includes validation warnings (e.g., missing provider/model).
 */
export interface TemplateDraft {
  task_name: string;
  description: string;
  icon: string;
  pm_first_workflow: boolean;
  roles: TemplateRole[];
  /** Validation warnings that may block creation */
  warnings: TemplateWarning[];
}

/**
 * Warning generated when a template has issues that need resolution
 */
export interface TemplateWarning {
  type: 'missing_provider' | 'missing_model' | 'invalid_role' | 'info';
  role_index: number;
  role_name: string;
  message: string;
  /** If true, this warning blocks task creation */
  blocking: boolean;
}
