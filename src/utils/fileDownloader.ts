// src/utils/fileDownloader.ts
import { isTauri } from "@tauri-apps/api/core";
import { downloadDir, join } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { message } from "@tauri-apps/plugin-dialog";

/**
 * 通用下载函数，支持 Tauri 和浏览器环境
 * @param {string} content - 要下载的文本内容
 * @param {string} filename - 要保存的文件名
 * @returns {Promise<void>} - 返回一个 Promise，成功时 resolve，失败时 reject
 */
export async function downloadTextFile(
  content: string,
  filename: string
): Promise<void> {
  if (isTauri()) {
    console.log(`Tauri 环境: 准备下载 ${filename}`);
    try {
      const downloadPath = await downloadDir();
      console.log("下载目录路径:", downloadPath);

      const filePath = await join(downloadPath, filename);
      console.log("完整文件路径:", filePath);

      await writeTextFile(filePath, content, {});
      console.log(`Tauri 下载完成: ${filePath}`);

      // --- 添加通知 ---
      await message(`文件已下载到: ${filePath}`, {
        title: "下载完成",
        kind: "info", // 可选: "info", "warning", "error", "question"
      });
      // --- 添加通知 ---
    } catch (error: unknown) {
      // 使用 unknown 类型捕获错误
      console.error(`Tauri 下载失败:`, error);
      // 也可以在失败时通知用户
      const errorMessage =
        (error as Error)?.message || String(error) || "未知错误";
      await message(`下载失败: ${errorMessage}`, {
        title: "下载失败",
        kind: "error",
      });
      throw error; // 重新抛出错误，让调用方处理
    }
  } else {
    console.log(`浏览器环境: 准备下载 ${filename}`);
    try {
      const blob = new Blob([content], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`浏览器下载触发: ${filename}`);
      // 浏览器有自己的下载提示，通常无需额外通知
    } catch (error: unknown) {
      console.error(`浏览器下载失败:`, error);
      const errorMessage =
        (error as Error)?.message || String(error) || "未知错误";
      throw new Error(errorMessage); // 抛出标准 Error 对象
    }
  }
}
