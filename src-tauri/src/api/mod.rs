pub mod task;
mod task_impl;
mod task_queries;

pub mod template;
mod template_impl;

pub mod message;
mod message_impl;

pub mod session;
mod session_impl;

pub mod search;
mod search_impl;

pub mod statistics;
mod statistics_impl;

pub mod backup;
mod backup_impl;

pub use task::{
    DeleteTaskResult,
    RoleConfig,
    RoleOrderItem,
    Task,
    TaskCreateRequest,
    TaskRole,
    TaskSummary,
    TaskUpdateRequest,
    TeamBrief,
    TeamBriefRole,
};
pub use task_impl::{
    add_task_role,
    create_task,
    delete_task_role,
    reorder_task_roles,
    restart_task_role_session,
    update_task_role,
};
pub use task_queries::{delete_task, get_task, get_team_brief, list_tasks, update_task};

pub use template::{
    CreateFromTemplateRequest,
    SaveTemplateRequest,
    SystemTemplate,
    TemplateDraft,
    TemplateSummary,
    UpdateTemplateRequest,
    UserTemplate,
};
pub use template_impl::{
    get_system_template,
    list_all_template_summaries,
    list_system_templates,
    list_user_templates,
    resolve_template_draft,
    save_task_as_template,
    update_template,
};

pub use message::{Message, MessageCreateRequest};
pub use message_impl::{get_messages, save_message, update_message_content};

pub use session::{Session, SessionSummary, DeleteSessionResult};
pub use session_impl::{create_normal_session, get_session, list_normal_sessions, delete_session};

pub use search::MessageSearchResult;
pub use search_impl::search_messages;

pub use statistics::{Statistics, TaskStatistics};
pub use statistics_impl::{get_statistics, get_task_statistics};

pub use backup::{BackupInfo, VacuumResult};
pub use backup_impl::{create_backup, list_backups, restore_backup, vacuum_database};
