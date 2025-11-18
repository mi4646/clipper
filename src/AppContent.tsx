import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import md5 from "crypto-js/md5";
import AiTip from "./components/AiTip";
import MarkdownRenderer from "./components/MarkdownRenderer";
import { ToastProvider, useToast } from "./components/ToastProvider";

// --- 类型定义 ---
interface Resource {
  title: string;
  summary: string;
  website: string; // 存储域名部分
  github: string; // 存储域名部分
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
  // 注意：这里 resource.website 和 resource.github 现在已经是完整URL
  return `### ${resource.title}\n- ${resource.summary} 🔗 [官网](${
    resource.website
  }) ｜ [GitHub](${resource.github || resource.website})`;
};

// --- 子组件：AppContent，实际的业务逻辑 ---
const AppContent: React.FC = () => {
  const [aiGenerating, setAiGenerating] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [newCategory, setNewCategory] = useState<string>("");

  // 修改 resourceInput 类型注解，website 和 github 现在只存域名
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
      resourceInput.website && // 这里是域名部分
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

  // --- 修改 handleInputChange 函数 ---
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    // 对于 websiteDomain 和 githubDomain，我们只更新 resourceInput 中的域名部分
    if (name === "websiteDomain" || name === "githubDomain") {
      setResourceInput((prev) => ({
        ...prev,
        [name === "websiteDomain" ? "website" : "github"]: value,
      }));
    } else {
      // 其他字段照常处理
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
      !resourceInput.website || // 这里是域名部分，不是完整URL
      !selectedCategory
    ) {
      error("请填写所有必填项（标题、说明、官网、分类）。");
      return;
    }

    try {
      // --- 在生成 Markdown 之前，拼接完整的 URL ---
      // 拼接官网地址
      const fullWebsiteUrl = `${websiteProtocol}${resourceInput.website}`;
      // 拼接 GitHub 地址 (如果存在)
      const fullGithubUrl = resourceInput.github
        ? `https://github.com/${resourceInput.github}`
        : "";

      const newResourceMarkdown = generateMarkdownForResource({
        ...resourceInput,
        website: fullWebsiteUrl, // 使用拼接后的完整 URL
        github: fullGithubUrl, // 使用拼接后的完整 URL
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

      // 清空输入框和协议选择
      setResourceInput({
        title: "",
        summary: "",
        website: "", // 清空域名部分
        github: "", // 清空域名部分
        category: selectedCategory,
      });
      setWebsiteProtocol("https://"); // 重置协议为默认值
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

      // 获取文件内容（使用 mainContent）
      const fileContent = mainContent; // 使用当前编辑的内容
      const fileName = "README.md"; // 固定文件名，或从其他地方获取
      const commitMessage = `Update knowledge base - ${new Date().toISOString()}`;

      // 1. 获取远程文件的 SHA (如果存在)
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
        sha = getContentData.sha; // 获取现有文件的 SHA
      } else if (getContentResponse.status !== 404) {
        // 如果不是 404（文件不存在），则抛出错误
        const errorData = await getContentResponse.json().catch(() => ({})); // 尝试解析错误信息
        throw new Error(
          `获取远程文件信息失败: ${getContentResponse.status} - ${
            errorData.message || getContentResponse.statusText
          }`
        );
      }
      // 如果是 404，则 sha 保持为 null，表示文件不存在，将创建新文件

      // 2. 将内容编码为 base64
      const contentBytes = new TextEncoder().encode(fileContent);
      const contentBase64 = btoa(String.fromCharCode(...contentBytes));

      // 3. 准备请求体
      const body = {
        message: commitMessage,
        content: contentBase64,
        ...(sha && { sha }), // 如果 SHA 存在，则包含在请求体中（用于更新）
      };

      // 4. 上传或更新文件
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
        const errorData = await putResponse.json().catch(() => ({})); // 尝试解析错误信息
        if (putResponse.status === 403) {
          // 特别处理 403 错误
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

      // 同步成功后，清理对应仓库的缓存
      if (owner && repo) {
        clearCacheForRepo(owner, repo);
      }

      success("已成功同步到 GitHub!");
    } catch (err) {
      console.error("同步到 GitHub 失败:", err);
      error(`同步失败: ${(err as Error).message}`);
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
      resourceInput.website || // 这里是域名部分
      resourceInput.github // 这里是域名部分
    ) {
      // --- 修改：在预览时也拼接完整的 URL ---
      const fullWebsiteUrl = resourceInput.website
        ? `${websiteProtocol}${resourceInput.website}`
        : "https://example.com";
      const fullGithubUrl = resourceInput.github
        ? `https://github.com/${resourceInput.github}`
        : "";

      const previewResource = {
        title: resourceInput.title || "(待填写标题)",
        summary: resourceInput.summary || "(待填写说明)",
        website: fullWebsiteUrl, // 使用拼接后的完整 URL
        github: fullGithubUrl, // 使用拼接后的完整 URL
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
  }, [
    mainContent,
    loading,
    loadingRemote,
    resourceInput,
    selectedCategory,
    websiteProtocol,
  ]);

  // 从 localStorage 读取当前的 useRemoteContent 设置，用于 UI 显示
  const currentUseRemoteContent =
    localStorage.getItem("use_remote_content") === "true";

  // 添加生成目录
  const generateToc = useCallback(() => {
    if (!previewContainerRef.current) return;
    const headings = previewContainerRef.current.querySelectorAll(
      "h1, h2, h3, h4, h5, h6"
    );

    // 首先生成基础的 TOC 项
    let items = Array.from(headings).map((heading) => {
      const text = heading.textContent || "";

      // 使用文本的 MD5 值作为 ID
      const id = `h-${md5(text.trim()).toString()}`;

      // 注意：这里先不设置 heading.id，等确保唯一性后再设置
      return { id, text, level: parseInt(heading.tagName.charAt(1)) };
    });

    // 确保 ID 的唯一性 (虽然 MD5 基本唯一，但为了绝对安全仍检查)
    const idCount = new Map<string, number>();
    const uniqueItems = items.map((item) => {
      let newId = item.id;
      let count = idCount.get(newId) || 0;

      // 如果 ID 已存在，追加计数后缀
      while (idCount.has(newId) && idCount.get(newId)! > 0) {
        count++;
        newId = `${item.id}-${count}`;
      }

      // 更新计数
      idCount.set(newId, 0); // 新的唯一 ID 计数设为 0
      return { ...item, id: newId };
    });

    items = uniqueItems;

    // 现在设置 DOM 元素的 ID
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

  // 在预览内容更新后生成目录（保持不变）
  useEffect(() => {
    if (isPreviewModalOpen) {
      const timer = setTimeout(() => {
        generateToc();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isPreviewModalOpen, previewMarkdown, generateToc]);

  const generateAISummary = async (title: string, url: string) => {
    if (!title || !url) {
      setAiError("请先填写标题和地址。");
      return;
    }

    setAiGenerating(true);
    setAiError(null);

    try {
      // 1. 获取补充信息 (示例：仅处理 GitHub)
      let additionalInfo = "";
      const githubMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
      if (githubMatch) {
        const [_, owner, repo] = githubMatch;
        try {
          // 调用 GitHub API 获取仓库描述
          const token = localStorage.getItem("github_token"); // 需要 GitHub Token
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
            // 如果 API 失败，不中断 AI 调用，仅记录
          }
        } catch (err) {
          console.error("Error fetching GitHub repo info:", err);
          // 如果获取失败，不中断 AI 调用，仅记录
        }
      }

      // 2. 构建 Prompt
      const prompt = `根据以下信息，生成一段简洁、准确的中文说明文字（100字以内）。标题: "${title}", URL: "${url}".${additionalInfo} 说明:`;

      // 3. 调用 AI API (示例使用 OpenAI)
      const apiKey = localStorage.getItem("openai_api_key") || "";
      if (!apiKey) {
        throw new Error("OpenAI API Key 未设置。请在设置中配置。");
      }

      const aiResponse = await fetch("/xiangcao/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gemini-2.0-flash", // 或其他模型
          messages: [{ role: "user", content: prompt }],
          max_tokens: 100, // 限制输出长度
          temperature: 0.3, // 控制随机性
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

      // 4. 更新说明字段
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
                <div className="relative">
                  {" "}
                  {/* 使用相对定位容器 */}
                  {/* 说明输入框 - 添加 padding-right 为按钮留出空间 */}
                  <textarea
                    name="summary"
                    value={resourceInput.summary}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                    rows={3}
                    placeholder="例如：轻快纯粹的跨平台 Markdown 编辑器，内置 AI 辅助..."
                  />
                  {/* AI 补充说明按钮和提示图标 - 绝对定位到 textarea 右下角 */}
                  <div className="absolute bottom-1 right-1 flex items-center space-x-1">
                    {" "}
                    {/* 关键修改：使用 absolute 定位，并调整内边距 */}
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
                    {/* 使用封装的 AiTip 组件 */}
                    <AiTip title="AI 提示" content="调用可能产生费用，请注意控制频率。生成内容仅供参考，可能需要微调。"/>
                  </div>
                  {/* 错误信息显示在按钮下方 */}
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
                    {/* 协议选择下拉框 */}
                    <select
                      value={websiteProtocol}
                      onChange={(e) => setWebsiteProtocol(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="https://">https://</option>
                      <option value="http://">http://</option>
                    </select>
                    {/* 域名输入框 */}
                    <input
                      type="text" // 注意：这里类型改为 text，因为用户只需要输入域名
                      name="websiteDomain" // 名称改为 websiteDomain，以区分协议
                      value={resourceInput.website} // 绑定到 resourceInput.website，但只代表域名部分
                      onChange={handleInputChange}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="example.com"
                    />
                  </div>
                </div>

                {/* --- 修改：GitHub 地址输入 --- */}
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
                      name="githubDomain" // 名称保持不变，但含义是 owner/repo
                      value={resourceInput.github} // 绑定到 resourceInput.github，代表 owner/repo 部分
                      onChange={handleInputChange}
                      className="flex-1 px-3 py-2 border border-l-0 border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="owner/repo" // 修改 placeholder
                    />
                  </div>
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

      {/* Footer 底部 */}
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
                            key={item.id} // 现在 ID 是基于内容的 MD5，保证唯一
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
