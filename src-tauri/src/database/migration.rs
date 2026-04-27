use rusqlite::{Connection, params};

pub struct Migration {
    pub version: i32,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial_schema",
        sql: include_str!("../../migrations/001_initial_schema.sql"),
    },
    Migration {
        version: 2,
        name: "role_archetype_and_prompt_fields",
        sql: include_str!("../../migrations/002_role_archetype_and_prompt_fields.sql"),
    },
    Migration {
        version: 3,
        name: "role_prompt_input_fields",
        sql: include_str!("../../migrations/003_role_prompt_input_fields.sql"),
    },
    Migration {
        version: 4,
        name: "task_prompt_provenance",
        sql: include_str!("../../migrations/004_task_prompt_provenance.sql"),
    },
    Migration {
        version: 5,
        name: "backfill_task_session_working_directory",
        sql: include_str!("../../migrations/005_backfill_task_session_working_directory.sql"),
    },
];

fn ensure_migrations_table(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    Ok(())
}

fn get_current_version(conn: &Connection) -> Result<i32, rusqlite::Error> {
    ensure_migrations_table(conn)?;

    let version: Result<i32, _> = conn.query_row(
        "SELECT MAX(version) FROM schema_migrations",
        [],
        |row| row.get(0),
    );

    Ok(version.unwrap_or(0))
}

pub fn run_migrations(conn: &mut Connection) -> Result<(), String> {
    let current_version = get_current_version(conn)
        .map_err(|e| format!("Failed to get current version: {}", e))?;

    println!("Current schema version: {}", current_version);

    for migration in MIGRATIONS {
        if migration.version > current_version {
            println!("Applying migration {}: {}", migration.version, migration.name);

            let tx = conn.transaction()
                .map_err(|e| format!("Failed to start transaction: {}", e))?;

            tx.execute_batch(migration.sql)
                .map_err(|e| format!("Failed to execute migration {}: {}", migration.version, e))?;

            tx.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
                params![migration.version, migration.name],
            ).map_err(|e| format!("Failed to record migration: {}", e))?;

            tx.commit()
                .map_err(|e| format!("Failed to commit migration: {}", e))?;

            println!("Migration {} applied successfully", migration.version);
        }
    }

    Ok(())
}
