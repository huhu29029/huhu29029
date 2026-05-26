use rusqlite::Connection;
use tauri::Manager;

const SCHEMA: &str = include_str!("../migrations/schema.sql");

#[tauri::command]
fn app_status() -> &'static str {
    "Novel Memory Engine is running"
}

fn initialize_database(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("novel_memory_engine.sqlite3");
    let connection = Connection::open(db_path)?;
    connection.execute_batch(SCHEMA)?;

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            initialize_database(app).map_err(|error| error.to_string())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_status])
        .run(tauri::generate_context!())
        .expect("error while running Novel Memory Engine");
}
