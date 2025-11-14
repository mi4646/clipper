import React, { useState, useEffect, useMemo } from "react";
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
      : ["🤖📄 AI & Markdown 编辑器", "📊 AI 模型与评估", "🛠️💻 开发者项目"]
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
    title: "MarkFlowy", // 默认标题
    summary:
      "轻快纯粹的跨平台 Markdown 编辑器，内置 AI 辅助、实时预览、大纲视图和多标签笔记，适合写作与知识管理。", // 默认说明
    website: "https://markflowy.vercel.app/", // 默认官网
    github: "https://github.com/drl990114/MarkFlowy", // 默认 GitHub
    category: "",
  });
  const [kbContent, setKbContent] = useState<string>(""); // 当前知识库内容 (raw markdown)
  // 新增状态：控制是否正在加载数据
  const [loading, setLoading] = useState<boolean>(true);

  // 新增状态：控制是否打开全屏弹窗
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

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
          setSelectedCategory(categories[0]);
        }
      } catch (error) {
        console.error("初始化数据失败:", error);
        error("初始化数据失败，请检查控制台。"); // 使用封装的 error 函数
      } finally {
        // 关键修改：在所有异步操作完成后，设置 loading 为 false
        setLoading(false);
      }
    };

    initializeData();
  }, [error]); // 添加 error 作为依赖，确保函数引用稳定（通常 useToast 返回的函数引用是稳定的）

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setResourceInput((prev) => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategory(e.target.value);
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
      success("资源已添加到知识库！"); // 使用封装的 success 函数

      setResourceInput({
        title: "",
        summary: "",
        website: "",
        github: "",
        category: "",
      });
    } catch (error) {
      console.error("添加资源失败:", error);
      error("添加资源失败，请检查控制台。"); // 使用封装的 error 函数
    }
  };

  const handleAddNewCategory = async () => {
    if (newCategory.trim()) {
      await mockAddCategory(newCategory.trim());
      setNewCategory("");
      await loadCategories(); // 重新加载分类以更新列表
      setSelectedCategory(newCategory.trim());
      success(`分类 "${newCategory.trim()}" 已添加！`); // 使用封装的 success 函数
    }
  };

  // 将加载分类的逻辑提取为一个函数，方便复用
  const loadCategories = async () => {
    try {
      const cats = await mockGetCategories();
      setCategories(cats);
      // 保持当前选中分类，如果它仍然存在
      if (cats.length > 0 && !cats.includes(selectedCategory)) {
        setSelectedCategory(cats[0]);
      }
    } catch (error) {
      console.error("加载分类失败:", error);
      error("加载分类失败，请检查控制台。"); // 使用封装的 error 函数
    }
  };

  const handleSync = async () => {
    dismiss(); // 清除之前的 toast 消息（可选）
    try {
      alert("模拟同步到 GitHub！在 Tauri 版本中将调用 Git 命令。");
      success("已成功模拟同步到 GitHub! (请在 Tauri 版本中实现真实同步)"); // 使用封装的 success 函数
    } catch (error) {
      console.error("同步到 GitHub 失败:", error);
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

    if (
      resourceInput.title &&
      resourceInput.summary &&
      resourceInput.website &&
      selectedCategory
    ) {
      // 获取最新的知识库内容
      let previewContent = getLatestKbContent();

      const newResourceMarkdown = generateMarkdownForResource({
        title: resourceInput.title,
        summary: resourceInput.summary || "（待填写说明）",
        website: resourceInput.website || "https://example.com",
        github: resourceInput.github,
        category: selectedCategory,
      });

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
                <label className="block text-xs font-medium text-gray-700 mb-2">
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
                <label className="block text-xs font-medium text-gray-700 mb-2">
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
                  <label className="block text-xs font-medium text-gray-700 mb-2">
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
                  <label className="block text-xs font-medium text-gray-700 mb-2">
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
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  分类 * (必选)
                </label>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={selectedCategory}
                    onChange={handleCategoryChange}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-36"
                      placeholder="输入新分类名"
                    />
                    <button
                      onClick={handleAddNewCategory}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-2 py-2 rounded-lg text-xs font-medium transition duration-200"
                    >
                      添加
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleAddResource}
                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-medium text-sm transition duration-200 shadow-sm w-full md:w-auto"
              >
                添加到知识库
              </button>
            </div>

            <button
              onClick={handleSync}
              className="mt-3 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg font-medium text-sm transition duration-200 shadow-sm w-full md:w-auto"
            >
              模拟同步到 GitHub
            </button>
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
            <div className="flex-1 border border-gray-200 rounded-lg p-4 bg-gray-50 overflow-y-auto min-h-0">
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
