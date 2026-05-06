use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::time::Duration;
use std::sync::Mutex;
use once_cell::sync::Lazy;

static DB_POOL: Lazy<Mutex<Option<Pool<SqliteConnectionManager>>>> = Lazy::new(|| Mutex::new(None));

pub fn get_pool() -> Result<Pool<SqliteConnectionManager>, String> {
    println!("[database::pool::get_pool] Attempting to acquire DB pool...");

    let pool_guard = DB_POOL.lock()
        .map_err(|e| {
            let err = format!("Failed to lock pool: {}", e);
            println!("[database::pool::get_pool] ERROR: {}", err);
            err
        })?;

    let has_pool = pool_guard.is_some();
    println!("[database::pool::get_pool] Pool present: {}", has_pool);

    pool_guard
        .clone()
        .ok_or_else(|| {
            let err = "Database pool not initialized".to_string();
            println!("[database::pool::get_pool] ERROR: {}", err);
            err
        })
}

pub fn init_pool(db_path: &str) -> Result<(), String> {
    println!("[database::pool::init_pool] Initializing pool for db_path={}", db_path);
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|conn| {
            super::optimize_database(conn)
        });

    let pool = Pool::builder()
        .max_size(10)
        .min_idle(Some(2))
        .connection_timeout(Duration::from_secs(5))
        .build(manager)
        .map_err(|e| {
            let err = format!("Failed to create connection pool: {}", e);
            println!("[database::pool::init_pool] ERROR: {}", err);
            err
        })?;

    println!("[database::pool::init_pool] Pool built successfully");

    let mut pool_guard = DB_POOL.lock()
        .map_err(|e| {
            let err = format!("Failed to lock pool: {}", e);
            println!("[database::pool::init_pool] ERROR: {}", err);
            err
        })?;

    let had_existing_pool = pool_guard.is_some();
    println!("[database::pool::init_pool] Existing pool present before replace: {}", had_existing_pool);

    *pool_guard = Some(pool);

    println!("[database::pool::init_pool] Pool stored successfully");
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
