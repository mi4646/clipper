// TocTree.tsx
import React from "react";

interface TocNode {
  id: string;
  text: string;
  level: number;
  children?: TocNode[];
}

interface TocTreeProps {
  nodes: TocNode[];
  expandedItems: Set<string>;
  selectedItem: string | null;
  onToggleExpand: (id: string) => void;
  onNodeClick: (id: string) => void;
  searchQuery: string;
}

const TocTree: React.FC<TocTreeProps> = ({
  nodes,
  expandedItems,
  selectedItem,
  onToggleExpand,
  onNodeClick,
  searchQuery,
}) => {
  const renderNode = (node: TocNode, depth: number = 0) => {
    const isParent = node.level === 2;
    const isExpanded = expandedItems.has(node.id);
    const isSelected = selectedItem === node.id;

    // 如果有搜索查询，只显示匹配的节点及其祖先
    const shouldShow =
      !searchQuery ||
      node.text.toLowerCase().includes(searchQuery.toLowerCase());

    if (!shouldShow && isParent && node.children?.length) {
      // 检查子节点是否有匹配的
      const hasMatchingChild = node.children.some((child) =>
        child.text.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (!hasMatchingChild) {
        return null; // 如果父节点和所有子节点都不匹配，则不显示
      }
    }

    return (
      <li key={node.id} className="mb-1">
        <div
          className={`flex items-center py-1.5 px-3 rounded-md cursor-pointer transition-all duration-200 ${
            isSelected
              ? "bg-blue-100 text-blue-700 border-l-4 border-blue-500" // 选中状态样式
              : "hover:bg-gray-100" // 悬停样式
          }`}
          style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }} // 动态缩进
          onClick={() => onNodeClick(node.id)}
        >
          {/* 展开/折叠图标 (仅对 level === 2 的父级显示) */}
          {isParent && (
            <button
              onClick={(e) => {
                e.stopPropagation(); // 阻止触发父级的点击事件
                onToggleExpand(node.id);
              }}
              className="mr-2 text-gray-500 hover:text-gray-700"
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${
                  isExpanded ? "rotate-90" : ""
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          )}

          {/* 标题文本 */}
          <span className="truncate flex-1">{node.text}</span>
        </div>

        {/* 子项列表 (仅当父级展开时显示) */}
        {isParent && isExpanded && node.children && (
          <ul className="ml-4 space-y-1">
            {" "}
            {/* 子项缩进 */}
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return <ul className="space-y-1">{nodes.map((node) => renderNode(node))}</ul>;
};

export default TocTree;
