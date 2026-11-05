pub mod backend;

use anyhow::{Context, Result};
use backend::{DesktopBackend, database_path};
use fluentci::server::AppState;
use std::path::PathBuf;
use tauri::{
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    webview::NewWindowResponse,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tokio::runtime::{Handle, Runtime};

#[derive(Clone)]
struct DesktopState {
    api: AppState,
    origin: String,
    runtime: Handle,
}

fn pick_project(app: &AppHandle) {
    let app = app.clone();
    let callback_app = app.clone();
    app.dialog()
        .file()
        .set_title("Open a FluentCI project")
        .pick_folder(move |directory| {
            let Some(directory) = directory.and_then(|path| path.into_path().ok()) else {
                return;
            };
            let state = callback_app.state::<DesktopState>().inner().clone();
            let task_app = callback_app.clone();
            state.runtime.clone().spawn(async move {
                match backend::open_project(&state.api, &directory).await {
                    Ok(project) => {
                        if let Some(window) = task_app.get_webview_window("main")
                            && let Ok(url) =
                                format!("{}/project/{}", state.origin, project.id).parse()
                        {
                            let _ = window.navigate(url);
                            let _ = window.set_focus();
                        }
                    }
                    Err(error) => task_app
                        .dialog()
                        .message(format!("{error:#}"))
                        .title("Could not open project")
                        .show(|_| {}),
                }
            });
        });
}

fn install_menu(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    let open = MenuItem::with_id(
        app,
        "open-project",
        "Open Project…",
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let mut inserted = false;
    for item in menu.items()? {
        if let Some(submenu) = item.as_submenu()
            && submenu.text()? == "File"
        {
            submenu.insert(&open, 0)?;
            submenu.insert(&PredefinedMenuItem::separator(app)?, 1)?;
            inserted = true;
            break;
        }
    }
    if !inserted {
        menu.insert(
            &Submenu::with_items(
                app,
                "File",
                true,
                &[&open, &PredefinedMenuItem::quit(app, None)?],
            )?,
            0,
        )?;
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == "open-project" {
            pick_project(app);
        }
    });
    Ok(())
}

/// Include the usual user tool directories when launching from Finder or a dock.
pub fn tool_path() -> Result<std::ffi::OsString> {
    let mut paths = Vec::new();
    if let Some(home) = dirs::home_dir() {
        paths.extend(
            [".local/bin", ".cargo/bin", ".bun/bin", ".deno/bin"].map(|path| home.join(path)),
        );
    }
    paths.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }
    paths.extend(["/usr/bin", "/bin", "/usr/sbin", "/sbin"].map(PathBuf::from));
    std::env::join_paths(paths).context("Could not prepare the pipeline tool PATH")
}

pub fn run(runtime: &Runtime) -> Result<()> {
    let backend = runtime.block_on(DesktopBackend::start(&database_path()?))?;
    let origin = backend.url();
    let state = DesktopState {
        api: backend.state.clone(),
        origin: origin.clone(),
        runtime: runtime.handle().clone(),
    };
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .setup(move |app| {
            install_menu(app.handle())?;
            let navigation_app = app.handle().clone();
            let external_app = app.handle().clone();
            let allowed_origin = origin.clone();
            #[cfg(target_os = "macos")]
            app.add_capability(
                tauri::ipc::CapabilityBuilder::new("macos-titlebar")
                    .local(false)
                    .remote(format!("{origin}/*"))
                    .window("main")
                    .permission("core:window:allow-start-dragging")
                    .permission("core:window:allow-internal-toggle-maximize"),
            )?;
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin.parse()?))
                .title("FluentCI Studio")
                .theme(Some(tauri::Theme::Dark))
                .inner_size(1280.0, 820.0)
                .min_inner_size(800.0, 560.0)
                .background_color(tauri::window::Color(30, 28, 63, 255))
                .initialization_script(
                    if cfg!(target_os = "macos") {
                        "Object.defineProperties(window, { __FLUENTCI_DESKTOP__: { value: true }, __FLUENTCI_MACOS__: { value: true } });"
                    } else {
                        "Object.defineProperty(window, '__FLUENTCI_DESKTOP__', { value: true });"
                    },
                )
                .on_navigation(move |url| {
                    if url.scheme() == "fluentci-desktop" && url.host_str() == Some("open-project")
                    {
                        pick_project(&navigation_app);
                        return false;
                    }
                    if url.origin().ascii_serialization() == allowed_origin {
                        return true;
                    }
                    if matches!(url.scheme(), "https" | "http") {
                        let _ = navigation_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .on_new_window(move |url, _| {
                    if matches!(url.scheme(), "https" | "http") {
                        let _ = external_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    NewWindowResponse::Deny
                });
            #[cfg(target_os = "macos")]
            let window = window
                .decorations(true)
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true);
            window.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())?;
    app.run_return(|_, _| {});
    runtime.block_on(backend.stop());
    Ok(())
}
