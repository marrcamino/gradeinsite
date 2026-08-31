use tauri_plugin_sql::{Migration, MigrationKind};

/// The instructor's local database. tauri-plugin-sql resolves a bare filename
/// against the app's data directory, so this is a per-user file on the laptop
/// and never a path the app has to know about.
const DB_URL: &str = "sqlite:gradeinsite.db";

/// The schema, compiled into the binary rather than shipped beside it. A copy
/// on disk could go missing or be edited; this one cannot, and the file in
/// `db/migrations/` stays the single source both databases are written from.
///
/// Versions are append-only. Changing the SQL of a migration that has already
/// run does nothing to a laptop that has run it, so a change to the schema is
/// always a new file and a new version here.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create the local schema",
            sql: include_str!("../../../../db/migrations/001_sqlite_local_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "queue a class record edit only when a column changed",
            sql: include_str!("../../../../db/migrations/002_sqlite_class_record_outbox_guard.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add the school's list of programs",
            sql: include_str!("../../../../db/migrations/003_sqlite_programs.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// Hash a password for the local account cache.
///
/// The instructor signs in against the server when the laptop can reach it, and
/// the app keeps a hash of the password they used so it can let them back in
/// with no wi-fi. That hash is made here rather than fetched: the server's copy
/// has no reason to cross a LAN with no TLS just to enable an offline sign-in.
///
/// bcrypt, the same algorithm PHP's password_hash() uses, so the project has one
/// answer to "how are passwords stored" instead of two.
#[tauri::command]
fn hash_password(password: String) -> Result<String, String> {
    bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())
}

/// Check a password against the cached hash. A missing or malformed hash is a
/// failed sign-in, not an error the screen has to explain.
#[tauri::command]
fn verify_password(password: String, hash: String) -> bool {
    bcrypt::verify(password, &hash).unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        // The school server is wherever the instructor says it is, so requests
        // go out from Rust rather than from the webview: no page origin, no
        // CORS check, and no rebuild when the address changes.
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![hash_password, verify_password])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
