// App.tsx
import React, { useEffect, useState } from "react";
import AppContent from "./AppContent";
import { ToastProvider, useToast } from "./components/ToastProvider";
import GitHubConnectPage from "./components/GitHubConnectPage";

// 验证组件
const AppWithVerification: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [verifyingToken, setVerifyingToken] = useState<boolean>(true);
  const { error: showError } = useToast(); // 使用 Toast 组件

  // 检查 localStorage 中是否有 Token 并验证其有效性
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
        // 1. 验证 Token
        const userResponse = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!userResponse.ok) {
          // Token 无效，清除本地存储
          localStorage.removeItem("github_token");
          localStorage.removeItem("github_owner");
          localStorage.removeItem("github_repo");
          setIsConnected(false);
          return;
        }

        // 2. 验证用户存在 (如果提供了 owner)
        if (owner) {
          const userCheckResponse = await fetch(
            `https://api.github.com/users/${owner}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (!userCheckResponse.ok) {
            // 用户不存在或无权限访问，清除本地存储
            localStorage.removeItem("github_token");
            localStorage.removeItem("github_owner");
            localStorage.removeItem("github_repo");
            setIsConnected(false);
            return;
          }
        }

        // 3. 验证仓库存在 (如果提供了 owner 和 repo)
        if (owner && repo) {
          const repoResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (!repoResponse.ok) {
            // 仓库不存在或无权限访问，清除本地存储
            localStorage.removeItem("github_token");
            localStorage.removeItem("github_owner");
            localStorage.removeItem("github_repo");
            setIsConnected(false);
            return;
          }
        }

        // 所有验证都通过
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

  // 处理连接成功的回调
  const handleConnectSuccess = async (
    token: string,
    owner: string,
    repo: string
  ) => {
    console.log("token", token);
    try {
      // 验证新连接的 token、用户和仓库
      const [userRes, ownerRes, repoRes] = await Promise.all([
        fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`https://api.github.com/users/${owner}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
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
    // 可以返回一个加载指示器
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
