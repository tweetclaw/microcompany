use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::time::Duration;
use std::sync::Mutex;
use once_cell::sync::Lazy;

static DB_POOL: Lazy<Mutex<Option<Pool<SqliteConnectionManager>>>> = Lazy::new(|| Mutex::new(None));

pub fn get_pool() -> Result<Pool<SqliteConnectionManager>, String> {
    DB_POOL.lock()
        .map_err(|e| format!("Failed to lock pool: {}", e))?
        .clone()
        .ok_or_else(|| "Database pool not initialized".to_string())
}

pub fn init_pool(db_path: &str) -> Result<(), String> {
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|conn| {
            super::optimize_database(conn)
        });

    let pool = Pool::builder()
        .max_size(10)
        .min_idle(Some(2))
        .connection_timeout(Duration::from_secs(5))
        .build(manager)
        .map_err(|e| format!("Failed to create connection pool: {}", e))?;

    let mut pool_guard = DB_POOL.lock()
        .map_err(|e| format!("Failed to lock pool: {}", e))?;

    *pool_guard = Some(pool);

    Ok(())
}

pub fn close_pool() -> Result<(), String> {
    let mut pool_guard = DB_POOL.lock()
        .map_err(|e| format!("Failed to lock pool: {}", e))?;

    if let Some(pool) = pool_guard.take() {
        drop(pool);
    }

    Ok(())
}
