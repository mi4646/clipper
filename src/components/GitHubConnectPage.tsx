// components/GitHubConnectPage.tsx
import React, { useState } from "react";
import { SiGithub } from "react-icons/si"; // 导入 Simple Icons 的 GitHub 图标

interface GitHubConnectPageProps {
  // onConnect 回调函数现在接收 token, owner, repo 三个参数
  onConnect: (token: string, owner: string, repo: string) => void;
}

const GitHubConnectPage: React.FC<GitHubConnectPageProps> = ({ onConnect }) => {
  const [token, setToken] = useState<string>("");
  // 新增状态：存储用户名和仓库名
  const [owner, setOwner] = useState<string>("");
  const [repo, setRepo] = useState<string>("");

  const handleConnect = () => {
    if (!token.trim()) {
      alert("请先输入您的 GitHub Personal Access Token。");
      return;
    }
    if (!owner.trim()) {
      alert("请先输入 GitHub 用户名。");
      return;
    }
    if (!repo.trim()) {
      alert("请先输入仓库名。");
      return;
    }
    // 将 Token, Owner, Repo 都保存到 localStorage
    localStorage.setItem("github_token", token);
    localStorage.setItem("github_owner", owner);
    localStorage.setItem("github_repo", repo);
    // 通知父组件连接成功，并传递所有配置信息
    onConnect(token, owner, repo);
  };

  const handleCreateTokenClick = () => {
    window.open(
      "https://github.com/settings/personal-access-tokens/new",
      "_blank"
    );
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <div className="flex justify-center mb-6">
          {/* 使用 SiGithub 替换原来的 SVG 或 Lucide 图标 */}
          <SiGithub className="h-12 w-12 text-gray-800" />{" "}
          {/* 注意：Simple Icons 图标通常需要设置颜色 */}
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">
          连接 GitHub
        </h1>
        <p className="text-sm text-center text-gray-600 mb-6">
          输入您的 GitHub 个人访问令牌和仓库信息以开始使用
        </p>

        {/* Token 输入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            GitHub Personal Access Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        {/* 用户名输入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            GitHub 用户名
          </label>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="your-github-username"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        {/* 仓库名输入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            仓库名
          </label>
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="your-repo-name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        <button
          onClick={handleConnect}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium text-sm transition duration-200"
        >
          连接到 GitHub →
        </button>

        {/* --- 新增：权限说明提示框 --- */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-sm font-medium text-blue-800 mb-2 flex items-center">
            <svg
              className="w-4 h-4 mr-1"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              ></path>
            </svg>
            设置 Token 权限
          </h3>
          <p className="text-xs text-blue-600 mb-2">
            为了同步功能正常工作，请在创建 Token 时设置以下权限：
          </p>
          <ul className="text-xs text-blue-600 space-y-1">
            <li className="flex items-start">
              <span className="mr-1">•</span>
              <span>
                <strong>Repository permissions (仓库权限):</strong> Contents
                (内容) - <strong>Read and write (读写)</strong>
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-1">•</span>
              <span>选择您要连接的仓库</span>
            </li>
          </ul>
          <button
            onClick={handleCreateTokenClick}
            className="mt-2 text-blue-700 hover:text-blue-900 text-xs font-medium underline"
          >
            前往 GitHub 创建 Fine-grained Token →
          </button>
        </div>
        {/* --- End 新增 --- */}
      </div>
    </div>
  );
};

export default GitHubConnectPage;
