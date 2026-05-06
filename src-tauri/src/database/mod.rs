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
    println!("[database::initialize_database] Begin initialization for db_path={}", db_path);

    if let Some(parent) = Path::new(db_path).parent() {
        println!("[database::initialize_database] Ensuring parent directory exists: {:?}", parent);
        fs::create_dir_all(parent)
            .map_err(|e| {
                let err = format!("Failed to create database directory: {}", e);
                println!("[database::initialize_database] ERROR: {}", err);
                err
            })?;
    }

    println!("[database::initialize_database] Opening sqlite connection...");
    let mut conn = Connection::open(db_path)
        .map_err(|e| {
            let err = format!("Failed to open database: {}", e);
            println!("[database::initialize_database] ERROR: {}", err);
            err
        })?;

    println!("[database::initialize_database] Applying pragmas...");
    optimize_database(&conn)
        .map_err(|e| {
            let err = format!("Failed to optimize database: {}", e);
            println!("[database::initialize_database] ERROR: {}", err);
            err
        })?;

    println!("[database::initialize_database] Running migrations...");
    migration::run_migrations(&mut conn)?;
    println!("[database::initialize_database] Migrations completed");

    // Run integrity check using pragma_query since it returns results
    println!("[database::initialize_database] Running integrity check...");
    let integrity: String = conn.pragma_query_value(None, "integrity_check", |row| row.get(0))
        .map_err(|e| {
            let err = format!("Database integrity check failed: {}", e);
            println!("[database::initialize_database] ERROR: {}", err);
            err
        })?;

    println!("[database::initialize_database] Integrity check result: {}", integrity);
    if integrity != "ok" {
        let err = format!("Database integrity check failed: {}", integrity);
        println!("[database::initialize_database] ERROR: {}", err);
        return Err(err);
    }

    // Initialize connection pool
    println!("[database::initialize_database] Initializing pool...");
    pool::init_pool(db_path)?;

    println!("[database::initialize_database] Database initialized successfully at {}", db_path);
    Ok(())
}
