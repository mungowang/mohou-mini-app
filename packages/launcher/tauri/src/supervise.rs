//! The packaged app is this binary. It spawns the shell sidecar and owns the window.
//! Exit code 75 starts the sidecar again. Any other exit stops the app.

use std::collections::VecDeque;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use url::Url;

use crate::admit_origin;

pub const RESTART_EXIT: i32 = 75;
const READY_LIMIT: Duration = Duration::from_secs(60);
const UPDATE_BUDGET: Duration = Duration::from_secs(120);

pub enum ChildStop {
    Restart,
    Exit(i32),
}

pub fn child_stop(code: Option<i32>) -> ChildStop {
    match code {
        Some(RESTART_EXIT) => ChildStop::Restart,
        Some(code) => ChildStop::Exit(code),
        None => ChildStop::Exit(1),
    }
}

pub fn shell_entry(prefix: &Path) -> PathBuf {
    prefix.join("node_modules/@mohou/shell/src/dev.ts")
}

/// Node's module loader cannot resolve a verbatim path. `\\?\C:\dir\dev.ts` reaches it as
/// `lstat("C:")`, which is a directory, and the sidecar dies before it starts. Canonicalizing
/// resolves `..` and symlinks, so the prefix stays canonical; only the Windows form it takes
/// is a problem, and only Node cares.
pub fn plain_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let text = path.as_os_str().to_string_lossy();
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = text.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path.to_path_buf()
}

/// `Contents/MacOS/<exe>` uses `Contents/Resources/prefix`. A sibling `prefix/` is the local layout.
pub fn prefix_from_exe(exe: &Path) -> Option<PathBuf> {
    let dir = exe.parent()?;
    for candidate in [
        dir.join("../Resources/prefix"),
        dir.join("Resources/prefix"),
        dir.join("prefix"),
    ] {
        if shell_entry(&candidate).is_file() {
            return Some(plain_path(&fs::canonicalize(&candidate).unwrap_or(candidate)));
        }
    }
    None
}

/// Keep Windows from giving a console child of this GUI process a console window. This binary
/// is built for the windows subsystem, so the console `node.exe` would otherwise be handed is a
/// new window — one that belongs to the sidecar, so closing it kills Host and the window with it.
#[cfg(windows)]
pub fn no_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn no_console(_cmd: &mut Command) {}

/// True when a launch must ask a login shell for PATH. A Dock launch does not read `.zshrc`,
/// so nvm, fnm, volta, and asdf only apply if we ask. Windows has no login shell to ask and
/// already inherits the machine and user PATH, so asking is a macOS bundle concern.
pub fn reads_login_shell(gui: bool, windows: bool) -> bool {
    gui && !windows
}

pub fn is_app_bundle(prefix: &Path) -> bool {
    prefix
        .parent()
        .and_then(|parent| parent.file_name())
        .is_some_and(|name| name == "Resources")
}

pub fn runtime_dir(prefix: &Path, override_value: Option<&str>, home: &Path) -> PathBuf {
    if let Some(value) = override_value {
        if !value.is_empty() {
            return PathBuf::from(value);
        }
    }
    if is_app_bundle(prefix) {
        home.join(".mini-app").join("runtime")
    } else {
        prefix
            .parent()
            .unwrap_or(prefix)
            .join("runtime")
    }
}

fn node_file_name() -> &'static str {
    if cfg!(windows) { "node.exe" } else { "node" }
}

fn path_sep() -> char {
    if cfg!(windows) { ';' } else { ':' }
}

fn is_exec(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return path
            .metadata()
            .map(|meta| meta.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
    }
    #[cfg(not(unix))]
    {
        true
    }
}

pub fn find_node(path_env: &str, home: &Path) -> Option<PathBuf> {
    // Same lookup as `command -v node` on this PATH. Do not skip ahead to
    // another install that happens to contain Pi.
    let _ = home;
    node_candidates(path_env, home).into_iter().next()
}

fn node_candidates(path_env: &str, home: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut push = |candidate: PathBuf| {
        if is_exec(&candidate) && !found.iter().any(|item| item == &candidate) {
            found.push(candidate);
        }
    };
    let _ = home;
    for dir in path_env.split(path_sep()).filter(|dir| !dir.is_empty()) {
        push(Path::new(dir).join(node_file_name()));
    }
    #[cfg(windows)]
    {
        for node in nvm_windows_nodes(home) {
            push(node);
        }
        if let Some(programs) = std::env::var_os("ProgramFiles") {
            push(PathBuf::from(programs).join("nodejs").join("node.exe"));
        }
    }
    for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
        push(Path::new(dir).join(node_file_name()));
    }
    found
}

#[cfg(windows)]
fn version_nodes(root: &Path, file_name: &str) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut names: Vec<_> = entries.filter_map(|entry| entry.ok()).collect();
    names.sort_by_key(|entry| entry.file_name());
    names.reverse();
    names
        .into_iter()
        .filter_map(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !(name.starts_with("v22") || name.starts_with("v24")) {
                return None;
            }
            let candidate = entry.path().join(file_name);
            is_exec(&candidate).then_some(candidate)
        })
        .collect()
}

#[cfg(windows)]
fn nvm_windows_nodes(home: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(nvm_home) = std::env::var_os("NVM_HOME") {
        roots.push(PathBuf::from(nvm_home));
    }
    roots.push(home.join("AppData").join("Roaming").join("nvm"));
    if let Some(programs) = std::env::var_os("ProgramFiles") {
        roots.push(PathBuf::from(programs).join("nvm"));
    }
    let mut nodes = Vec::new();
    for root in roots {
        nodes.extend(version_nodes(&root, "node.exe"));
    }
    nodes
}

pub fn prepend_path(path: &str, dir: &str) -> String {
    if dir.is_empty() || !Path::new(dir).is_dir() {
        return path.to_string();
    }
    if path.split(path_sep()).any(|item| item == dir) {
        return path.to_string();
    }
    if path.is_empty() {
        dir.to_string()
    } else {
        format!("{dir}{sep}{path}", sep = path_sep())
    }
}

struct Launch {
    node: PathBuf,
    path: String,
    entry: PathBuf,
    runtime: PathBuf,
    panel: PathBuf,
    gui: bool,
}

fn launch_plan(prefix: &Path, app: &AppHandle, announce: bool) -> Result<(Launch, bool), String> {
    let entry = shell_entry(prefix);
    if !entry.is_file() {
        return Err(format!("shell entry is missing: {}", entry.display()));
    }
    let home = home_dir();
    let gui = is_app_bundle(prefix);
    let inherited = std::env::var("PATH").unwrap_or_default();
    let runtime = runtime_dir(prefix, std::env::var("MINI_APP_RUNTIME").ok().as_deref(), &home);
    fs::create_dir_all(&runtime).map_err(|error| format!("could not create runtime: {error}"))?;
    // A Dock launch does not read .zshrc. Ask the login shell, the same way
    // shell-env and VS Code do, so nvm, fnm, volta, and asdf apply themselves.
    // A remembered PATH skips that wait. A background refresh updates the next open.
    let (base_path, cached) = if reads_login_shell(gui, cfg!(windows)) {
        if let Some(path) = read_shell_cache(&runtime) {
            if find_node(&path, &home).is_some() {
                if announce {
                    set_splash(app, &runtime, Splash::Platform);
                }
                (path, true)
            } else {
                fresh_gui_path(&runtime, &home, app, announce)
            }
        } else {
            fresh_gui_path(&runtime, &home, app, announce)
        }
    } else {
        let mut path = inherited;
        path = prepend_path(&path, "/opt/homebrew/bin");
        path = prepend_path(&path, "/usr/local/bin");
        (prepend_path(&path, &home.join(".local/bin").display().to_string()), false)
    };
    let node = find_node(&base_path, &home).ok_or_else(|| {
        "Mohou needs Node.js 22+ . Install it from https://nodejs.org and open Mohou again.".to_string()
    })?;
    let node_bin = node
        .parent()
        .map(|dir| dir.display().to_string())
        .unwrap_or_default();
    let path = prepend_path(&base_path, &node_bin);
    Ok((
        Launch {
            node,
            path,
            entry,
            runtime,
            panel: prefix.join("node_modules/@mohou/shell/dist"),
            gui,
        },
        cached,
    ))
}

fn fresh_gui_path(runtime: &Path, home: &Path, app: &AppHandle, announce: bool) -> (String, bool) {
    if announce {
        set_splash(app, runtime, Splash::Environment);
    }
    if let Some(path) = shell_path().or_else(login_path) {
        write_shell_cache(runtime, &path);
        if announce {
            set_splash(app, runtime, Splash::Platform);
        }
        return (path, false);
    }
    let mut path = "/usr/bin:/bin:/usr/sbin:/sbin".to_string();
    path = prepend_path(&path, "/opt/homebrew/bin");
    path = prepend_path(&path, "/usr/local/bin");
    path = prepend_path(&path, &home.join(".local/bin").display().to_string());
    if announce {
        set_splash(app, runtime, Splash::Platform);
    }
    (prepend_path(&path, &home.join(".cargo/bin").display().to_string()), false)
}

fn shell_cache_file(runtime: &Path) -> PathBuf {
    runtime.join("shell-path.json")
}

fn read_shell_cache(runtime: &Path) -> Option<String> {
    let text = fs::read_to_string(shell_cache_file(runtime)).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let path = value.get("path")?.as_str()?;
    if path.contains('/') || path.contains('\\') {
        Some(path.to_string())
    } else {
        None
    }
}

fn write_shell_cache(runtime: &Path, path: &str) {
    let _ = fs::create_dir_all(runtime);
    let body = serde_json::json!({ "path": path });
    let _ = fs::write(shell_cache_file(runtime), format!("{body}\n"));
}

fn refresh_shell_cache(runtime: PathBuf) {
    thread::spawn(move || {
        let Some(path) = shell_path().or_else(login_path) else {
            return;
        };
        if find_node(&path, &home_dir()).is_some() {
            write_shell_cache(&runtime, &path);
        }
    });
}

enum Splash {
    Environment,
    Platform,
    Update,
}

fn splash_label(locale: &str, kind: Splash) -> &'static str {
    let zh = locale.to_ascii_lowercase().starts_with("zh");
    match (zh, kind) {
        (true, Splash::Environment) => "正在检测运行环境",
        (false, Splash::Environment) => "Checking the runtime",
        (true, Splash::Platform) => "正在启动运行平台",
        (false, Splash::Platform) => "Starting the platform",
        (true, Splash::Update) => "正在安装更新",
        (false, Splash::Update) => "Installing the update",
    }
}

fn splash_locale(runtime: &Path) -> String {
    let Ok(text) = fs::read_to_string(runtime.join("host.json")) else {
        return "zh-CN".to_string();
    };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|value| value.get("locale")?.as_str().map(str::to_string))
        .filter(|locale| !locale.is_empty())
        .unwrap_or_else(|| "zh-CN".to_string())
}

fn set_splash(app: &AppHandle, runtime: &Path, kind: Splash) {
    let text = splash_label(&splash_locale(runtime), kind);
    let script = format!(
        "window.mohouSplash&&window.mohouSplash({})",
        serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string())
    );
    for _ in 0..40 {
        if let Some(window) = app.get_webview_window("main") {
            if window.eval(&script).is_ok() {
                return;
            }
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

const SHELL_ENV_MARK: &str = "_MOHOU_SHELL_ENV_";

/// PATH from an interactive login shell. `None` on Windows: the user PATH is already in the process.
fn shell_path() -> Option<String> {
    #[cfg(not(unix))]
    {
        return None;
    }
    #[cfg(unix)]
    {
        let shell = std::env::var("SHELL").ok().filter(|value| !value.is_empty())?;
        if !Path::new(&shell).is_file() {
            return None;
        }
        let script = format!(
            "printf '%s' '{SHELL_ENV_MARK}'; command env; printf '%s' '{SHELL_ENV_MARK}'; exit"
        );
        let child = Command::new(&shell)
            .args(["-ilc", &script])
            .env("DISABLE_AUTO_UPDATE", "true")
            .env("ZSH_TMUX_AUTOSTARTED", "true")
            .env("ZSH_TMUX_AUTOSTART", "false")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let _ = tx.send(child.wait_with_output());
        });
        let output = rx.recv_timeout(Duration::from_secs(8)).ok()?.ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        path_from_shell_env(&text, SHELL_ENV_MARK)
    }
}

fn path_from_shell_env(text: &str, mark: &str) -> Option<String> {
    let start = text.find(mark)? + mark.len();
    let rest = &text[start..];
    let end = rest.find(mark).unwrap_or(rest.len());
    for line in rest[..end].lines() {
        let Some(value) = line.strip_prefix("PATH=") else {
            continue;
        };
        if value.contains('/') || value.contains('\\') {
            return Some(value.to_string());
        }
    }
    None
}

fn login_path() -> Option<String> {
    let shell = if Path::new("/bin/zsh").is_file() {
        "/bin/zsh"
    } else if Path::new("/bin/bash").is_file() {
        "/bin/bash"
    } else {
        return None;
    };
    let print = if shell.ends_with("zsh") {
        "print -r -- \"$PATH\""
    } else {
        "printf %s \"$PATH\""
    };
    let output = Command::new(shell).args(["-lc", print]).output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .rev()
        .find(|line| line.contains('/'))
        .map(|line| line.to_string())
}

fn spawn_sidecar(
    prefix: &Path,
    app: &AppHandle,
    reporter: &Arc<Reporter>,
    tail: &Tail,
) -> Result<(Child, bool, PathBuf), String> {
    let (launch, cached) = launch_plan(prefix, app, true)?;
    // The three facts that explain a launch that never reaches the panel.
    reporter.note(&format!("node {}", launch.node.display()));
    reporter.note(&format!("entry {}", launch.entry.display()));
    reporter.note(&format!("PATH {}", launch.path));
    if launch.gui && !launch.node.is_file() {
        return Err(with_log(
            "Mohou needs Node.js 22+ . Install it from https://nodejs.org and open Mohou again.",
            reporter.path(),
        ));
    }
    let mut cmd = Command::new(&launch.node);
    cmd.arg("--import")
        .arg("tsx")
        .arg(&launch.entry)
        .current_dir(prefix)
        .env("PATH", &launch.path)
        .env("MINI_APP_SUPERVISED", "1")
        .env("MINI_APP_PANEL", &launch.panel)
        .env("MINI_APP_RUNTIME", &launch.runtime)
        .env(
            "NODE_USE_SYSTEM_CA",
            std::env::var("NODE_USE_SYSTEM_CA").unwrap_or_else(|_| "1".to_string()),
        )
        .env_remove("MINI_APP_SKIP_WINDOW")
        .env_remove("MINI_APP_WINDOW")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    no_console(&mut cmd);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = cmd
        .spawn()
        .map_err(|error| with_log(&format!("could not start Node: {error}"), reporter.path()))?;
    // Node explains itself on stderr. A GUI launch has nowhere to show it, so it goes to the log.
    if let Some(stderr) = child.stderr.take() {
        let voice = Arc::clone(reporter);
        let said = tail.clone();
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                let Ok(line) = line else { break };
                let trimmed = line.trim_end();
                if trimmed.is_empty() {
                    continue;
                }
                voice.note(&format!("sidecar error: {trimmed}"));
                tail_push(&said, trimmed);
            }
        });
    }
    // process_group(0) keeps grandchildren killable, but then a dead parent
    // does not take the sidecar with it. A watcher notices that and kills the group.
    spawn_parent_watch(child.id());
    Ok((child, cached, launch.runtime))
}

fn spawn_parent_watch(child_pid: u32) {
    let parent = std::process::id();
    #[cfg(unix)]
    {
        let script = format!(
            "while kill -0 {parent} 2>/dev/null; do sleep 0.2; done; kill -TERM -{child_pid} 2>/dev/null; kill -KILL -{child_pid} 2>/dev/null"
        );
        // Own process group so a SIGKILL of Mohou does not take the watcher with it.
        let _ = {
            use std::os::unix::process::CommandExt;
            Command::new("/bin/sh")
                .arg("-c")
                .arg(script)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .process_group(0)
                .spawn()
        };
    }
    #[cfg(windows)]
    {
        let script = format!(
            "while (Get-Process -Id {parent} -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 200 }}; taskkill /PID {child_pid} /T /F | Out-Null"
        );
        let mut watch = Command::new("powershell");
        watch
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        no_console(&mut watch);
        let _ = watch.spawn();
    }
}

enum OriginRead {
    Ready(Url, mpsc::Receiver<Url>),
    Exited(Option<i32>),
    TimedOut,
}

fn follow_origins(app: AppHandle, follow: mpsc::Receiver<Url>) {
    thread::spawn(move || {
        while let Ok(next) = follow.recv() {
            let app_nav = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Some(window) = app_nav.get_webview_window("main") {
                    let _ = window.navigate(next);
                }
            });
        }
    });
}

fn read_origin(
    stdout: impl std::io::Read + Send + 'static,
    child: &mut Child,
    reporter: Arc<Reporter>,
    tail: Tail,
) -> OriginRead {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let trimmed = line.trim();
            match admit_origin(trimmed) {
                Ok(url) => {
                    reporter.note(&format!("sidecar ready at {url}"));
                    tail_push(&tail, trimmed);
                    let _ = tx.send(url);
                }
                Err(_) if !trimmed.is_empty() => {
                    reporter.note(&format!("sidecar: {trimmed}"));
                    tail_push(&tail, trimmed);
                }
                Err(_) => {}
            }
        }
    });
    let started = Instant::now();
    loop {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(url) => return OriginRead::Ready(url, rx),
            Err(RecvTimeoutError::Timeout) => {
                if started.elapsed() > READY_LIMIT {
                    return OriginRead::TimedOut;
                }
                match child.try_wait() {
                    Ok(Some(status)) => return OriginRead::Exited(status.code()),
                    Ok(None) => {}
                    Err(_) => return OriginRead::Exited(None),
                }
            }
            Err(RecvTimeoutError::Disconnected) => match child.try_wait() {
                Ok(Some(status)) => return OriginRead::Exited(status.code()),
                Ok(None) => return OriginRead::Exited(None),
                Err(_) => return OriginRead::Exited(None),
            },
        }
    }
}

#[cfg(unix)]
pub fn watch_signals(pid: Arc<AtomicU32>, closing: Arc<AtomicBool>, app: AppHandle) {
    let Ok(mut signals) = signal_hook::iterator::Signals::new([
        signal_hook::consts::SIGINT,
        signal_hook::consts::SIGTERM,
    ]) else {
        return;
    };
    for _ in signals.forever() {
        closing.store(true, Ordering::SeqCst);
        stop_process(pid.load(Ordering::SeqCst));
        app.exit(0);
        break;
    }
}

pub fn stop_process(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    unsafe {
        libc::kill(-(pid as i32), libc::SIGTERM);
    }
    #[cfg(windows)]
    {
        let mut kill = Command::new("taskkill");
        kill.args(["/PID", &pid.to_string(), "/T", "/F"]);
        no_console(&mut kill);
        let _ = kill.status();
    }
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(2));
        #[cfg(unix)]
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    });
}

fn npm_bin(node: &Path) -> PathBuf {
    let name = if cfg!(windows) { "npm.cmd" } else { "npm" };
    node.parent().map(|dir| dir.join(name)).unwrap_or_else(|| PathBuf::from(name))
}

fn update_request(prefix: &Path) -> PathBuf {
    prefix.join("update.json")
}

fn update_snapshot_dir(prefix: &Path) -> PathBuf {
    prefix.join("update-snapshot")
}

/// The panel reads this after the restart. Host owns the reader and the closed code set.
const UPDATE_RESULT_FILE: &str = "update-result.json";

/// What the panel shows after the restart. Every attempt ends in exactly one of these.
pub enum UpdateOutcome<'a> {
    Done { from: Option<&'a str>, to: Option<&'a str> },
    Failed {
        code: &'a str,
        from: Option<&'a str>,
        to: Option<&'a str>,
        rolled_back: bool,
        exit_code: Option<i32>,
    },
}

/// The product version this prefix would start. The panel shows it as the version running now.
fn installed_version(prefix: &Path) -> Option<String> {
    let text = fs::read_to_string(prefix.join("node_modules/@mohou/shell/package.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value.get("version")?.as_str().map(str::to_string)
}

fn epoch_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

/// Best effort. A record that cannot be written does not change how an install ends.
fn write_update_result(runtime: &Path, log: &Path, outcome: &UpdateOutcome<'_>) {
    let _ = fs::create_dir_all(runtime);
    let body = update_result_body(log, outcome);
    let _ = fs::write(runtime.join(UPDATE_RESULT_FILE), format!("{body}\n"));
}

fn update_result_body(log: &Path, outcome: &UpdateOutcome<'_>) -> serde_json::Value {
    let mut record = serde_json::json!({ "at": epoch_millis(), "log": log.display().to_string() });
    let object = match record.as_object_mut() {
        Some(object) => object,
        None => return record,
    };
    match outcome {
        UpdateOutcome::Done { from, to } => {
            object.insert("state".to_string(), serde_json::json!("done"));
            insert_version(object, "from", *from);
            insert_version(object, "to", *to);
        }
        UpdateOutcome::Failed { code, from, to, rolled_back, exit_code } => {
            object.insert("state".to_string(), serde_json::json!("failed"));
            object.insert("code".to_string(), serde_json::json!(code));
            object.insert("rolledBack".to_string(), serde_json::json!(rolled_back));
            insert_version(object, "from", *from);
            insert_version(object, "to", *to);
            if let Some(code) = exit_code {
                object.insert("exitCode".to_string(), serde_json::json!(code));
            }
        }
    }
    record
}

fn insert_version(object: &mut serde_json::Map<String, serde_json::Value>, key: &str, value: Option<&str>) {
    let version = value.filter(|item| !item.is_empty());
    if let Some(version) = version {
        object.insert(key.to_string(), serde_json::json!(version));
    }
}

enum InstallWait {
    Finished(Option<i32>),
    TimedOut,
    Closed,
}

/// Optional Pi peers are linked by the launcher. Required UI imports are direct dependencies, not peers.
pub fn harden_install_args(mut args: Vec<String>) -> Vec<String> {
    if args.first().map(String::as_str) != Some("install") {
        return args;
    }
    for flag in ["--omit=peer", "--fetch-retries=1", "--fetch-timeout=20000"] {
        if !args.iter().any(|arg| arg == flag) {
            args.push(flag.to_string());
        }
    }
    // A file: install already has the tarballs. Revalidating the registry is what burns the budget.
    if args.iter().any(|arg| arg.starts_with("file:")) && !args.iter().any(|arg| arg == "--prefer-offline") {
        args.push("--prefer-offline".to_string());
    }
    args
}

fn save_update_snapshot(prefix: &Path) -> bool {
    let dir = update_snapshot_dir(prefix);
    if fs::create_dir_all(&dir).is_err() {
        return false;
    }
    if fs::copy(prefix.join("package.json"), dir.join("package.json")).is_err() {
        return false;
    }
    let lock = prefix.join("package-lock.json");
    if lock.is_file() && fs::copy(&lock, dir.join("package-lock.json")).is_err() {
        return false;
    }
    true
}

fn restore_update_snapshot(prefix: &Path) {
    let dir = update_snapshot_dir(prefix);
    let manifest = dir.join("package.json");
    if manifest.is_file() {
        let _ = fs::copy(&manifest, prefix.join("package.json"));
    }
    let lock = dir.join("package-lock.json");
    if lock.is_file() {
        let _ = fs::copy(&lock, prefix.join("package-lock.json"));
    }
    let _ = fs::remove_dir_all(&dir);
}

fn quarantine_update(prefix: &Path, note: &str) {
    let path = update_request(prefix);
    if path.is_file() {
        let _ = fs::rename(&path, prefix.join("update.failed.json"));
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(prefix.join("update.log")) {
        use std::io::Write;
        let _ = file.write_all(format!("update stopped: {note}\n").as_bytes());
    }
}

fn stop_locked_install(prefix: &Path) {
    let Ok(text) = fs::read_to_string(prefix.join("update.lock")) else {
        return;
    };
    if let Ok(locked) = text.trim().parse::<u32>() {
        stop_process(locked);
    }
    let _ = fs::remove_file(prefix.join("update.lock"));
}

/// A file left by a dead process must not install, and must not block open.
fn park_leftover_update(prefix: &Path, runtime: &Path, reporter: &Reporter) {
    stop_locked_install(prefix);
    restore_update_snapshot(prefix);
    if !update_request(prefix).is_file() {
        return;
    }
    quarantine_update(prefix, "left by a previous process");
    write_update_result(runtime, &prefix.join("update.log"), &UpdateOutcome::Failed {
        code: "leftover",
        from: installed_version(prefix).as_deref(),
        to: None,
        rolled_back: true,
        exit_code: None,
    });
    reporter.say("The previous update did not finish. Mohou opened the installed version.");
}

fn wait_budget(child: &mut Child, budget: Duration, closing: &AtomicBool) -> InstallWait {
    let started = Instant::now();
    loop {
        if closing.load(Ordering::SeqCst) {
            return InstallWait::Closed;
        }
        match child.try_wait() {
            Ok(Some(status)) => return InstallWait::Finished(status.code()),
            Ok(None) if started.elapsed() >= budget => return InstallWait::TimedOut,
            Ok(None) => thread::sleep(Duration::from_millis(200)),
            Err(_) => return InstallWait::Finished(None),
        }
    }
}

/// Sidecar exit 75 in this process is the only install. Failure boots the prefix as it was.
fn apply_pending_update(prefix: &Path, runtime: &Path, reporter: &Reporter, closing: &AtomicBool, pid: &AtomicU32, app: &AppHandle) {
    let path = update_request(prefix);
    let Ok(text) = fs::read_to_string(&path) else {
        return;
    };
    let value: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(_) => {
            let _ = fs::remove_file(&path);
            return;
        }
    };
    let target = value.get("version").and_then(|item| item.as_str()).map(str::to_string);
    let from = installed_version(prefix);
    let log_path = prefix.join("update.log");
    let record = |outcome: &UpdateOutcome<'_>| write_update_result(runtime, &log_path, outcome);
    let Some(args) = value.get("args").and_then(|item| item.as_array()) else {
        let _ = fs::remove_file(&path);
        return;
    };
    let args: Vec<String> = args.iter().filter_map(|item| item.as_str().map(str::to_string)).collect();
    if args.is_empty() {
        let _ = fs::remove_file(&path);
        return;
    }
    let launch = match launch_plan(prefix, app, false) {
        Ok((launch, _)) => launch,
        Err(message) => {
            quarantine_update(prefix, &message);
            record(&UpdateOutcome::Failed {
                code: "prepare",
                from: from.as_deref(),
                to: target.as_deref(),
                rolled_back: true,
                exit_code: None,
            });
            reporter.say(&message);
            return;
        }
    };
    if !save_update_snapshot(prefix) {
        quarantine_update(prefix, "could not snapshot the prefix manifest");
        record(&UpdateOutcome::Failed {
            code: "prepare",
            from: from.as_deref(),
            to: target.as_deref(),
            rolled_back: true,
            exit_code: None,
        });
        reporter.say("Mohou could not install the update. The installed version is still running.");
        return;
    }
    let args = harden_install_args(args);
    let out = match fs::File::create(&log_path) {
        Ok(file) => file,
        Err(error) => {
            restore_update_snapshot(prefix);
            quarantine_update(prefix, &error.to_string());
            write_update_result(runtime, &log_path, &UpdateOutcome::Failed {
                code: "prepare",
                from: from.as_deref(),
                to: target.as_deref(),
                rolled_back: true,
                exit_code: None,
            });
            reporter.say("Mohou could not install the update. The installed version is still running.");
            return;
        }
    };
    let err = match out.try_clone() {
        Ok(file) => file,
        Err(error) => {
            restore_update_snapshot(prefix);
            quarantine_update(prefix, &error.to_string());
            write_update_result(runtime, &log_path, &UpdateOutcome::Failed {
                code: "prepare",
                from: from.as_deref(),
                to: target.as_deref(),
                rolled_back: true,
                exit_code: None,
            });
            reporter.say("Mohou could not install the update. The installed version is still running.");
            return;
        }
    };
    let mut cmd = Command::new(npm_bin(&launch.node));
    cmd.args(&args)
        .current_dir(prefix)
        .env("PATH", &launch.path)
        .stdin(Stdio::null())
        .stdout(Stdio::from(out))
        .stderr(Stdio::from(err));
    no_console(&mut cmd);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(error) => {
            restore_update_snapshot(prefix);
            quarantine_update(prefix, &error.to_string());
            write_update_result(runtime, &log_path, &UpdateOutcome::Failed {
                code: "prepare",
                from: from.as_deref(),
                to: target.as_deref(),
                rolled_back: true,
                exit_code: None,
            });
            reporter.say("Mohou could not install the update. The installed version is still running.");
            return;
        }
    };
    let install_pid = child.id();
    pid.store(install_pid, Ordering::SeqCst);
    let _ = fs::write(prefix.join("update.lock"), install_pid.to_string());
    spawn_parent_watch(install_pid);
    let waited = wait_budget(&mut child, UPDATE_BUDGET, closing);
    pid.store(0, Ordering::SeqCst);
    let _ = fs::remove_file(prefix.join("update.lock"));
    match waited {
        InstallWait::Finished(Some(0)) => {
            let _ = fs::remove_dir_all(update_snapshot_dir(prefix));
            let _ = fs::remove_file(&path);
            write_update_result(runtime, &log_path, &UpdateOutcome::Done {
                from: from.as_deref(),
                to: target.as_deref(),
            });
        }
        other => {
            stop_process(install_pid);
            let _ = child.wait();
            restore_update_snapshot(prefix);
            let note = match other {
                InstallWait::TimedOut => "timed out".to_string(),
                InstallWait::Closed => "closed".to_string(),
                InstallWait::Finished(code) => format!("exit {code:?}"),
            };
            quarantine_update(prefix, &note);
            write_update_result(runtime, &log_path, &UpdateOutcome::Failed {
                code: match other {
                    InstallWait::TimedOut => "timeout",
                    InstallWait::Closed => "closed",
                    InstallWait::Finished(_) => "exit",
                },
                from: from.as_deref(),
                to: target.as_deref(),
                rolled_back: true,
                exit_code: match other {
                    InstallWait::Finished(code) => code,
                    InstallWait::TimedOut | InstallWait::Closed => None,
                },
            });
            if !matches!(other, InstallWait::Closed) {
                reporter.say("Mohou could not install the update. The installed version is still running.");
            }
        }
    }
}

/// The tail of what the sidecar said, for the message when it dies before it is ready.
pub const TAIL_LINES: usize = 20;

pub type Tail = Arc<Mutex<VecDeque<String>>>;

pub fn tail_push(tail: &Tail, line: &str) {
    if let Ok(mut lines) = tail.lock() {
        if lines.len() == TAIL_LINES {
            lines.pop_front();
        }
        lines.push_back(line.to_string());
    }
}

pub fn tail_text(tail: &Tail) -> String {
    tail.lock()
        .map(|lines| lines.iter().cloned().collect::<Vec<_>>().join("\n"))
        .unwrap_or_default()
}

/// What is worth saying when the sidecar stops before it prints an origin. Every word here is
/// the difference between a silent window and a report someone can act on.
pub fn sidecar_failure(when: &str, code: Option<i32>, tail: &str, log: &Path) -> String {
    let status = code
        .map(|code| format!("exit code {code}"))
        .unwrap_or_else(|| "no exit code".to_string());
    let said = if tail.trim().is_empty() {
        "It printed nothing.".to_string()
    } else {
        format!("Its last lines:\n{tail}")
    };
    format!("Mohou's sidecar {when} ({status}).\n\n{said}\n\nThe launcher log is at {}", log.display())
}

/// The same message with the log path, which is the one thing a failed launch should always name.
pub fn with_log(message: &str, log: &Path) -> String {
    format!("{message}\n\nThe launcher log is at {}", log.display())
}

/// What the launcher says, in the places a user can see it: a log beside the runtime, stderr for
/// a terminal launch, and a native message on a GUI launch. None of it is macOS-only.
pub struct Reporter {
    log: Option<Mutex<fs::File>>,
    path: PathBuf,
    gui: bool,
}

impl Reporter {
    /// Open `<runtime>/launcher.log`, replacing the previous launch's file. A log that cannot be
    /// opened costs the log, never the launch.
    pub fn open(runtime: &Path, gui: bool) -> Reporter {
        let path = runtime.join("launcher.log");
        let _ = fs::create_dir_all(runtime);
        let log = fs::File::create(&path).ok().map(Mutex::new);
        let reporter = Reporter { log, path, gui };
        reporter.note(&format!("Mohou launcher {} on {}", env!("CARGO_PKG_VERSION"), std::env::consts::OS));
        reporter.note(&format!("runtime {}", runtime.display()));
        if reporter.log.is_none() {
            reporter.note("the log file could not be opened");
        }
        reporter
    }

    /// Where the log is. Named in every fatal message, and kept even when the file is not there.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// One line to the log and to stderr. Nothing appears on screen.
    pub fn note(&self, line: &str) {
        eprintln!("{line}");
        if let Some(log) = &self.log {
            if let Ok(mut file) = log.lock() {
                let _ = writeln!(file, "{line}");
            }
        }
    }

    /// A message for the user: logged, and shown when a GUI launch owns the screen.
    pub fn say(&self, message: &str) {
        self.note(message);
        if self.gui {
            message_box(message);
        }
    }
}

/// A native message. macOS asks `osascript`, Windows asks user32: one dialog is not worth a
/// dependency, and a launch that failed must never be silent.
#[cfg(target_os = "macos")]
fn message_box(message: &str) {
    let _ = dialog(message)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

#[cfg(windows)]
fn message_box(message: &str) {
    use std::os::windows::ffi::OsStrExt;

    const MB_OK: u32 = 0x0000_0000;
    const MB_ICONERROR: u32 = 0x0000_0010;
    const MB_SETFOREGROUND: u32 = 0x0001_0000;

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(window: *mut core::ffi::c_void, text: *const u16, title: *const u16, kind: u32) -> i32;
    }

    let wide = |text: &str| -> Vec<u16> {
        std::ffi::OsStr::new(text).encode_wide().chain(std::iter::once(0)).collect()
    };
    let body = wide(message);
    let title = wide("Mohou");
    unsafe {
        MessageBoxW(std::ptr::null_mut(), body.as_ptr(), title.as_ptr(), MB_OK | MB_ICONERROR | MB_SETFOREGROUND);
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
fn message_box(message: &str) {
    eprintln!("{message}");
}

#[cfg(target_os = "macos")]
fn dialog(message: &str) -> Command {
    let text = message.replace('"', "'");
    let script = format!(
        "display dialog \"{text}\" buttons {{\"OK\"}} default button 1 with title \"Mohou\""
    );
    let mut cmd = Command::new("osascript");
    cmd.arg("-e").arg(script);
    cmd
}

pub fn supervise(
    prefix: PathBuf,
    pid: Arc<AtomicU32>,
    closing: Arc<AtomicBool>,
    origin_slot: Arc<Mutex<Option<Url>>>,
    app: AppHandle,
) {
    let gui = is_app_bundle(&prefix);
    let runtime = runtime_dir(&prefix, std::env::var("MINI_APP_RUNTIME").ok().as_deref(), &home_dir());
    let reporter = Arc::new(Reporter::open(&runtime, gui));
    let mut install_after_restart = false;
    loop {
        if closing.load(Ordering::SeqCst) {
            app.exit(0);
            return;
        }
        if install_after_restart {
            set_splash(&app, &runtime, Splash::Update);
            apply_pending_update(&prefix, &runtime, &reporter, &closing, &pid, &app);
        } else {
            park_leftover_update(&prefix, &runtime, &reporter);
        }
        if closing.load(Ordering::SeqCst) {
            app.exit(0);
            return;
        }
        let tail: Tail = Arc::new(Mutex::new(VecDeque::new()));
        let (mut child, cached, runtime) = match spawn_sidecar(&prefix, &app, &reporter, &tail) {
            Ok(spawned) => spawned,
            Err(message) => {
                reporter.say(&message);
                app.exit(1);
                return;
            }
        };
        if cached {
            refresh_shell_cache(runtime);
        }
        pid.store(child.id(), Ordering::SeqCst);
        if closing.load(Ordering::SeqCst) {
            stop_process(child.id());
            let _ = child.wait();
            app.exit(0);
            return;
        }
        let Some(stdout) = child.stdout.take() else {
            reporter.say(&with_log("could not read the sidecar", reporter.path()));
            app.exit(1);
            return;
        };
        let url = match read_origin(stdout, &mut child, Arc::clone(&reporter), Arc::clone(&tail)) {
            OriginRead::Ready(url, follow) => {
                follow_origins(app.clone(), follow);
                url
            }
            OriginRead::Exited(code) => {
                pid.store(0, Ordering::SeqCst);
                match child_stop(code) {
                    ChildStop::Restart => {
                        install_after_restart = true;
                        continue;
                    }
                    ChildStop::Exit(code) => {
                        reporter.say(&sidecar_failure(
                            "stopped before it was ready",
                            Some(code),
                            &tail_text(&tail),
                            reporter.path(),
                        ));
                        app.exit(code);
                        return;
                    }
                }
            }
            OriginRead::TimedOut => {
                stop_process(child.id());
                let _ = child.wait();
                reporter.say(&sidecar_failure(
                    "did not become ready in time",
                    None,
                    &tail_text(&tail),
                    reporter.path(),
                ));
                app.exit(1);
                return;
            }
        };
        if let Ok(mut slot) = origin_slot.lock() {
            *slot = Some(url.clone());
        }
        let app_nav = app.clone();
        let url_nav = url;
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = app_nav.get_webview_window("main") {
                let _ = window.navigate(url_nav);
            }
        });
        let status = child.wait();
        pid.store(0, Ordering::SeqCst);
        if closing.load(Ordering::SeqCst) {
            app.exit(0);
            return;
        }
        let code = status.ok().and_then(|status| status.code());
        match child_stop(code) {
            ChildStop::Restart => {
                install_after_restart = true;
                continue;
            }
            ChildStop::Exit(code) => {
                app.exit(code);
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{child_stop, find_node, harden_install_args, installed_version, is_app_bundle, npm_bin, path_from_shell_env, plain_path, prefix_from_exe, prepend_path, read_shell_cache, reads_login_shell, restore_update_snapshot, runtime_dir, save_update_snapshot, shell_entry, sidecar_failure, splash_label, tail_push, tail_text, update_result_body, update_snapshot_dir, with_log, write_shell_cache, write_update_result, ChildStop, Reporter, Splash, Tail, UpdateOutcome, RESTART_EXIT, TAIL_LINES};
    use std::collections::VecDeque;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Mutex};

    #[test]
    fn a_verbatim_windows_path_loses_its_prefix() {
        // Windows only: elsewhere the path is what it was.
        let verbatim = Path::new(r"\\?\C:\dir\dev.ts");
        let unc = Path::new(r"\\?\UNC\server\share\dev.ts");
        if cfg!(windows) {
            assert_eq!(plain_path(verbatim), PathBuf::from(r"C:\dir\dev.ts"));
            assert_eq!(plain_path(unc), PathBuf::from(r"\\server\share\dev.ts"));
        } else {
            assert_eq!(plain_path(verbatim), verbatim);
            assert_eq!(plain_path(unc), unc);
        }
    }

    #[test]
    fn a_login_shell_is_asked_on_macos_and_never_on_windows() {
        assert!(reads_login_shell(true, false));
        assert!(!reads_login_shell(true, true));
        assert!(!reads_login_shell(false, false));
        assert!(!reads_login_shell(false, true));
    }

    #[test]
    fn the_tail_keeps_the_last_lines() {
        let tail: Tail = Arc::new(Mutex::new(VecDeque::new()));
        for index in 0..TAIL_LINES + 5 {
            tail_push(&tail, &format!("line {index}"));
        }
        let text = tail_text(&tail);
        let lines: Vec<&str> = text.lines().collect();
        let last = format!("line {}", TAIL_LINES + 4);
        assert_eq!(lines.len(), TAIL_LINES);
        assert_eq!(lines.first().copied(), Some("line 5"));
        assert_eq!(lines.last().copied(), Some(last.as_str()));
    }

    #[test]
    fn a_sidecar_failure_names_the_code_the_tail_and_the_log() {
        let log = Path::new("/tmp/launcher.log");
        let silent = sidecar_failure("stopped before it was ready", None, "", log);
        assert!(silent.contains("no exit code"));
        assert!(silent.contains("It printed nothing."));
        assert!(silent.contains("/tmp/launcher.log"));
        let loud = sidecar_failure("did not become ready in time", Some(1), "sidecar error: boom", log);
        assert!(loud.contains("exit code 1"));
        assert!(loud.contains("sidecar error: boom"));
        assert!(with_log("Mohou needs Node.js 22+", log).contains("/tmp/launcher.log"));
    }

    #[test]
    fn the_reporter_writes_the_log_it_names() {
        let root = std::env::temp_dir().join(format!("mma-launcher-log-{}", std::process::id()));
        let reporter = Reporter::open(&root, false);
        reporter.note("node C:\\Program Files\\nodejs\\node.exe");
        reporter.say("Mohou's sidecar stopped before it was ready");
        let text = fs::read_to_string(reporter.path()).expect("the log is there");
        assert!(text.contains("Program Files"));
        assert!(text.contains("stopped before it was ready"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_result_record_carries_the_code_and_the_versions() {
        let log = Path::new("/tmp/prefix/update.log");
        let failed = update_result_body(log, &UpdateOutcome::Failed {
            code: "exit",
            from: Some("1.0.16"),
            to: Some("1.0.17"),
            rolled_back: true,
            exit_code: Some(1),
        });
        assert_eq!(failed["state"], "failed");
        assert_eq!(failed["code"], "exit");
        assert_eq!(failed["from"], "1.0.16");
        assert_eq!(failed["to"], "1.0.17");
        assert_eq!(failed["rolledBack"], true);
        assert_eq!(failed["exitCode"], 1);
        assert_eq!(failed["log"], "/tmp/prefix/update.log");
        assert!(failed["at"].as_u64().unwrap() > 0);

        let timed_out = update_result_body(log, &UpdateOutcome::Failed {
            code: "timeout",
            from: None,
            to: None,
            rolled_back: true,
            exit_code: None,
        });
        assert!(timed_out.get("exitCode").is_none());
        assert!(timed_out.get("from").is_none());
        assert!(timed_out.get("to").is_none());

        let done = update_result_body(log, &UpdateOutcome::Done { from: Some("1.0.16"), to: Some("1.0.17") });
        assert_eq!(done["state"], "done");
        assert!(done.get("code").is_none());
        assert!(done.get("rolledBack").is_none());
    }

    #[test]
    fn a_result_record_lands_where_the_host_reads_it() {
        let root = std::env::temp_dir().join(format!("mohou-result-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        write_update_result(&root, Path::new("/tmp/update.log"), &UpdateOutcome::Done { from: Some("1.0.16"), to: Some("1.0.17") });
        let text = fs::read_to_string(root.join("update-result.json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["state"], "done");
        assert_eq!(value["to"], "1.0.17");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_installed_version_comes_from_the_shell_manifest() {
        let root = std::env::temp_dir().join(format!("mohou-version-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let shell = root.join("node_modules/@mohou/shell");
        fs::create_dir_all(&shell).unwrap();
        fs::write(shell.join("package.json"), "{\"name\":\"@mohou/shell\",\"version\":\"1.0.17\"}\n").unwrap();
        assert_eq!(installed_version(&root).as_deref(), Some("1.0.17"));
        let _ = fs::remove_dir_all(&root);
        assert!(installed_version(&root).is_none());
    }

    #[test]
    fn restart_code_is_75_and_a_signal_exits() {
        assert_eq!(RESTART_EXIT, 75);
        assert!(matches!(child_stop(Some(75)), ChildStop::Restart));
        assert!(matches!(child_stop(Some(0)), ChildStop::Exit(0)));
        assert!(matches!(child_stop(None), ChildStop::Exit(1)));
    }

    #[test]
    fn a_remembered_shell_path_is_reused_when_node_is_still_there() {
        let root = std::env::temp_dir().join(format!("mohou-shell-cache-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        write_shell_cache(&root, "/Users/me/.nvm/versions/node/v22.23.1/bin:/usr/bin");
        assert_eq!(
            read_shell_cache(&root).as_deref(),
            Some("/Users/me/.nvm/versions/node/v22.23.1/bin:/usr/bin")
        );
        assert_eq!(splash_label("zh-CN", Splash::Environment), "正在检测运行环境");
        assert_eq!(splash_label("en", Splash::Platform), "Starting the platform");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn install_args_omit_peers_and_limit_fetch() {
        let args = harden_install_args(vec!["install".into(), "file:a.tgz".into(), "--no-fund".into()]);
        assert!(args.contains(&"--omit=peer".to_string()));
        assert!(args.contains(&"--fetch-retries=1".to_string()));
        assert!(args.contains(&"--fetch-timeout=20000".to_string()));
        assert!(args.contains(&"--prefer-offline".to_string()));
        let again = harden_install_args(args.clone());
        assert_eq!(again.iter().filter(|arg| *arg == "--omit=peer").count(), 1);
        assert_eq!(again.iter().filter(|arg| *arg == "--prefer-offline").count(), 1);
        let registry = harden_install_args(vec!["install".into(), "@mohou/shell@1.0.0".into()]);
        assert!(!registry.iter().any(|arg| arg == "--prefer-offline"));
        assert_eq!(harden_install_args(vec!["run".into()]), vec!["run".to_string()]);
    }

    #[test]
    fn a_failed_install_restores_the_prefix_manifest() {
        let root = std::env::temp_dir().join(format!("mohou-update-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("package.json"), "{\"version\":\"1\"}\n").unwrap();
        fs::write(root.join("package-lock.json"), "{\"lock\":1}\n").unwrap();
        assert!(save_update_snapshot(&root));
        fs::write(root.join("package.json"), "{\"version\":\"2\"}\n").unwrap();
        restore_update_snapshot(&root);
        assert_eq!(fs::read_to_string(root.join("package.json")).unwrap(), "{\"version\":\"1\"}\n");
        assert_eq!(fs::read_to_string(root.join("package-lock.json")).unwrap(), "{\"lock\":1}\n");
        assert!(!update_snapshot_dir(&root).exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn update_npm_sits_beside_node() {
        let node = if cfg!(windows) {
            Path::new(r"C:\nvm\v22\node.exe")
        } else {
            Path::new("/Users/me/.nvm/versions/node/v22.23.1/bin/node")
        };
        let npm = npm_bin(node);
        assert_eq!(npm.file_name().unwrap(), if cfg!(windows) { "npm.cmd" } else { "npm" });
        assert_eq!(npm.parent(), node.parent());
    }

    #[test]
    fn shell_env_path_is_the_marked_block() {
        let text = "banner\n_MOHOU_SHELL_ENV_\nHOME=/Users/me\nPATH=/Users/me/.nvm/versions/node/v22.23.1/bin:/usr/bin\n_MOHOU_SHELL_ENV_\n";
        assert_eq!(
            path_from_shell_env(text, "_MOHOU_SHELL_ENV_").as_deref(),
            Some("/Users/me/.nvm/versions/node/v22.23.1/bin:/usr/bin")
        );
        assert!(path_from_shell_env("no mark", "_MOHOU_SHELL_ENV_").is_none());
    }

    #[test]
    fn prefix_follows_the_app_bundle_and_a_sibling_directory() {
        let root = std::env::temp_dir().join(format!("mohou-prefix-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let bundle = root.join("Mohou.app/Contents/Resources/prefix/node_modules/@mohou/shell/src");
        fs::create_dir_all(&bundle).unwrap();
        fs::write(bundle.join("dev.ts"), "export {}\n").unwrap();
        let exe = root.join("Mohou.app/Contents/MacOS/Mohou");
        fs::create_dir_all(exe.parent().unwrap()).unwrap();
        fs::write(&exe, "").unwrap();
        let found = prefix_from_exe(&exe).unwrap();
        assert!(shell_entry(&found).is_file());
        assert!(is_app_bundle(&found));
        assert_eq!(
            runtime_dir(&found, None, Path::new("/Users/me")),
            Path::new("/Users/me/.mini-app/runtime")
        );
        assert_eq!(
            runtime_dir(&found, Some("/tmp/rt"), Path::new("/Users/me")),
            Path::new("/tmp/rt")
        );

        let local = root.join("local/prefix/node_modules/@mohou/shell/src");
        fs::create_dir_all(&local).unwrap();
        fs::write(local.join("dev.ts"), "export {}\n").unwrap();
        let local_exe = root.join("local/Mohou");
        fs::write(&local_exe, "").unwrap();
        let sibling = prefix_from_exe(&local_exe).unwrap();
        assert!(!is_app_bundle(&sibling));
        let runtime = runtime_dir(&sibling, None, Path::new("/Users/me"));
        assert_eq!(runtime.file_name().unwrap(), "runtime");
        assert_eq!(runtime.parent().unwrap().file_name().unwrap(), "local");

        let win = root.join("win/Mohou.exe");
        let win_prefix = root.join("win/Resources/prefix/node_modules/@mohou/shell/src");
        fs::create_dir_all(&win_prefix).unwrap();
        fs::write(win_prefix.join("dev.ts"), "export {}\n").unwrap();
        fs::create_dir_all(win.parent().unwrap()).unwrap();
        fs::write(&win, "").unwrap();
        let win_found = prefix_from_exe(&win).unwrap();
        assert!(is_app_bundle(&win_found));
        assert_eq!(
            runtime_dir(&win_found, None, Path::new("/Users/me")),
            Path::new("/Users/me/.mini-app/runtime")
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn finds_an_executable_node_and_prepends_its_bin() {
        let root = std::env::temp_dir().join(format!("mohou-node-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let bin = root.join("bin");
        fs::create_dir_all(&bin).unwrap();
        let node = bin.join(if cfg!(windows) { "node.exe" } else { "node" });
        fs::write(&node, "").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&node).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&node, permissions).unwrap();
        }
        let found = find_node(&bin.display().to_string(), &root).unwrap();
        assert_eq!(found, node);
        let joined = prepend_path("/usr/bin", &bin.display().to_string());
        assert!(joined.starts_with(&bin.display().to_string()));
        assert_eq!(prepend_path(&joined, &bin.display().to_string()), joined);

        let plain = root.join("plain/bin");
        let with_pi = root.join("with-pi/bin");
        fs::create_dir_all(&plain).unwrap();
        fs::create_dir_all(&with_pi).unwrap();
        let plain_node = plain.join("node");
        let pi_node = with_pi.join("node");
        fs::write(&plain_node, "").unwrap();
        fs::write(&pi_node, "").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for path in [&plain_node, &pi_node] {
                let mut permissions = fs::metadata(path).unwrap().permissions();
                permissions.set_mode(0o755);
                fs::set_permissions(path, permissions).unwrap();
            }
        }
        fs::create_dir_all(
            root.join("with-pi/lib/node_modules/@earendil-works/pi-coding-agent"),
        )
        .unwrap();
        let path = format!("{}:{}", plain.display(), with_pi.display());
        assert_eq!(find_node(&path, &root).unwrap(), plain_node);
        let _ = pi_node;
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn finds_pi_in_the_windows_user_npm_prefix() {
        let root = std::env::temp_dir().join(format!("mohou-npm-prefix-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let bin = root.join("bin");
        fs::create_dir_all(&bin).unwrap();
        let node = bin.join(if cfg!(windows) { "node.exe" } else { "node" });
        fs::write(&node, "").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&node).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&node, permissions).unwrap();
        }
        let home = root.join("home");
        fs::create_dir_all(
            home.join("AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent"),
        )
        .unwrap();
        assert_eq!(find_node(&bin.display().to_string(), &home).unwrap(), node);
        let _ = fs::remove_dir_all(&root);
    }
}
