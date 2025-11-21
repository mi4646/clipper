import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import md5 from "crypto-js/md5";
import AiTip from "./components/AiTip";
import TocTree from "./components/TocTree";
import MarkdownRenderer from "./components/MarkdownRenderer";
import { ToastProvider, useToast } from "./components/ToastProvider";

import { downloadTextFile } from "./utils/fileDownloader";

// --- 类型定义 ---
interface Resource {
  title: string;
  summary: string;
  website: string; // 存储域名部分
  github: string; // 存储域名部分
  category: string;
}

// --- AI 设置类型定义 ---
interface AISettings {
  model: string;
  apiUrl: string;
  apiKey: string;
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
  return `### ${resource.title}
- ${resource.summary} 🔗 [官网](${resource.website}) ｜ [GitHub](${
    resource.github || resource.website
  })`;
};

// --- 子组件：AppContent，实际的业务逻辑 ---
const AppContent: React.FC = () => {
  const [aiGenerating, setAiGenerating] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [newCategory, setNewCategory] = useState<string>("");
  const [resourceInput, setResourceInput] = useState<Resource>({
    title: "",
    summary: "",
    website: "", // 存储域名部分
    github: "", // 存储域名部分
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
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set()); // 记录已展开的父级ID
  const [selectedItem, setSelectedItem] = useState<string | null>(null); // 记录当前选中的条目ID
  const [searchQuery, setSearchQuery] = useState<string>(""); // 记录搜索关键词

  // --- AI 设置状态 ---
  const [isAISettingsModalOpen, setIsAISettingsModalOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AISettings>({
    model: localStorage.getItem("ai_model") || "gemini-2.0-flash", // 默认值
    apiUrl:
      localStorage.getItem("ai_api_url") || "/xiangcao/v1/chat/completions", // 默认值
    apiKey: localStorage.getItem("ai_api_key") || "", // 不设置默认值
  });

  // 协议选择 state
  const [websiteProtocol, setWebsiteProtocol] = useState<string>("https://");

  // 生成缓存键
  const generateCacheKey = (owner: string, repo: string): string => {
    return `github_readme_cache_${owner}_${repo}`;
  };

  // 清理指定仓库的缓存
  const clearCacheForRepo = (owner: string, repo: string): void => {
    const key = generateCacheKey(owner, repo);
    localStorage.removeItem(key);
    console.log(`已清理 ${owner}/${repo} 的缓存`);
  };

  // 从 GitHub 获取 README.md (需要 Token 访问私有仓库，并正确处理中文，带缓存)
  const fetchReadmeFromGithub = async (
    owner: string,
    repo: string
  ): Promise<string> => {
    if (!owner || !repo) {
      throw new Error("GitHub owner 和 repo 不能为空");
    }
    const cacheKey = generateCacheKey(owner, repo);
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
          localStorage.removeItem(cacheKey);
        }
      } catch (e) {
        console.warn("缓存数据解析失败，将重新获取", e);
        localStorage.removeItem(cacheKey);
      }
    }

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
          cleanKbContent = "# 知识库\n" + cleanKbContent;
        }
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
      if (loading) return;
      setLoadingRemote(true);
      try {
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
            cleanContent = "# 知识库\n" + cleanContent;
          }
          content = cleanContent;
        }
        setMainContent(content);
      } catch (err) {
        console.error("获取主内容失败:", err);
        error(`获取主内容失败: ${(err as Error).message}`);
        const stored = localStorage.getItem("clipper_kb_content");
        let cleanContent = (stored || "").trim();
        if (!cleanContent.startsWith("# 知识库")) {
          cleanContent = "# 知识库\n" + cleanContent;
        }
        setMainContent(cleanContent);
      } finally {
        setLoadingRemote(false);
      }
    };
    loadMainContent();
  }, [loading, error]);

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

  // --- 处理 AI 设置输入变化 ---
  const handleAISettingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAiSettings((prev) => ({ ...prev, [name]: value }));
  };

  // --- 保存 AI 设置 ---
  const saveAISettings = () => {
    // 保存到 localStorage
    localStorage.setItem("ai_model", aiSettings.model);
    localStorage.setItem("ai_api_url", aiSettings.apiUrl);
    localStorage.setItem("ai_api_key", aiSettings.apiKey); // 注意：生产环境应更安全地存储
    // 可选：显示保存成功的提示
    success("AI 设置已保存！");
    setIsAISettingsModalOpen(false); // 关闭模态框
  };

  // --- 修改 handleInputChange 函数 ---
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    let processedValue = value;
    if (name === "websiteDomain" || name === "githubDomain") {
      if (name === "websiteDomain") {
        processedValue = processedValue.replace(/^(https?:\/\/)/i, "").trim();
      } else if (name === "githubDomain") {
        processedValue = processedValue
          .replace(/^https:\/\/github\.com\//i, "")
          .trim();
        processedValue = processedValue.replace(/^(https?:\/\/)/i, "").trim();
      }
      setResourceInput((prev) => ({
        ...prev,
        [name === "websiteDomain" ? "website" : "github"]: processedValue,
      }));
    } else {
      setResourceInput((prev) => ({ ...prev, [name]: value }));
    }
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

  // --- 修改 handleAddResource 函数 ---
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
      const fullWebsiteUrl = `${websiteProtocol}${resourceInput.website}`;
      const fullGithubUrl = resourceInput.github
        ? `https://github.com/${resourceInput.github}`
        : "";

      const newResourceMarkdown = generateMarkdownForResource({
        ...resourceInput,
        website: fullWebsiteUrl,
        github: fullGithubUrl,
        category: selectedCategory,
      });

      let updatedContent = mainContent;
      const categoryHeader = `## ${selectedCategory}`;
      if (!updatedContent.includes(categoryHeader)) {
        updatedContent += `\n${categoryHeader}\n${newResourceMarkdown}`;
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
          `\n${newResourceMarkdown}` +
          updatedContent.substring(insertIndex);
      }
      updatedContent = updatedContent.trim().replace(/\n{3,}/g, "\n");

      await mockWriteKb(updatedContent);
      setMainContent(updatedContent);
      success("资源已添加到知识库！");

      setResourceInput({
        title: "",
        summary: "",
        website: "",
        github: "",
        category: selectedCategory,
      });
      setWebsiteProtocol("https://");
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

  // Github API同步成功后清理缓存
  const handleSync = async () => {
    dismiss();
    try {
      const token = localStorage.getItem("github_token");
      const owner = localStorage.getItem("github_owner");
      const repo = localStorage.getItem("github_repo");
      if (!token || !owner || !repo) {
        error("GitHub 配置不完整，请先连接 GitHub。");
        return;
      }

      const fileContent = mainContent;
      const fileName = "README.md";
      const commitMessage = `Update knowledge base - ${new Date().toISOString()}`;

      const getContentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${fileName}`;
      const getContentResponse = await fetch(getContentUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      let sha = null;
      if (getContentResponse.ok) {
        const getContentData = await getContentResponse.json();
        sha = getContentData.sha;
      } else if (getContentResponse.status !== 404) {
        const errorData = await getContentResponse.json().catch(() => ({}));
        throw new Error(
          `获取远程文件信息失败: ${getContentResponse.status} - ${
            errorData.message || getContentResponse.statusText
          }`
        );
      }

      const contentBytes = new TextEncoder().encode(fileContent);
      const contentBase64 = btoa(String.fromCharCode(...contentBytes));

      const body = {
        message: commitMessage,
        content: contentBase64,
        ...(sha && { sha }),
      };

      const putContentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${fileName}`;
      const putResponse = await fetch(putContentUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!putResponse.ok) {
        const errorData = await putResponse.json().catch(() => ({}));
        if (putResponse.status === 403) {
          throw new Error(
            `GitHub API 403 错误: ${
              errorData.message || putResponse.statusText
            }。请检查您的 Personal Access Token 是否具有 'repo' 权限。`
          );
        } else {
          throw new Error(
            `GitHub API 错误: ${putResponse.status} - ${
              errorData.message || putResponse.statusText
            }`
          );
        }
      }
      const putData = await putResponse.json();
      console.log("同步成功:", putData);

      if (owner && repo) {
        clearCacheForRepo(owner, repo);
      }
      success("已成功同步到 GitHub!");
    } catch (err) {
      console.error("同步到 GitHub 失败:", err);
      error(`同步失败: ${(err as Error).message}`);
    }
  };

  const handleDownload = async () => {
    const content = mainContent; // 你的内容
    const filename = "知识库.md";

    try {
      await downloadTextFile(content, filename);
      // 如果 downloadTextFile 成功，这里可以执行后续逻辑
      console.log("下载操作成功完成");
    } catch (error) {
      // 如果 downloadTextFile 失败，这里会捕获错误
      console.error("下载失败:", error);
      // 可以在这里显示错误提示给用户
    }
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
    let baseContent = mainContent;
    if (
      resourceInput.title ||
      resourceInput.summary ||
      resourceInput.website ||
      resourceInput.github
    ) {
      const fullWebsiteUrl = resourceInput.website
        ? `${websiteProtocol}${resourceInput.website}`
        : "https://example.com";
      const fullGithubUrl = resourceInput.github
        ? `https://github.com/${resourceInput.github}`
        : "";

      const previewResource = {
        title: resourceInput.title || "(待填写标题)",
        summary: resourceInput.summary || "(待填写说明)",
        website: fullWebsiteUrl,
        github: fullGithubUrl,
        category: selectedCategory,
      };
      const newResourceMarkdown = generateMarkdownForResource(previewResource);
      const categoryHeader = `## ${selectedCategory}`;
      let updatedContent = baseContent;
      if (!updatedContent.includes(categoryHeader)) {
        updatedContent += `\n${categoryHeader}\n${newResourceMarkdown}`;
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
          `\n${newResourceMarkdown}` +
          updatedContent.substring(insertIndex);
      }
      updatedContent = updatedContent.trim().replace(/\n{3,}/g, "\n");
      baseContent = updatedContent;
    }
    return baseContent;
  }, [
    mainContent,
    loading,
    loadingRemote,
    resourceInput,
    selectedCategory,
    websiteProtocol,
  ]);

  const currentUseRemoteContent =
    localStorage.getItem("use_remote_content") === "true";

  const buildTocTree = useCallback(
    (items: { id: string; text: string; level: number }[]) => {
      if (!items || items.length === 0) return [];

      const tree: any[] = [];
      let currentParent: any = null;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.level === 2) {
          // 如果是2级标题，它就是一个父节点
          currentParent = { ...item, children: [] };
          tree.push(currentParent);
        } else if (item.level > 2 && currentParent) {
          // 如果是3级或更低级别，并且有当前父节点，则将其添加到父节点的children中
          currentParent.children.push(item);
        }
        // 对于1级标题，我们不处理，因为它们不是可折叠的父节点
      }

      return tree;
    },
    []
  );

  // --- 修改 generateToc 函数，确保ID唯一性 ---
  const generateToc = useCallback(() => {
    if (!previewContainerRef.current) return;
    const headings = previewContainerRef.current.querySelectorAll(
      "h1, h2, h3, h4, h5, h6"
    );
    let items = Array.from(headings).map((heading) => {
      const text = heading.textContent || "";
      const id = `h-${md5(text.trim()).toString()}`;
      return { id, text, level: parseInt(heading.tagName.charAt(1)) };
    });

    // 确保ID唯一性 (处理相同标题的情况)
    const idCount = new Map<string, number>();
    const uniqueItems = items.map((item) => {
      const baseId = item.id;
      const currentCount = idCount.get(baseId) || 0;
      let finalId = baseId;
      if (currentCount > 0) {
        // 如果该基础ID已出现过，则生成带计数和时间戳的新ID
        finalId = `${baseId}-${currentCount}-${Date.now()}`;
      }
      idCount.set(baseId, currentCount + 1);
      return { ...item, id: finalId };
    });
    items = uniqueItems;

    items.forEach((item, index) => {
      const heading = headings[index];
      if (heading) {
        heading.id = item.id;
      }
    });

    console.log("toc items", items);
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

  // 在预览内容更新后生成目录
  useEffect(() => {
    if (isPreviewModalOpen) {
      const timer = setTimeout(() => {
        generateToc();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isPreviewModalOpen, previewMarkdown, generateToc]);

  // --- 修改 generateAISummary 函数 ---
  const generateAISummary = async (title: string, url: string) => {
    if (!title || !url) {
      setAiError("请先填写标题和地址。");
      return;
    }
    setAiGenerating(true);
    setAiError(null);
    try {
      let additionalInfo = "";
      const githubMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
      if (githubMatch) {
        const [_, owner, repo] = githubMatch;
        try {
          const token = localStorage.getItem("github_token");
          const headers: HeadersInit = {
            Accept: "application/vnd.github.v3+json",
          };
          if (token) headers["Authorization"] = `Bearer ${token}`;
          const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}`,
            { headers }
          );
          if (response.ok) {
            const data = await response.json();
            additionalInfo = data.description
              ? ` Repository description: ${data.description}.`
              : "";
          } else {
            console.warn(
              `Failed to fetch repo info: ${response.status} ${response.statusText}`
            );
          }
        } catch (err) {
          console.error("Error fetching GitHub repo info:", err);
        }
      }

      const prompt = `根据以下信息，生成一段简洁、准确的中文说明文字（100字以内）。标题: "${title}", URL: "${url}".${additionalInfo} 说明:`;

      // 使用状态中的 AI 设置
      const { model, apiUrl, apiKey } = aiSettings;

      if (!apiKey) {
        throw new Error("AI API Key 未设置。请在 AI 设置中配置。");
      }

      // 注意：这里使用的是状态中的 apiUrl 和 model
      const aiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 100,
          temperature: 0.3,
        }),
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json().catch(() => ({}));
        throw new Error(
          `AI API 错误: ${aiResponse.status} - ${
            errorData.error?.message || aiResponse.statusText
          }`
        );
      }
      const data = await aiResponse.json();
      const generatedSummary = data.choices[0].message.content.trim();

      setResourceInput((prev) => ({ ...prev, summary: generatedSummary }));
      success("AI 说明已生成！");
    } catch (err) {
      console.error("AI 生成失败:", err);
      const errorMessage = `AI 生成失败: ${(err as Error).message}`;
      setAiError(errorMessage);
      error(errorMessage);
    } finally {
      setAiGenerating(false);
    }
  };

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
          {currentUseRemoteContent && (
            <div className="mt-1 text-xs text-gray-500 text-center">
              当前连接: {localStorage.getItem("github_owner")}/
              {localStorage.getItem("github_repo")}
            </div>
          )}
          {/* --- 新增：AI 设置按钮 --- */}
          <div className="mt-2 text-center">
            <button
              onClick={() => setIsAISettingsModalOpen(true)}
              className="inline-flex items-center px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-300"
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              AI 设置
            </button>
          </div>
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
                <div className="relative">
                  <textarea
                    name="summary"
                    value={resourceInput.summary}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                    rows={3}
                    placeholder="例如：轻快纯粹的跨平台 Markdown 编辑器，内置 AI 辅助..."
                  />
                  <div className="absolute bottom-1 right-1 flex items-center space-x-1">
                    <button
                      onClick={() =>
                        generateAISummary(
                          resourceInput.title,
                          resourceInput.website || resourceInput.github
                        )
                      }
                      disabled={
                        aiGenerating ||
                        !resourceInput.title ||
                        (!resourceInput.website && !resourceInput.github)
                      }
                      className={`text-xs ${
                        aiGenerating ||
                        !resourceInput.title ||
                        (!resourceInput.website && !resourceInput.github)
                          ? "text-gray-400 cursor-not-allowed"
                          : "text-blue-600 hover:text-blue-800"
                      }`}
                    >
                      {aiGenerating ? "AI 生成中..." : "AI 补充说明"}
                    </button>
                    <AiTip
                      title="AI 提示"
                      content="调用可能产生费用，请注意控制频率。生成内容仅供参考，可能需要微调。"
                    />
                  </div>
                  {aiError && (
                    <p className="text-xs text-red-500 mt-1 ml-2">{aiError}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-900 mb-2">
                    官网地址 * (必填)
                  </label>
                  <div className="flex">
                    <select
                      value={websiteProtocol}
                      onChange={(e) => setWebsiteProtocol(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="https://">https://</option>
                      <option value="http://">http://</option>
                    </select>
                    <input
                      type="text"
                      name="websiteDomain"
                      value={resourceInput.website}
                      onChange={handleInputChange}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-900 mb-2">
                    GitHub 地址 (可选)
                  </label>
                  <div className="flex items-center">
                    <span className="px-3 py-2 border border-r-0 border-gray-300 rounded-l-lg bg-gray-100 text-sm text-gray-600">
                      https://github.com/
                    </span>
                    <input
                      type="text"
                      name="githubDomain"
                      value={resourceInput.github}
                      onChange={handleInputChange}
                      className="flex-1 px-3 py-2 border border-l-0 border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="owner/repo"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-2">
                  分类 * (必选)
                </label>
                <div className="flex space-x-2">
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
            <div
              ref={previewContainerRef}
              className="flex-1 border border-gray-200 rounded-lg p-4 bg-gray-50 overflow-y-auto min-h-0"
            >
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
      {/* Footer 底部 */}
      <footer className="text-center text-xs text-gray-500 py-3 border-t border-gray-200 bg-white">
        Clipper — 为思想留光。{" "}
        <span className="text-gray-400">© {new Date().getFullYear()}</span>
      </footer>

      {/* --- 新增：AI 设置模态框 --- */}
      {isAISettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">AI 设置</h3>
              <button
                onClick={() => setIsAISettingsModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  模型名称
                </label>
                <input
                  type="text"
                  name="model"
                  value={aiSettings.model}
                  onChange={handleAISettingsChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="例如: gemini-2.0-flash"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API 地址
                </label>
                <input
                  type="text"
                  name="apiUrl"
                  value={aiSettings.apiUrl}
                  onChange={handleAISettingsChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="例如: https://api.example.com/v1/chat/completions"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  name="apiKey"
                  value={aiSettings.apiKey}
                  onChange={handleAISettingsChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="输入您的 API Key"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsAISettingsModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveAISettings}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模态框 (保持原有) */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 flex bg-black bg-opacity-50">
          <div className="flex flex-col w-full h-full relative">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-white shadow-sm z-10">
              <div className="flex items-center space-x-4">
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
            <div className="flex-1 overflow-hidden relative">
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
              {isTocOpen && (
                <div
                  ref={tocRef}
                  className="absolute right-0 top-0 h-full w-80 bg-white border-l border-gray-200 overflow-y-auto shadow-lg z-0"
                >
                  {/* 搜索框 */}
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search headings..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <svg
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* 目录列表 */}
                  <div className="p-2">
                    {tocItems.length > 0 ? (
                      <TocTree
                        nodes={buildTocTree(tocItems)} // 构建目录树
                        expandedItems={expandedItems}
                        selectedItem={selectedItem}
                        onToggleExpand={(id) => {
                          const newExpanded = new Set(expandedItems);
                          if (newExpanded.has(id)) {
                            newExpanded.delete(id);
                          } else {
                            newExpanded.add(id);
                          }
                          setExpandedItems(newExpanded);
                        }}
                        onNodeClick={(id) => {
                          setSelectedItem(id);
                          scrollToHeading(id);
                        }}
                        searchQuery={searchQuery}
                      />
                    ) : (
                      <p className="text-gray-400 text-sm p-3">暂无目录项</p>
                    )}
                  </div>
                </div>
              )}
            </div>
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
