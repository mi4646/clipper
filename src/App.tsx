// App.tsx
import React, { useEffect, useState } from "react";
import AppContent from "./AppContent";
import { ToastProvider } from "./components/ToastProvider";
import GitHubConnectPage from "./components/GitHubConnectPage";

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // 检查 localStorage 中是否有 Token
  useEffect(() => {
    const token = localStorage.getItem("github_token");
    if (token) {
      setIsConnected(true);
    }
  }, []);

  // 处理连接成功的回调
  const handleConnectSuccess = (token: string) => {
    console.log("token", token);
    setIsConnected(true);
  };

  return (
    <ToastProvider position="top-center" duration={2000}>
      {isConnected ? (
        <AppContent />
      ) : (
        <GitHubConnectPage onConnect={handleConnectSuccess} />
      )}
    </ToastProvider>
  );
};

export default App;
