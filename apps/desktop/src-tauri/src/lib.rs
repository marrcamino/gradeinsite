use tauri_plugin_sql::{Migration, MigrationKind};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

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
    vec![Migration {
        version: 1,
        description: "create the local schema",
        sql: include_str!("../../../../db/migrations/001_sqlite_local_schema.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
