// core/tray.rs
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter,
    Manager,
    Runtime,
};

pub fn create_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
    let hide_i = MenuItem::with_id(app, "hide", "隐藏", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

    let _ = TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "quit" => {
                    println!("Quit menu clicked");
                    // 现在 emit 方法应该可用
                    let _ = app.emit("exit-requested", ());
                }
                "show" => {
                    println!("Show menu clicked");
                    match app.get_webview_window("main") {
                        Some(window) => {
                            match window.show() {
                                Ok(_) => println!("Window show called successfully"),
                                Err(e) => println!("Failed to call show on window: {:?}", e),
                            }

                            match window.unminimize() {
                                Ok(_) => println!("Window unminimized"),
                                Err(e) => println!("Failed to unminimize window: {:?}", e),
                            }

                            match window.set_focus() {
                                Ok(_) => println!("Window focus set successfully"),
                                Err(e) => println!("Failed to set focus: {:?}", e),
                            }

                            match window.set_always_on_top(true) {
                                Ok(_) => println!("Window set always on top"),
                                Err(e) => println!("Failed to set always on top: {:?}", e),
                            }

                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_millis(100));
                                let _ = window.set_always_on_top(false);
                            });
                        }
                        None => {
                            println!("Main window not found");
                        }
                    }
                }
                "hide" => {
                    println!("Hide menu clicked");
                    match app.get_webview_window("main") {
                        Some(window) => match window.hide() {
                            Ok(_) => println!("Window hidden successfully"),
                            Err(e) => println!("Failed to hide window: {:?}", e),
                        },
                        None => {
                            println!("Main window not found");
                        }
                    }
                }
                _ => {
                    println!("Unknown menu item clicked: {:?}", event.id);
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                match app.get_webview_window("main") {
                    Some(window) => {
                        println!("Tray icon clicked - attempting to show window");

                        match window.show() {
                            Ok(_) => println!("Tray click - window show called"),
                            Err(e) => println!("Failed to show window from tray: {:?}", e),
                        }

                        match window.unminimize() {
                            Ok(_) => println!("Tray click - window unminimized"),
                            Err(e) => println!("Failed to unminimize from tray: {:?}", e),
                        }

                        match window.set_focus() {
                            Ok(_) => println!("Tray click - window focus set"),
                            Err(e) => println!("Failed to set focus from tray: {:?}", e),
                        }

                        match window.set_always_on_top(true) {
                            Ok(_) => println!("Tray click - window set always on top"),
                            Err(e) => println!("Failed to set always on top from tray: {:?}", e),
                        }

                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            let _ = window.set_always_on_top(false);
                        });
                    }
                    None => {
                        println!("Main window not found on tray click");
                    }
                }
            }
        })
        .build(app);

    Ok(())
}
