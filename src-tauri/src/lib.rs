// Dialogue Tauri shell - Phase 0 skeleton spike.
// Goal: Tauri 2.x opens a window pointing at the running Next.js dev server.
// No custom Rust commands yet; behaviour comes from `tauri.conf.json` (`devUrl`).
// Custom commands (PocketBase lifecycle, sidecar Node, etc.) will be added in later phases.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_notification::NotificationExt;
use tokio::time::sleep;

#[derive(Deserialize, Debug)]
struct PollResponse {
    ok: bool,
    notifications: Option<Vec<PollNotification>>,
}

#[derive(Deserialize, Debug)]
struct PollNotification {
    id: String,
    title: String,
    message: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                let client = reqwest::Client::new();
                // Sleep initially to allow Next.js to start
                sleep(Duration::from_secs(10)).await;

                loop {
                    let secret = std::env::var("INTERNAL_CRON_SECRET").unwrap_or_else(|_| "default_local_secret".to_string());
                    // We assume Next.js is running on 3000 for now. In a bundled app, this would be dynamic.
                    let url = "http://localhost:3000/api/jobs/scheduler/poll";

                    match client.get(url).header("Authorization", format!("Bearer {}", secret)).send().await {
                        Ok(resp) => {
                            if resp.status().is_success() {
                                if let Ok(json) = resp.json::<PollResponse>().await {
                                    if json.ok {
                                        if let Some(notifications) = json.notifications {
                                            let mut fired_ids = Vec::new();
                                            for n in notifications {
                                                let result = app_handle.notification()
                                                    .builder()
                                                    .title(&n.title)
                                                    .body(&n.message)
                                                    .show();
                                                
                                                if result.is_ok() {
                                                    fired_ids.push(n.id);
                                                } else {
                                                    eprintln!("Failed to show OS notification for {}", n.id);
                                                }
                                            }

                                            if !fired_ids.is_empty() {
                                                let mark_url = "http://localhost:3000/api/jobs/scheduler/mark-fired";
                                                let _ = client.post(mark_url)
                                                    .header("Authorization", format!("Bearer {}", secret))
                                                    .json(&serde_json::json!({ "notificationIds": fired_ids }))
                                                    .send().await;
                                            }
                                        }
                                    }
                                }
                            } else {
                                eprintln!("Scheduler poll returned status: {}", resp.status());
                            }
                        }
                        Err(e) => {
                            eprintln!("Scheduler poll request failed: {}", e);
                        }
                    }

                    sleep(Duration::from_secs(60)).await;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
