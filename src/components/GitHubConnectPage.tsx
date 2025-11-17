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
      "https://github.com/settings/personal-access-tokens/new?scopes=repo,user&description=Clipper%20Access%20Token",
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

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-800 mb-2">
            如何创建 GitHub token:
          </h3>
          <ol className="text-xs text-gray-600 space-y-1">
            <li>
              1. 访问 GitHub Settings → Developer settings → Personal access
              tokens
            </li>
            <li>2. 点击 “Generate new token (classic)”</li>
            <li>
              3. 选择权限范围：{" "}
              <code className="bg-gray-200 px-1 rounded">repo</code> 和{" "}
              <code className="bg-gray-200 px-1 rounded">user</code>
            </li>
            <li>4. 复制生成的 token 并粘贴到上方</li>
          </ol>
          <button
            onClick={handleCreateTokenClick}
            className="mt-2 text-blue-600 hover:text-blue-800 text-xs font-medium"
          >
            在 GitHub 上创建 token →
          </button>
        </div>
      </div>
    </div>
  );
};

export default GitHubConnectPage;
