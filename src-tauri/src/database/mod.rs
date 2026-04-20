use rusqlite::Connection;
use std::path::Path;
use std::fs;

mod migration;
mod error;
pub mod pool;

pub use pool::get_pool;

pub fn optimize_database(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "cache_size", -64000)?;
    conn.pragma_update(None, "temp_store", "MEMORY")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "mmap_size", 268435456)?;
    conn.pragma_update(None, "foreign_keys", true)?;
    Ok(())
}

pub fn initialize_database(db_path: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(db_path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create database directory: {}", e))?;
    }

    let mut conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    optimize_database(&conn)
        .map_err(|e| format!("Failed to optimize database: {}", e))?;

    migration::run_migrations(&mut conn)?;

    // Run integrity check using pragma_query since it returns results
    let integrity: String = conn.pragma_query_value(None, "integrity_check", |row| row.get(0))
        .map_err(|e| format!("Database integrity check failed: {}", e))?;

    if integrity != "ok" {
        return Err(format!("Database integrity check failed: {}", integrity));
    }

    // Initialize connection pool
    pool::init_pool(db_path)?;

    println!("Database initialized successfully at {}", db_path);
    Ok(())
}
