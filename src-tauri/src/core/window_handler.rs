// 设置窗口关闭保留到系统托盘
use tauri::{AppHandle, Manager, Runtime, WindowEvent};

// core/window_handler.rs
pub fn setup_window_close_handler<R: Runtime>(app: &AppHandle<R>) {
    if let Some(main_window) = app.get_webview_window("main") {
        let app_handle = app.clone();

        main_window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();

                // 通过 app_handle 重新获取窗口引用
                if let Some(window) = app_handle.get_webview_window("main") {
                    if let Err(e) = window.hide() {
                        println!("Window close - Failed to hide window: {:?}", e);
                    }
                }
                println!("Window close - 应用已最小化到系统托盘");
            }
        });
    }
}
