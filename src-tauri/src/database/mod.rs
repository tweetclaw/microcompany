use rusqlite::Connection;
use std::path::Path;
use std::fs;

mod migration;

pub fn optimize_database(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute("PRAGMA journal_mode=WAL", [])?;
    conn.execute("PRAGMA cache_size=-64000", [])?;
    conn.execute("PRAGMA temp_store=MEMORY", [])?;
    conn.execute("PRAGMA synchronous=NORMAL", [])?;
    conn.execute("PRAGMA mmap_size=268435456", [])?;
    conn.execute("PRAGMA foreign_keys=ON", [])?;
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

    conn.execute("PRAGMA integrity_check", [])
        .map_err(|e| format!("Database integrity check failed: {}", e))?;

    println!("Database initialized successfully at {}", db_path);
    Ok(())
}
