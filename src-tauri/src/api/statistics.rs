use serde::Serialize;

#[derive(Serialize)]
pub struct Statistics {
    pub total_tasks: i32,
    pub total_sessions: i32,
    pub total_messages: i32,
    pub normal_sessions: i32,
    pub task_sessions: i32,
    pub messages_by_day: Vec<DailyMessageCount>,
    pub top_sessions: Vec<TopSession>,
}

#[derive(Serialize)]
pub struct DailyMessageCount {
    pub date: String,
    pub count: i32,
}

#[derive(Serialize)]
pub struct TopSession {
    pub session_id: String,
    pub session_name: String,
    pub session_type: String,
    pub message_count: i32,
}

#[derive(Serialize)]
pub struct TaskStatistics {
    pub task_id: String,
    pub task_name: String,
    pub total_messages: i32,
    pub messages_by_role: Vec<RoleMessageCount>,
    pub messages_by_day: Vec<DailyMessageCount>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct RoleMessageCount {
    pub role_id: String,
    pub role_name: String,
    pub message_count: i32,
}
