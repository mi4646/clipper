import React, { useState, useEffect, useMemo, useRef } from "react";
import { ToastProvider, useToast } from "./components/ToastProvider";
import MarkdownRenderer from "./components/MarkdownRenderer";

// --- 类型定义 ---
interface Resource {
  title: string;
  summary: string;
  website: string;
  github: string;
  category: string;
}

// --- 模拟 Tauri 命令的函数 (纯前端实现) ---
const mockReadKb = (): Promise<string> => {
  const stored = localStorage.getItem("clipper_kb_content");
  return Promise.resolve(stored || "");
};

const mockWriteKb = (content: string): Promise<void> => {
  localStorage.setItem("clipper_kb_content", content);
  return Promise.resolve();
};

const mockGetCategories = (): Promise<string[]> => {
  const stored = localStorage.getItem("clipper_categories");
  return Promise.resolve(
    stored
      ? JSON.parse(stored)
      : [
          "🤖📄 AI & Markdown 编辑器",
          "📊 AI 模型与评估",
          "🛠️💻 开发者项目",
          "🖥️🧰 软件工具",
          "🌐📝 网站资源",
          "📰📅 周刊",
          "👨‍💻🔧 编程与开发",
          "⚡🔌 效率与插件",
          "🎨🎬 设计与创意",
          "🎵🎶 音乐与视频",
          "🎮🎲 游戏与娱乐",
        ]
  );
};

const mockAddCategory = (name: string): Promise<void> => {
  return mockGetCategories().then((cats) => {
    if (!cats.includes(name)) {
      cats.push(name);
      localStorage.setItem("clipper_categories", JSON.stringify(cats));
    }
  });
};

// --- 生成单个资源的 Markdown 片段 ---
const generateMarkdownForResource = (resource: Resource): string => {
  return `### ${resource.title}\n- ${resource.summary} 🔗 [官网](${
    resource.website
  }) ｜ [GitHub](${resource.github || resource.website})`;
};

// --- 子组件：AppContent，实际的业务逻辑 ---
const AppContent: React.FC = () => {
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [newCategory, setNewCategory] = useState<string>("");
  const [resourceInput, setResourceInput] = useState<Resource>({
    title: "",
    summary: "",
    website: "",
    github: "",
    category: "",
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const isInitialScrollRef = useRef(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { success, error, dismiss } = useToast();

  // --- 新增状态：GitHub 配置 ---
  const [githubOwner, setGithubOwner] = useState<string>(
    () => localStorage.getItem("github_owner") || ""
  );
  const [githubRepo, setGithubRepo] = useState<string>(
    () => localStorage.getItem("github_repo") || ""
  );
  const [useRemoteContent, setUseRemoteContent] = useState<boolean>(
    () => localStorage.getItem("use_remote_content") === "true"
  );
  const [loadingRemote, setLoadingRemote] = useState<boolean>(false);
  const [mainContent, setMainContent] = useState<string>(""); // 存储从本地或远程获取的主内容

  // --- 新增函数：从 GitHub 获取 README.md (需要 Token 访问私有仓库，并正确处理中文) ---
  const fetchReadmeFromGithub = async (
    owner: string,
    repo: string
  ): Promise<string> => {
    if (!owner || !repo) {
      throw new Error("GitHub owner 和 repo 不能为空");
    }

    // 从 Vite 环境变量获取 Token
    const token = import.meta.env.VITE_GITHUB_TOKEN;

    // 构建 API URL
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/README.md`;

    // 构建请求头
    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json", // GitHub API v3
    };

    // 如果 Token 存在，则添加 Authorization 头
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // 发送请求
    const response = await fetch(apiUrl, {
      headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`在仓库 ${owner}/${repo} 中未找到 README.md 文件。`);
      } else if (response.status === 401) {
        throw new Error(`访问被拒绝，Token 可能无效或权限不足。`);
      } else if (response.status === 403) {
        throw new Error(`API 速率限制已达到或 Token 权限不足。`);
      } else {
        throw new Error(
          `获取 README.md 失败: ${response.status} ${response.statusText}`
        );
      }
    }

    const data = await response.json();
    // GitHub API 返回的内容是 base64 编码的
    const base64Content = data.content;

    // --- 正确解码 Base64 并处理 UTF-8 内容 ---
    // 1. 将 Base64 字符串解码为字节数组 (Uint8Array)
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 2. 使用 TextDecoder 将字节数组解码为 UTF-8 字符串
    const decoder = new TextDecoder("utf-8");
    const content = decoder.decode(bytes);
    // --- End 修改 ---

    return content;
  };

  // --- useEffect：初始化加载数据 ---
  useEffect(() => {
    const initializeData = async () => {
      try {
        const [kbContent, categories] = await Promise.all([
          mockReadKb(),
          mockGetCategories(),
        ]);

        let cleanKbContent = kbContent.trim();
        if (!cleanKbContent.startsWith("# 知识库")) {
          cleanKbContent = "# 知识库\n\n" + cleanKbContent;
        }
        // setKbContent(cleanKbContent); // 不再需要原始 kbContent，用 mainContent 替代
        setCategories(categories);

        if (categories.length > 0) {
          const defaultCategory = categories[0];
          setSelectedCategory(defaultCategory);
          setResourceInput((prev) => ({ ...prev, category: defaultCategory }));
        }
      } catch (err) {
        console.error("初始化数据失败:", err);
        error("初始化数据失败，请检查控制台。");
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, [error]);

  // --- 新增 useEffect：根据设置加载主内容 (本地或远程) ---
  useEffect(() => {
    const loadMainContent = async () => {
      if (loading) return; // 等待初始化完成
      setLoadingRemote(true);
      try {
        let content = "";
        if (useRemoteContent && githubOwner && githubRepo) {
          console.log("正在从 GitHub 获取内容...");
          content = await fetchReadmeFromGithub(githubOwner, githubRepo);
        } else {
          console.log("正在从本地获取内容...");
          const stored = localStorage.getItem("clipper_kb_content");
          let cleanContent = (stored || "").trim();
          if (!cleanContent.startsWith("# 知识库")) {
            cleanContent = "# 知识库\n\n" + cleanContent;
          }
          content = cleanContent;
        }
        setMainContent(content);
      } catch (err) {
        console.error("获取主内容失败:", err);
        error(`获取主内容失败: ${(err as Error).message}`);
        // 回退到本地内容
        const stored = localStorage.getItem("clipper_kb_content");
        let cleanContent = (stored || "").trim();
        if (!cleanContent.startsWith("# 知识库")) {
          cleanContent = "# 知识库\n\n" + cleanContent;
        }
        setMainContent(cleanContent);
      } finally {
        setLoadingRemote(false);
      }
    };

    loadMainContent();
  }, [loading, useRemoteContent, githubOwner, githubRepo, error]);

  // --- 新增 useEffect：处理外部点击关闭下拉菜单 ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // --- useEffect：初始化滚动 ---
  useEffect(() => {
    if (
      !loading &&
      !loadingRemote &&
      selectedCategory &&
      previewContainerRef.current &&
      isInitialScrollRef.current
    ) {
      const timer = setTimeout(() => {
        const h2Elements = Array.from(
          previewContainerRef.current!.querySelectorAll("h2")
        );
        const targetElement = h2Elements.find(
          (el) => el.textContent?.trim() === selectedCategory
        );

        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          isInitialScrollRef.current = false;
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [loading, loadingRemote, selectedCategory]);

  // --- useEffect：输入变化时滚动 ---
  useEffect(() => {
    if (
      resourceInput.title &&
      resourceInput.summary &&
      resourceInput.website &&
      selectedCategory &&
      previewContainerRef.current &&
      !isInitialScrollRef.current
    ) {
      requestAnimationFrame(() => {
        const h3Elements = Array.from(
          previewContainerRef.current!.querySelectorAll("h3")
        );
        const targetElement = h3Elements.find(
          (el) => el.textContent?.trim() === resourceInput.title
        );

        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      });
    }
  }, [resourceInput, selectedCategory]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setResourceInput((prev) => ({ ...prev, [name]: value }));
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setResourceInput((prev) => ({ ...prev, category }));
    setIsDropdownOpen(false);

    if (previewContainerRef.current) {
      requestAnimationFrame(() => {
        const h2Elements = Array.from(
          previewContainerRef.current!.querySelectorAll("h2")
        );
        const targetElement = h2Elements.find(
          (el) => el.textContent?.trim() === category
        );

        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      });
    }
  };

  const handleAddResource = async () => {
    dismiss();

    if (
      !resourceInput.title ||
      !resourceInput.summary ||
      !resourceInput.website ||
      !selectedCategory
    ) {
      error("请填写所有必填项（标题、说明、官网、分类）。");
      return;
    }

    try {
      const newResourceMarkdown = generateMarkdownForResource({
        ...resourceInput,
        category: selectedCategory,
      });

      // 使用 mainContent 作为基础进行更新
      let updatedContent = mainContent;
      const categoryHeader = `## ${selectedCategory}`;

      if (!updatedContent.includes(categoryHeader)) {
        updatedContent += `\n\n${categoryHeader}\n\n${newResourceMarkdown}`;
      } else {
        const categoryIndex = updatedContent.indexOf(categoryHeader);
        const afterCategoryIndex = updatedContent.indexOf(
          "\n## ",
          categoryIndex + categoryHeader.length
        );
        let insertIndex;
        if (afterCategoryIndex === -1) {
          insertIndex = updatedContent.length;
        } else {
          insertIndex = afterCategoryIndex;
        }
        updatedContent =
          updatedContent.substring(0, insertIndex) +
          `\n\n${newResourceMarkdown}` +
          updatedContent.substring(insertIndex);
      }

      updatedContent = updatedContent.trim().replace(/\n{3,}/g, "\n\n");

      if (!useRemoteContent) {
        // 如果当前使用本地内容，才写入 localStorage
        await mockWriteKb(updatedContent);
      }
      // 无论是否使用远程内容，都更新 mainContent 状态以刷新预览
      setMainContent(updatedContent);
      success("资源已添加到知识库！");

      setResourceInput({
        title: "",
        summary: "",
        website: "",
        github: "",
        category: selectedCategory,
      });
    } catch (err) {
      console.error("添加资源失败:", err);
      error("添加资源失败，请检查控制台。");
    }
  };

  const handleAddNewCategory = async () => {
    if (newCategory.trim()) {
      await mockAddCategory(newCategory.trim());
      setNewCategory("");
      await loadCategories();
      const newCat = newCategory.trim();
      setSelectedCategory(newCat);
      setResourceInput((prev) => ({ ...prev, category: newCat }));
      success(`分类 "${newCat}" 已添加！`);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await mockGetCategories();
      setCategories(cats);
      if (cats.length > 0 && !cats.includes(selectedCategory)) {
        const defaultCat = cats[0];
        setSelectedCategory(defaultCat);
        setResourceInput((prev) => ({ ...prev, category: defaultCat }));
      }
    } catch (err) {
      console.error("加载分类失败:", err);
      error("加载分类失败，请检查控制台。");
    }
  };

  const handleSync = async () => {
    dismiss();
    try {
      alert("模拟同步到 GitHub！在 Tauri 版本中将调用 Git 命令。");
      success("已成功模拟同步到 GitHub! (请在 Tauri 版本中实现真实同步)");
    } catch (err) {
      console.error("同步到 GitHub 失败:", err);
      error("同步到 GitHub 失败，请检查 Git 配置和网络。");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([mainContent], {
      type: "text/markdown;charset=utf-8",
    }); // 使用 mainContent
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "知识库.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openFullscreenModal = () => {
    setIsPreviewModalOpen(true);
  };

  const closeFullscreenModal = () => {
    setIsPreviewModalOpen(false);
  };

  // --- 修改：previewMarkdown 基于 mainContent 计算 ---
  const previewMarkdown = useMemo(() => {
    if (loading || loadingRemote) {
      return loadingRemote ? "正在加载远程内容..." : "";
    }

    let baseContent = mainContent; // 使用 mainContent 作为基础

    // 在 baseContent 上叠加本地预览
    if (
      resourceInput.title ||
      resourceInput.summary ||
      resourceInput.website ||
      resourceInput.github
    ) {
      // 使用占位符值来生成预览内容，即使字段为空
      const previewResource = {
        title: resourceInput.title || "(待填写标题)",
        summary: resourceInput.summary || "(待填写说明)",
        website: resourceInput.website || "https://example.com",
        github: resourceInput.github || "",
        category: selectedCategory,
      };

      const newResourceMarkdown = generateMarkdownForResource(previewResource);
      const categoryHeader = `## ${selectedCategory}`;

      let updatedContent = baseContent;
      if (!updatedContent.includes(categoryHeader)) {
        updatedContent += `\n\n${categoryHeader}\n\n${newResourceMarkdown}`;
      } else {
        const categoryIndex = updatedContent.indexOf(categoryHeader);
        const afterCategoryIndex = updatedContent.indexOf(
          "\n## ",
          categoryIndex + categoryHeader.length
        );
        let insertIndex;
        if (afterCategoryIndex === -1) {
          insertIndex = updatedContent.length;
        } else {
          insertIndex = afterCategoryIndex;
        }
        updatedContent =
          updatedContent.substring(0, insertIndex) +
          `\n\n${newResourceMarkdown}` +
          updatedContent.substring(insertIndex);
      }

      updatedContent = updatedContent.trim().replace(/\n{3,}/g, "\n\n");
      baseContent = updatedContent;
    }

    return baseContent;
  }, [mainContent, loading, loadingRemote, resourceInput, selectedCategory]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Header - 减少高度 */}
      <header className="py-3 px-6 border-b border-gray-200 bg-white">
        <div className="max-w-[85vw] mx-auto">
          <h1 className="text-2xl font-bold tracking-tight text-gray-800 text-center">
            Clipper
          </h1>
          <p className="mt-1 text-sm text-gray-600 text-center">
            你的智能个人知识库 — 一键收藏，随时查阅 .
          </p>
        </div>
      </header>

      {/* Main Content Area - 添加顶部和底部间距 */}
      <div className="flex-1 flex flex-col overflow-hidden px-4 py-4">
        {/* 两栏布局 */}
        <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden">
          {/* 左侧：添加资源表单 */}
          <div className="lg:w-1/2 bg-white rounded-xl shadow-sm border border-gray-200 p-5 overflow-y-auto">
            <h2 className="text-xl font-semibold text-gray-800 mb-5">
              添加资源
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-2">
                  标题 * (必填)
                </label>
                <input
                  type="text"
                  name="title"
                  value={resourceInput.title}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="例如：MarkFlowy"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-2">
                  说明 * (必填)
                </label>
                <textarea
                  name="summary"
                  value={resourceInput.summary}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                  rows={3}
                  placeholder="例如：轻快纯粹的跨平台 Markdown 编辑器，内置 AI 辅助..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-900 mb-2">
                    官网地址 * (必填)
                  </label>
                  <input
                    type="url"
                    name="website"
                    value={resourceInput.website}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-900 mb-2">
                    GitHub 地址 (可选)
                  </label>
                  <input
                    type="url"
                    name="github"
                    value={resourceInput.github}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="https://github.com/..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-2">
                  分类 * (必选)
                </label>
                <div className="flex space-x-2">
                  {/* **自定义下拉菜单 - 添加 ref** */}
                  <div ref={dropdownRef} className="relative w-64 max-w-full">
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-l-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white flex justify-between items-center"
                    >
                      <span>{selectedCategory || "请选择分类"}</span>
                      <svg
                        className={`fill-current h-4 w-4 transition-transform duration-200 ${
                          isDropdownOpen ? "rotate-180" : ""
                        }`}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </button>

                    {isDropdownOpen && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {categories.map((cat) => (
                          <div
                            key={cat}
                            onClick={() => handleCategorySelect(cat)}
                            className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                              selectedCategory === cat ? "bg-blue-100" : ""
                            }`}
                          >
                            {cat}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* **新分类输入框 + 附加按钮** */}
                  <div className="flex-1 flex">
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-r-none text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="输入新分类名"
                    />
                    <button
                      onClick={handleAddNewCategory}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded-r-lg text-sm font-medium transition duration-200 border-l-0"
                    >
                      添加
                    </button>
                  </div>
                </div>
              </div>

              {/* 操作按钮组 */}
              <div className="flex space-x-2 pt-4">
                <button
                  onClick={handleAddResource}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition duration-200 shadow-sm flex-1"
                >
                  添加到知识库
                </button>
                <button
                  onClick={handleSync}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium text-sm transition duration-200 flex-1"
                >
                  模拟同步到 GitHub
                </button>
              </div>

              {/* --- 新增：GitHub 配置 UI --- */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center space-x-2 mb-2">
                  <input
                    type="checkbox"
                    id="useRemoteToggle"
                    checked={useRemoteContent}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseRemoteContent(checked);
                      localStorage.setItem(
                        "use_remote_content",
                        checked.toString()
                      );
                    }}
                  />
                  <label
                    htmlFor="useRemoteToggle"
                    className="text-sm font-medium text-gray-700"
                  >
                    使用 GitHub 远程内容
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={githubOwner}
                    onChange={(e) => setGithubOwner(e.target.value)}
                    onBlur={(e) =>
                      localStorage.setItem("github_owner", e.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="GitHub 用户名"
                  />
                  <input
                    type="text"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    onBlur={(e) =>
                      localStorage.setItem("github_repo", e.target.value)
                    }
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="仓库名"
                  />
                </div>
                <button
                  onClick={() => {
                    const loadMainContent = async () => {
                      if (useRemoteContent && githubOwner && githubRepo) {
                        setLoadingRemote(true);
                        try {
                          const content = await fetchReadmeFromGithub(
                            githubOwner,
                            githubRepo
                          );
                          setMainContent(content);
                          success("成功刷新 GitHub 内容！");
                        } catch (err) {
                          console.error("刷新失败:", err);
                          error(`刷新失败: ${(err as Error).message}`);
                        } finally {
                          setLoadingRemote(false);
                        }
                      }
                    };
                    loadMainContent();
                  }}
                  disabled={
                    loadingRemote ||
                    !useRemoteContent ||
                    !githubOwner ||
                    !githubRepo
                  }
                  className="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  刷新 GitHub 内容
                </button>
              </div>
              {/* --- End 新增 --- */}
            </div>
          </div>

          {/* 右侧：实时预览区 */}
          <div className="lg:w-1/2 bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-semibold text-gray-800">实时预览</h2>
              <div className="flex space-x-2">
                <button
                  onClick={handleAddResource}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs font-medium transition duration-200"
                >
                  添加到知识库
                </button>
                <button
                  onClick={handleSync}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs font-medium transition duration-200"
                >
                  同步到 GitHub
                </button>
                <button
                  onClick={openFullscreenModal}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs font-medium transition duration-200"
                >
                  全屏查看
                </button>
                <button
                  onClick={handleDownload}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs font-medium transition duration-200"
                >
                  下载 .md
                </button>
              </div>
            </div>

            {/* 预览内容区域 - 占据剩余空间并启用滚动 */}
            <div
              ref={previewContainerRef}
              className="flex-1 border border-gray-200 rounded-lg p-4 bg-gray-50 overflow-y-auto min-h-0"
            >
              {/* --- 修改渲染逻辑 --- */}
              {loading || loadingRemote ? (
                <div className="text-center text-gray-500 py-6">
                  {loadingRemote ? "正在加载远程内容..." : "加载中..."}
                </div>
              ) : (
                <MarkdownRenderer>{previewMarkdown}</MarkdownRenderer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer - 添加上边距 */}
      <footer className="text-center text-xs text-gray-500 py-3 border-t border-gray-200 bg-white">
        Clipper — 为思想留光。{" "}
        <span className="text-gray-400">© {new Date().getFullYear()}</span>
      </footer>

      {/* 模态框 */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800">全屏预览</h3>
              <button
                onClick={closeFullscreenModal}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="flex-1 p-6 overflow-y-auto">
              {/* --- 修改模态框渲染逻辑 --- */}
              {loading || loadingRemote ? (
                <div className="text-center text-gray-500">
                  正在加载远程内容...
                </div>
              ) : (
                <MarkdownRenderer>{previewMarkdown}</MarkdownRenderer>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button
                onClick={handleDownload}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium text-sm"
              >
                下载 .md
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 主 App 组件，包裹 ToastProvider
const App: React.FC = () => {
  return (
    <ToastProvider position="top-center" duration={2000}>
      <AppContent />
    </ToastProvider>
  );
};

export default App;
