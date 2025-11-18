import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const isInitialScrollRef = useRef(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { success, error, dismiss } = useToast();

  const [loadingRemote, setLoadingRemote] = useState<boolean>(false);
  const [mainContent, setMainContent] = useState<string>(""); // 存储从本地或远程获取的主内容

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(true); // 控制目录显示
  const [tocItems, setTocItems] = useState<
    { id: string; text: string; level: number }[]
  >([]); // 目录项
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLDivElement>(null);

  // --- 新增函数：生成缓存键 ---
  const generateCacheKey = (owner: string, repo: string): string => {
    return `github_readme_cache_${owner}_${repo}`;
  };

  // --- 新增函数：清理指定仓库的缓存 ---
  const clearCacheForRepo = (owner: string, repo: string): void => {
    const key = generateCacheKey(owner, repo);
    localStorage.removeItem(key);
    console.log(`已清理 ${owner}/${repo} 的缓存`);
  };

  // --- 新增函数：清理所有缓存 ---
  const clearAllCache = (): void => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("github_readme_cache_")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    console.log("已清理所有 GitHub 缓存");
  };

  // 从 GitHub 获取 README.md (需要 Token 访问私有仓库，并正确处理中文，带缓存)
  const fetchReadmeFromGithub = async (
    owner: string,
    repo: string
  ): Promise<string> => {
    if (!owner || !repo) {
      throw new Error("GitHub owner 和 repo 不能为空");
    }

    // 1. 生成缓存键
    const cacheKey = generateCacheKey(owner, repo);

    // 2. 检查缓存是否存在且未过期 (例如 10 分钟过期时间)
    const cacheEntry = localStorage.getItem(cacheKey);
    if (cacheEntry) {
      try {
        const { content, timestamp } = JSON.parse(cacheEntry);
        const now = new Date().getTime();
        const cacheDuration = 10 * 60 * 1000; // 10分钟，单位毫秒

        if (now - timestamp < cacheDuration) {
          console.log(`从缓存加载 ${owner}/${repo} 的 README.md`);
          return content;
        } else {
          console.log(`缓存已过期，将从 ${owner}/${repo} 重新获取 README.md`);
          // 缓存过期，删除旧缓存
          localStorage.removeItem(cacheKey);
        }
      } catch (e) {
        console.warn("缓存数据解析失败，将重新获取", e);
        // 解析失败，删除损坏的缓存
        localStorage.removeItem(cacheKey);
      }
    }

    // 3. 缓存未命中或已过期，执行 API 调用
    console.log(`从 GitHub API 获取 ${owner}/${repo} 的 README.md`);

    const token = localStorage.getItem("github_token");
    if (!token) {
      throw new Error("GitHub Token 未设置，请先连接 GitHub。");
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/README.md`;

    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
    };
    headers["Authorization"] = `Bearer ${token}`;

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
    const base64Content = data.content;

    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const decoder = new TextDecoder("utf-8");
    const content = decoder.decode(bytes);

    // 4. API 调用成功后，将结果写入缓存
    const cacheData = {
      content: content,
      timestamp: new Date().getTime(), // 存储当前时间戳
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`已缓存 ${owner}/${repo} 的 README.md`);

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
        // 直接从 localStorage 读取配置
        const savedOwner = localStorage.getItem("github_owner") || "";
        const savedRepo = localStorage.getItem("github_repo") || "";

        let content = "";
        if (savedOwner && savedRepo) {
          console.log("正在从 GitHub 获取内容...");
          content = await fetchReadmeFromGithub(savedOwner, savedRepo);
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
  }, [loading, error]); // 移除了 githubOwner, githubRepo, useRemoteContent

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

      // 从 localStorage 读取 useRemoteContent 设置
      await mockWriteKb(updatedContent);
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

  // 同步成功后清理缓存
  const handleSync = async () => {
    dismiss();
    try {
      alert("模拟同步到 GitHub！在 Tauri 版本中将调用 Git 命令。");

      // 模拟同步后，清理对应仓库的缓存
      const savedOwner = localStorage.getItem("github_owner") || "";
      const savedRepo = localStorage.getItem("github_repo") || "";
      if (savedOwner && savedRepo) {
        clearCacheForRepo(savedOwner, savedRepo);
      }

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

  // 检查URL参数来初始化全屏状态
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const shouldOpenFullscreen = urlParams.get("fullscreen") === "true";
    if (shouldOpenFullscreen) {
      setIsPreviewModalOpen(true);
    }
  }, []);

  // 修改打开全屏预览的函数
  const openFullscreenModal = () => {
    setIsPreviewModalOpen(true);
    // 更新URL参数
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set("fullscreen", "true");
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${urlParams.toString()}`
    );
  };

  // 修改关闭全屏预览的函数
  const closeFullscreenModal = () => {
    setIsPreviewModalOpen(false);
    // 移除URL参数
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.delete("fullscreen");
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${
        urlParams.toString() ? "?" + urlParams.toString() : ""
      }`
    );
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

  // 从 localStorage 读取当前的 useRemoteContent 设置，用于 UI 显示
  const currentUseRemoteContent =
    localStorage.getItem("use_remote_content") === "true";

  // 添加生成目录
  const generateToc = useCallback(() => {
    if (!previewContainerRef.current) return;

    const headings = previewContainerRef.current.querySelectorAll(
      "h1, h2, h3, h4, h5, h6"
    );
    const items = Array.from(headings).map((heading) => {
      const text = heading.textContent || "";
      const id = text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "");
      heading.id = id;
      return { id, text, level: parseInt(heading.tagName.charAt(1)) };
    });

    setTocItems(items);
  }, [previewMarkdown]);

  // 添加滚动到标题
  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element && previewContainerRef.current) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      element.classList.add("bg-yellow-100");
      setTimeout(() => {
        element.classList.remove("bg-yellow-100");
      }, 1500);
    }
  };

  // 在预览内容更新后生成目录（保持不变）
  useEffect(() => {
    if (isPreviewModalOpen) {
      const timer = setTimeout(() => {
        generateToc();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isPreviewModalOpen, previewMarkdown, generateToc]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900">
      <header className="py-3 px-6 border-b border-gray-200 bg-white">
        <div className="max-w-[85vw] mx-auto">
          <h1 className="text-2xl font-bold tracking-tight text-gray-800 text-center">
            Clipper
          </h1>
          <p className="mt-1 text-sm text-gray-600 text-center">
            你的智能个人知识库 — 一键收藏，随时查阅 .
          </p>
          {/* --- 新增：显示当前连接的仓库信息 --- */}
          {currentUseRemoteContent && (
            <div className="mt-1 text-xs text-gray-500 text-center">
              当前连接: {localStorage.getItem("github_owner")}/
              {localStorage.getItem("github_repo")}
            </div>
          )}
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
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition duration-200 flex-1"
                >
                  模拟同步到 GitHub
                </button>
              </div>

              {/* --- 移除：GitHub 配置 UI --- */}
              {/* 原来的 GitHub 配置部分已完全删除 */}
              {/* --- End 移除 --- */}
            </div>
          </div>

          {/* 右侧：实时预览区 */}
          <div className="lg:w-1/2 bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-semibold text-gray-800">实时预览</h2>
              <div className="flex space-x-2">
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
        <div className="fixed inset-0 z-50 flex bg-black bg-opacity-50">
          {/* 主容器 - 使用相对定位 */}
          <div className="flex flex-col w-full h-full relative">
            {/* 顶部控制栏 */}
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-white shadow-sm z-10">
              <div className="flex items-center space-x-4">
                {/* 优化后的目录切换按钮 - 精确对齐 */}
                <button
                  onClick={() => setIsTocOpen(!isTocOpen)}
                  className="text-gray-700 hover:text-blue-600 w-10 h-10 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center"
                  title={isTocOpen ? "隐藏目录" : "显示目录"}
                >
                  <svg
                    className={`w-5 h-5 transition-transform duration-300 ${
                      isTocOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
                <h3 className="text-lg font-semibold text-gray-800">
                  全屏预览
                </h3>
              </div>
              <button
                onClick={closeFullscreenModal}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                ×
              </button>
            </div>

            {/* 中间内容区域 - 使用相对定位 */}
            <div className="flex-1 overflow-hidden relative">
              {/* 内容区域 */}
              <div
                ref={previewContainerRef}
                className={`h-full overflow-y-auto bg-gray-50 ${
                  isTocOpen ? "w-[calc(100%-20rem)]" : "w-full"
                } absolute left-0 top-0`}
              >
                <div className="p-6">
                  {loading || loadingRemote ? (
                    <div className="text-center text-gray-500 py-6">
                      正在加载远程内容...
                    </div>
                  ) : (
                    <MarkdownRenderer>{previewMarkdown}</MarkdownRenderer>
                  )}
                </div>
              </div>

              {/* 右侧目录区域 - 使用绝对定位 */}
              {isTocOpen && (
                <div
                  ref={tocRef}
                  className="absolute right-0 top-0 h-full w-80 bg-white border-l border-gray-200 overflow-y-auto shadow-lg z-0"
                >
                  {/* 目录标题 */}
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <h4 className="font-bold text-gray-800">目录</h4>
                  </div>

                  {/* 目录内容 */}
                  <div className="p-2">
                    {tocItems.length > 0 ? (
                      <ul className="space-y-1">
                        {tocItems.map((item) => (
                          <li
                            key={item.id}
                            className={`py-1.5 px-3 rounded-md cursor-pointer transition-all duration-200 ${
                              item.level === 1
                                ? "pl-3 font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border-l-4 border-blue-500 shadow-sm"
                                : item.level === 2
                                ? "pl-5 text-gray-800 hover:bg-blue-50 hover:text-blue-700"
                                : item.level === 3
                                ? "pl-7 text-gray-600 hover:bg-gray-100"
                                : "pl-9 text-gray-500 hover:bg-gray-100"
                            }`}
                            onClick={() => scrollToHeading(item.id)}
                          >
                            {item.text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-400 text-sm p-3">暂无目录项</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 底部操作栏 */}
            <div className="p-4 border-t border-gray-200 bg-white z-10">
              <button
                onClick={handleDownload}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
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
