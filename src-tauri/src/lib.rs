// 导入托盘功能函数
use crate::core::tray::create_tray;

// 声明模块层次结构
// 告诉编译器在 core 目录下有一个 tray.rs 文件作为模块
mod core {
    pub mod tray; // tray 模块被声明为公共的，这样其他模块可以访问
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init()) // 创建默认的 Tauri 应用构建器
        .plugin(tauri_plugin_shell::init()) // 添加 shell 插件，允许应用与系统 shell 交互
        .setup(|app| {
            // 设置回调函数，在应用初始化时执行
            if cfg!(debug_assertions) {
                // 检查是否为调试模式
                // 在调试模式下添加日志插件
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info) // 设置日志级别为 Info
                        .build(),
                )?;
            }

            // 创建系统托盘
            // 调用我们在 tray.rs 中定义的 create_tray 函数
            // 传入应用句柄，函数会创建系统托盘并将其附加到应用
            create_tray(app.handle())?;

            Ok(()) // 返回 Ok 表示 setup 成功
        })
        .run(tauri::generate_context!()) // 运行应用，传入从 tauri.conf.json 生成的上下文
        .expect("error while running tauri application"); // 如果运行失败则 panic
}
