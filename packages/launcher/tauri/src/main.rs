#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod supervise;

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use url::Url;

use supervise::{prefix_from_exe, stop_process, supervise};

fn main() {
    let context = tauri::generate_context!();
    let raw = std::env::args().nth(1).unwrap_or_default();
    if raw.is_empty() {
        let exe = std::env::current_exe().unwrap_or_default();
        if let Some(prefix) = prefix_from_exe(&exe) {
            run_supervisor(context, prefix);
            return;
        }
    }
    let origin = match admit_origin(&raw) {
        Ok(origin) => origin,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(1);
        }
    };
    run_url_window(context, origin);
}

fn run_url_window(context: tauri::Context<tauri::Wry>, origin: Url) {
    let frame_origin = origin.clone();
    let popup_origin = origin.clone();
    tauri::Builder::default()
        .setup(move |app| {
            open_window(app, tauri::WebviewUrl::External(origin), move |url| {
                leave_decision(&frame_origin, url, false)
            }, move |url| {
                let _ = leave_decision(&popup_origin, &url, true);
            })?;
            Ok(())
        })
        .run(context)
        .expect("panel window failed");
}

fn run_supervisor(context: tauri::Context<tauri::Wry>, prefix: std::path::PathBuf) {
    let pid = Arc::new(AtomicU32::new(0));
    let closing = Arc::new(AtomicBool::new(false));
    let origin_slot: Arc<Mutex<Option<Url>>> = Arc::new(Mutex::new(None));
    let pid_window = pid.clone();
    let closing_window = closing.clone();
    let origin_nav = origin_slot.clone();
    let origin_popup = origin_slot.clone();
    tauri::Builder::default()
        .setup(move |app| {
            let window = open_window(
                app,
                tauri::WebviewUrl::App("index.html".into()),
                move |url| match origin_nav.lock().ok().and_then(|slot| slot.clone()) {
                    Some(origin) => leave_decision(&origin, url, false),
                    None => boot_navigation(url),
                },
                move |url| {
                    if let Some(origin) = origin_popup.lock().ok().and_then(|slot| slot.clone()) {
                        let _ = leave_decision(&origin, &url, true);
                    }
                },
            )?;
            let pid_close = pid_window.clone();
            let closing_close = closing_window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    closing_close.store(true, Ordering::SeqCst);
                    stop_process(pid_close.load(Ordering::SeqCst));
                }
            });
            let handle = app.handle().clone();
            #[cfg(unix)]
            {
                let pid_signal = pid.clone();
                let closing_signal = closing.clone();
                let handle_signal = handle.clone();
                std::thread::spawn(move || {
                    supervise::watch_signals(pid_signal, closing_signal, handle_signal)
                });
            }
            std::thread::spawn(move || supervise(prefix, pid, closing, origin_slot, handle));
            Ok(())
        })
        .run(context)
        .expect("panel window failed");
}

fn open_window(
    app: &tauri::App,
    url: tauri::WebviewUrl,
    on_navigation: impl Fn(&Url) -> bool + Send + 'static,
    on_popup: impl Fn(Url) + Send + 'static,
) -> Result<tauri::WebviewWindow, Box<dyn std::error::Error>> {
    let window = tauri::WebviewWindowBuilder::new(app, "main", url)
        .title("Mohou")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .on_document_title_changed(|window, title| {
            if title.is_empty() {
                return;
            }
            let _ = window.set_title(&title);
        })
        .on_navigation(on_navigation)
        .on_new_window(move |url, _features| {
            on_popup(url);
            tauri::webview::NewWindowResponse::Deny
        })
        .build()?;
    Ok(window)
}

/// Before Shell prints the loopback origin, its own assets are the only thing the window may
/// open. Tauri serves those as `tauri://localhost` on macOS and as the wry workaround
/// `http://tauri.localhost` (or `https://`) on Windows, so a scheme test alone denies the
/// splash on Windows and the window is white until the panel arrives.
fn boot_navigation(url: &Url) -> bool {
    if url.scheme() == "tauri" {
        return true;
    }
    matches!(url.scheme(), "http" | "https")
        && url.host_str().is_some_and(|host| host == "tauri.localhost")
}

/// The window may open only the loopback origin Shell started. No path, query, or fragment.
fn admit_origin(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| format!("panel window origin is invalid: {raw}"))?;
    if url.scheme() != "http" {
        return Err("panel window origin must be http".to_string());
    }
    match url.host_str() {
        Some("127.0.0.1") | Some("localhost") => {}
        _ => return Err("panel window origin must be loopback".to_string()),
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err("panel window origin must not include a path".to_string());
    }
    Ok(url)
}

/// Where a load goes. A page script cannot remove this decision.
/// `new_window` is `window.open` or `target="_blank"`. Those never stay in this window.
enum Leave {
    Stay,
    Outside,
    Block,
}

fn classify_leave(origin: &Url, url: &Url, new_window: bool) -> Leave {
    match url.scheme() {
        "javascript" | "about" => {
            if new_window {
                Leave::Block
            } else {
                Leave::Stay
            }
        }
        "mailto" => Leave::Outside,
        "http" | "https" => {
            if !new_window && same_origin(origin, url) {
                Leave::Stay
            } else {
                Leave::Outside
            }
        }
        _ => Leave::Block,
    }
}

fn leave_decision(origin: &Url, url: &Url, new_window: bool) -> bool {
    match classify_leave(origin, url, new_window) {
        Leave::Stay => true,
        Leave::Outside => {
            open_outside(url);
            false
        }
        Leave::Block => false,
    }
}

fn same_origin(origin: &Url, url: &Url) -> bool {
    url.scheme() == origin.scheme()
        && url.host_str() == origin.host_str()
        && url.port_or_known_default() == origin.port_or_known_default()
}

fn open_outside(url: &Url) {
    let text = url.as_str();
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(text).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", text])
            .spawn();
    }
}

#[cfg(test)]
mod tests {
    use super::{admit_origin, boot_navigation, classify_leave, same_origin, Leave};
    use url::Url;

    #[test]
    fn admits_the_splash_assets_and_nothing_else_before_the_origin() {
        let url = |text: &str| Url::parse(text).expect("a url");
        // The splash, on macOS and on Windows.
        assert!(boot_navigation(&url("tauri://localhost/index.html")));
        assert!(boot_navigation(&url("http://tauri.localhost/index.html")));
        assert!(boot_navigation(&url("https://tauri.localhost/")));
        // Everything else waits for the loopback origin.
        assert!(!boot_navigation(&url("http://127.0.0.1:9743/")));
        assert!(!boot_navigation(&url("https://example.com/")));
        assert!(!boot_navigation(&url("http://tauri.localhost.example.com/")));
        assert!(!boot_navigation(&url("mailto:someone@example.com")));
        assert!(!boot_navigation(&url("ftp://example.com/")));
    }

    #[test]
    fn admits_a_loopback_origin_only() {
        assert!(admit_origin("http://127.0.0.1:9743").is_ok());
        assert!(admit_origin("http://localhost:1").is_ok());
        assert!(admit_origin("https://127.0.0.1:1").is_err());
        assert!(admit_origin("http://example.com:1").is_err());
        assert!(admit_origin("http://127.0.0.1:1/panel").is_err());
        assert!(admit_origin("http://127.0.0.1:1?x=1").is_err());
    }

    #[test]
    fn keeps_same_origin_loads_and_sends_foreign_urls_out() {
        let origin = Url::parse("http://127.0.0.1:9743").unwrap();
        let app = Url::parse("http://127.0.0.1:9743/app/com.example.app").unwrap();
        let foreign = Url::parse("https://example.com/x").unwrap();
        let mail = Url::parse("mailto:a@b.c").unwrap();
        let script = Url::parse("javascript:void(0)").unwrap();
        assert!(same_origin(&origin, &app));
        assert!(matches!(classify_leave(&origin, &app, false), Leave::Stay));
        assert!(matches!(classify_leave(&origin, &foreign, false), Leave::Outside));
        assert!(matches!(classify_leave(&origin, &mail, false), Leave::Outside));
        assert!(matches!(classify_leave(&origin, &script, false), Leave::Stay));
        assert!(matches!(
            classify_leave(&origin, &Url::parse("ftp://files.example/a").unwrap(), false),
            Leave::Block
        ));
        assert!(matches!(classify_leave(&origin, &app, true), Leave::Outside));
        assert!(matches!(classify_leave(&origin, &foreign, true), Leave::Outside));
    }
}
