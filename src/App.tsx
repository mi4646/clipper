import React, { useState, useEffect, useMemo, useRef } from "react";
import { ToastProvider, useToast } from "./components/ToastProvider";
import MarkdownRenderer from "./MarkdownRenderer";

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
// **恢复原样，不再添加任何 HTML 标签**
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
  // **移除 resourceInput 的默认值**
  const [resourceInput, setResourceInput] = useState<Resource>({
    title: "",
    summary: "",
    website: "",
    github: "",
    category: "",
  });
  const [kbContent, setKbContent] = useState<string>(""); // 当前知识库内容 (raw markdown)
  // 新增状态：控制是否正在加载数据
  const [loading, setLoading] = useState<boolean>(true);

  // 新增状态：控制是否打开全屏弹窗
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // 使用 useRef 来获取预览区域的 DOM 引用
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // **新增状态：控制自定义下拉菜单是否打开**
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // **新增状态：用于标记是否是初始化滚动**
  const isInitialScrollRef = useRef(true);

  // 使用自定义 Hook
  const { success, error, dismiss } = useToast();

  useEffect(() => {
    // 使用立即执行的异步函数来处理异步操作
    const initializeData = async () => {
      try {
        // 同时加载知识库和分类
        const [kbContent, categories] = await Promise.all([
          mockReadKb(),
          mockGetCategories(),
        ]);

        let cleanKbContent = kbContent.trim();
        if (!cleanKbContent.startsWith("# 知识库")) {
          cleanKbContent = "# 知识库\n\n" + cleanKbContent;
        }
        setKbContent(cleanKbContent);
        setCategories(categories);

        if (categories.length > 0) {
          // **关键修改：设置默认选中分类**
          const defaultCategory = categories[0];
          setSelectedCategory(defaultCategory);
          // **同时，更新 resourceInput 的 category 以确保初始渲染包含默认资源**
          setResourceInput((prev) => ({ ...prev, category: defaultCategory }));
        }
      } catch (err) {
        console.error("初始化数据失败:", err);
        error("初始化数据失败，请检查控制台。"); // 使用封装的 error 函数
      } finally {
        // 关键修改：在所有异步操作完成后，设置 loading 为 false
        setLoading(false);
      }
    };

    initializeData();
  }, [error]); // 添加 error 作为依赖，确保函数引用稳定（通常 useToast 返回的函数引用是稳定的）

  // **新增 useEffect：初始化完成后滚动到默认分类**
  useEffect(() => {
    if (
      !loading &&
      selectedCategory &&
      previewContainerRef.current &&
      isInitialScrollRef.current
    ) {
      // 等待DOM完全渲染后执行初始化滚动
      const timer = setTimeout(() => {
        // 查找默认分类的标题元素
        const categoryHeader = `## ${selectedCategory}`;
        const h2Elements = Array.from(
          previewContainerRef.current!.querySelectorAll("h2")
        );
        const targetElement = h2Elements.find(
          (el) => el.textContent?.trim() === selectedCategory
        );

        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
          isInitialScrollRef.current = false; // 标记初始化滚动已完成
        }
      }, 100); // 给一点时间确保DOM渲染完成

      return () => clearTimeout(timer);
    }
  }, [loading, selectedCategory]);

  // **修改 useEffect：当输入或分类变化时，尝试滚动到当前编辑的资源**
  // **依赖于一个包含所有相关字段的对象**
  useEffect(() => {
    // **关键修改：滚动条件中必须包含 resourceInput.title 有值**
    // 这样确保只有当用户开始输入标题（或保留默认标题）时，滚动才执行
    // 这也解决了初始化时，如果 title 为空，则不滚动的问题
    if (
      resourceInput.title && // **确保标题有值才滚动**
      resourceInput.summary &&
      resourceInput.website &&
      selectedCategory && // **确保分类已选择**
      previewContainerRef.current &&
      !isInitialScrollRef.current // **确保不是初始化滚动**
    ) {
      // 等待 DOM 更新完成后再执行滚动
      // 使用 requestAnimationFrame 确保在浏览器下一次重绘之前执行
      requestAnimationFrame(() => {
        // 在预览容器内查找包含当前编辑标题的元素。
        // 由于 Markdown 渲染器会把 ### 标题渲染成 <h3> 标签，我们查找其文本内容。
        const h3Elements = Array.from(
          previewContainerRef.current!.querySelectorAll("h3")
        );
        // 查找文本内容与当前输入标题匹配的 h3 元素
        const targetElement = h3Elements.find(
          (el) => el.textContent?.trim() === resourceInput.title
        );

        if (targetElement) {
          // 找到目标元素后，将其滚动到视口中心
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          // 如果未找到（例如，如果标题为空或格式不匹配），则不滚动
          // console.log("未找到当前编辑的标题元素，跳过滚动。");
        }
      });
    }
    // **修改：依赖项为一个对象，包含所有相关字段**
    // 这样可以减少不必要的触发（相比监听每个字段），同时避免访问未初始化的 previewMarkdown
  }, [resourceInput, selectedCategory]); // 依赖于包含所有相关字段的对象

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setResourceInput((prev) => ({ ...prev, [name]: value }));
  };

  // **自定义下拉菜单的处理函数**
  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setResourceInput((prev) => ({ ...prev, category })); // 同步更新 resourceInput 中的 category
    setIsDropdownOpen(false); // 选择后关闭下拉菜单

    // 选择分类后滚动到该分类
    if (previewContainerRef.current) {
      requestAnimationFrame(() => {
        const h2Elements = Array.from(
          previewContainerRef.current!.querySelectorAll("h2")
        );
        const targetElement = h2Elements.find(
          (el) => el.textContent?.trim() === category
        );

        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }
  };

  const handleAddResource = async () => {
    dismiss(); // 清除之前的 toast 消息（可选，防止堆积）

    if (
      !resourceInput.title ||
      !resourceInput.summary ||
      !resourceInput.website ||
      !selectedCategory
    ) {
      error("请填写所有必填项（标题、说明、官网、分类）。"); // 使用封装的 error 函数
      return;
    }

    try {
      const newResourceMarkdown = generateMarkdownForResource({
        ...resourceInput,
        category: selectedCategory,
      });

      const currentKb = await mockReadKb();
      const categoryHeader = `## ${selectedCategory}`;
      let updatedContent = currentKb;

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
      await mockWriteKb(updatedContent);
      setKbContent(updatedContent);
      success("资源已添加到知识库！"); // 使用封装的 error 函数

      setResourceInput({
        title: "",
        summary: "",
        website: "",
        github: "",
        category: selectedCategory, // 保持当前选中的分类
      });
    } catch (err) {
      console.error("添加资源失败:", err);
      error("添加资源失败，请检查控制台。"); // 使用封装的 error 函数
    }
  };

  const handleAddNewCategory = async () => {
    if (newCategory.trim()) {
      await mockAddCategory(newCategory.trim());
      setNewCategory("");
      await loadCategories(); // 重新加载分类以更新列表
      const newCat = newCategory.trim();
      setSelectedCategory(newCat);
      setResourceInput((prev) => ({ ...prev, category: newCat })); // 同步更新 resourceInput 中的 category
      success(`分类 "${newCat}" 已添加！`); // 使用封装的 success 函数
    }
  };

  // 将加载分类的逻辑提取为一个函数，方便复用
  const loadCategories = async () => {
    try {
      const cats = await mockGetCategories();
      setCategories(cats);
      // 保持当前选中分类，如果它仍然存在
      if (cats.length > 0 && !cats.includes(selectedCategory)) {
        const defaultCat = cats[0];
        setSelectedCategory(defaultCat);
        setResourceInput((prev) => ({ ...prev, category: defaultCat })); // 同步更新 resourceInput 中的 category
      }
    } catch (err) {
      console.error("加载分类失败:", err);
      error("加载分类失败，请检查控制台。"); // 使用封装的 error 函数
    }
  };

  const handleSync = async () => {
    dismiss(); // 清除之前的 toast 消息（可选）
    try {
      alert("模拟同步到 GitHub！在 Tauri 版本中将调用 Git 命令。");
      success("已成功模拟同步到 GitHub! (请在 Tauri 版本中实现真实同步)"); // 使用封装的 success 函数
    } catch (err) {
      console.error("同步到 GitHub 失败:", err);
      error("同步到 GitHub 失败，请检查 Git 配置和网络。"); // 使用封装的 error 函数
    }
  };

  const handleDownload = () => {
    const blob = new Blob([kbContent], { type: "text/markdown;charset=utf-8" });
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

  const previewMarkdown = useMemo(() => {
    if (loading) {
      return "";
    }

    // 在预览计算时直接获取最新的知识库内容
    const getLatestKbContent = (): string => {
      const stored = localStorage.getItem("clipper_kb_content");
      let cleanContent = (stored || "").trim();
      if (!cleanContent.startsWith("# 知识库")) {
        cleanContent = "# 知识库\n\n" + cleanContent;
      }
      return cleanContent;
    };

    // **关键修改：只要用户在输入内容，就显示预览**
    if (
      resourceInput.title ||
      resourceInput.summary ||
      resourceInput.website ||
      resourceInput.github
    ) {
      // 获取最新的知识库内容
      let previewContent = getLatestKbContent();

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

      if (!previewContent.includes(categoryHeader)) {
        previewContent += `\n\n${categoryHeader}\n\n${newResourceMarkdown}`;
      } else {
        const categoryIndex = previewContent.indexOf(categoryHeader);
        const afterCategoryIndex = previewContent.indexOf(
          "\n## ",
          categoryIndex + categoryHeader.length
        );
        let insertIndex;
        if (afterCategoryIndex === -1) {
          insertIndex = previewContent.length;
        } else {
          insertIndex = afterCategoryIndex;
        }
        previewContent =
          previewContent.substring(0, insertIndex) +
          `\n\n${newResourceMarkdown}` +
          previewContent.substring(insertIndex);
      }

      previewContent = previewContent.trim().replace(/\n{3,}/g, "\n\n");

      let cleanPreviewContent = previewContent.trim();
      if (!cleanPreviewContent.startsWith("# 知识库")) {
        cleanPreviewContent = "# 知识库\n\n" + cleanPreviewContent;
      }

      return cleanPreviewContent;
    } else {
      // 如果用户没有输入任何内容，显示原始知识库内容
      return getLatestKbContent();
    }
  }, [
    loading,
    resourceInput.title,
    resourceInput.summary,
    resourceInput.website,
    resourceInput.github,
    selectedCategory,
  ]);

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
                  {/* **自定义下拉菜单** */}
                  <div className="relative w-64 max-w-full">
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

              <div className="flex space-x-2 pt-4">
                <button
                  onClick={handleAddResource}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition duration-200 shadow-sm flex-1"
                >
                  添加到知识库
                </button>
                <button
                  onClick={handleSync}
                  className="bg-purple-600 hover:bg-purple-700  text-white px-4 py-2 rounded-lg font-medium text-sm transition duration-200 flex-1"
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
            {/* 修改：添加 ref */}
            <div
              ref={previewContainerRef}
              className="flex-1 border border-gray-200 rounded-lg p-4 bg-gray-50 overflow-y-auto min-h-0"
            >
              {loading ? (
                <div className="text-center text-gray-500 py-6">加载中...</div>
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

      {/* 模态框保持不变 */}
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
              {loading ? (
                <div className="text-center text-gray-500">加载中...</div>
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
      {" "}
      {/* 将 AppContent 包裹在 ToastProvider 中 */}
      <AppContent />
    </ToastProvider>
  );
};

export default App;
