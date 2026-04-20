use std::fmt;

#[derive(Debug)]
pub enum DatabaseError {
    ConnectionFailed(String),
    QueryFailed(String),
    TransactionFailed(String),
    ConstraintViolation(String),
    NotFound(String),
    MigrationFailed(String),
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            DatabaseError::ConnectionFailed(msg) => write!(f, "Connection failed: {}", msg),
            DatabaseError::QueryFailed(msg) => write!(f, "Query failed: {}", msg),
            DatabaseError::TransactionFailed(msg) => write!(f, "Transaction failed: {}", msg),
            DatabaseError::ConstraintViolation(msg) => write!(f, "Constraint violation: {}", msg),
            DatabaseError::NotFound(msg) => write!(f, "Not found: {}", msg),
            DatabaseError::MigrationFailed(msg) => write!(f, "Migration failed: {}", msg),
        }
    }
}

impl std::error::Error for DatabaseError {}

impl From<rusqlite::Error> for DatabaseError {
    fn from(err: rusqlite::Error) -> Self {
        match err {
            rusqlite::Error::SqliteFailure(_, _) => {
                DatabaseError::QueryFailed(err.to_string())
            }
            rusqlite::Error::QueryReturnedNoRows => {
                DatabaseError::NotFound(err.to_string())
            }
            _ => DatabaseError::QueryFailed(err.to_string()),
        }
    }
}
