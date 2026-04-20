use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::time::Duration;
use once_cell::sync::OnceCell;

static DB_POOL: OnceCell<Pool<SqliteConnectionManager>> = OnceCell::new();

pub fn get_pool() -> Result<&'static Pool<SqliteConnectionManager>, String> {
    DB_POOL.get().ok_or_else(|| "Database pool not initialized".to_string())
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

    DB_POOL.set(pool)
        .map_err(|_| "Database pool already initialized".to_string())?;

    Ok(())
}
