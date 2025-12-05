// App.tsx（部分修改）
import React, { useEffect, useState } from "react";
import AppContent from "./AppContent";
import { ToastProvider, useToast } from "./components/ToastProvider";
import GitHubConnectPage from "./components/GitHubConnectPage";
import ExitConfirmationModal from "./components/ExitConfirmationModal";

// ✅ 新增：导入 Tauri updater 和 process
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// 自定义更新确认对话框（轻量级）
const UpdateDialog: React.FC<{
  version: string;
  notes: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ version, notes, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          发现新版本！
        </h3>
        <p className="text-gray-700 mb-1">版本：v{version}</p>
        {notes && (
          <p className="text-gray-600 text-sm mt-2 whitespace-pre-wrap">
            {notes}
          </p>
        )}
        <div className="mt-4 flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            稍后
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            立即更新
          </button>
        </div>
      </div>
    </div>
  );
};

const AppWithVerification: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [verifyingToken, setVerifyingToken] = useState<boolean>(true);
  const [updateAvailable, setUpdateAvailable] = useState<{
    version: string;
    body: string | null;
  } | null>(null);
  const { error: showError, success: showSuccess } = useToast();

  // 🆕 新增：检查更新函数
  const checkForUpdate = async () => {
    try {
      const update = await check();
      if (update?.shouldUpdate) {
        setUpdateAvailable({
          version: update.manifest?.version || "未知",
          body: update.manifest?.body || null,
        });
      }
    } catch (err) {
      console.warn("检查更新失败:", err);
      // 可选：showError('检查更新失败');
    }
  };

  // 验证 GitHub 连接（不变）
  useEffect(() => {
    const verifyConnection = async () => {
      const token = localStorage.getItem("github_token");
      const owner = localStorage.getItem("github_owner");
      const repo = localStorage.getItem("github_repo");

      if (!token) {
        setIsConnected(false);
        setVerifyingToken(false);
        return;
      }

      try {
        const userResponse = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!userResponse.ok) {
          localStorage.removeItem("github_token");
          localStorage.removeItem("github_owner");
          localStorage.removeItem("github_repo");
          setIsConnected(false);
          return;
        }

        if (owner) {
          const userCheckResponse = await fetch(
            `https://api.github.com/users/${owner}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (!userCheckResponse.ok) {
            localStorage.removeItem("github_token");
            localStorage.removeItem("github_owner");
            localStorage.removeItem("github_repo");
            setIsConnected(false);
            return;
          }
        }

        if (owner && repo) {
          const repoResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (!repoResponse.ok) {
            localStorage.removeItem("github_token");
            localStorage.removeItem("github_owner");
            localStorage.removeItem("github_repo");
            setIsConnected(false);
            return;
          }
        }

        setIsConnected(true);
      } catch (error) {
        console.error("验证 GitHub 连接时出错:", error);
        setIsConnected(false);
      } finally {
        setVerifyingToken(false);
      }
    };

    verifyConnection();
  }, [showError]);

  // 🆕 新增：在连接成功后检查更新（仅一次）
  useEffect(() => {
    if (isConnected && !verifyingToken) {
      checkForUpdate();
    }
  }, [isConnected, verifyingToken]);

  // 🆕 新增：执行更新
  const handleUpdate = async () => {
    try {
      const update = await check();
      if (!update?.shouldUpdate) return;

      showSuccess("正在下载更新...");
      await update.downloadAndInstall((event) => {
        // 可选：显示进度（你已有 Toast，也可忽略）
        if (event.event === "Finished") {
          showSuccess("更新下载完成，正在重启...");
        }
      });

      await relaunch();
    } catch (err) {
      console.error("更新失败:", err);
      showError("更新失败，请稍后重试。");
      setUpdateAvailable(null);
    }
  };

  const handleConnectSuccess = async (
    token: string,
    owner: string,
    repo: string
  ) => {
    try {
      const [userRes, ownerRes, repoRes] = await Promise.all([
        fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`https://api.github.com/users/${owner}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (userRes.ok && ownerRes.ok && repoRes.ok) {
        setIsConnected(true);
      } else {
        const errorDetails = [];
        if (!userRes.ok) errorDetails.push("Token 无效");
        if (!ownerRes.ok) errorDetails.push("用户不存在");
        if (!repoRes.ok) errorDetails.push("仓库不存在");
        showError(`连接验证失败: ${errorDetails.join(", ")}。请检查您的信息。`);
      }
    } catch (error) {
      console.error("连接后验证时出错:", error);
      showError("连接后验证时出错，请重试。");
    }
  };

  if (verifyingToken) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-gray-600">验证连接中...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {isConnected ? (
        <AppContent />
      ) : (
        <GitHubConnectPage onConnect={handleConnectSuccess} />
      )}
      <ExitConfirmationModal />

      {/* 🆕 弹出更新对话框 */}
      {updateAvailable && (
        <UpdateDialog
          version={updateAvailable.version}
          notes={updateAvailable.body}
          onConfirm={handleUpdate}
          onCancel={() => setUpdateAvailable(null)}
        />
      )}
    </>
  );
};

const App: React.FC = () => {
  return (
    <ToastProvider position="top-center" duration={2000}>
      <AppWithVerification />
    </ToastProvider>
  );
};

export default App;
