import React from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import remarkGfm from "remark-gfm";
import "../assets/css/typora-style.css";

interface MarkdownRendererProps {
  children: string; // Markdown 内容
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ children }) => {
  return (
    <div id="write">
      {" "}
      {/* 应用 typora-style.css 的根容器 */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");

            if (inline || !match) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }

            const language = match?.[1];
            if (!language) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }

            return (
              <SyntaxHighlighter language={language} PreTag="div" {...props}>
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            );
          },
          // 修复无序列表 - 显式设置 list-style
          ul: ({ node, children, ...props }) => (
            <ul
              style={{
                paddingLeft: "30px",
                margin: "1rem 0",
                listStyle: "disc outside",
              }}
              {...props}
            >
              {children}
            </ul>
          ),
          li: ({ node, children, ...props }) => (
            <li style={{ margin: "0.5rem 0" }} {...props}>
              {children}
            </li>
          ),
          // 可选：为有序列表也添加
          ol: ({ node, children, ...props }) => (
            <ol
              style={{
                paddingLeft: "30px",
                margin: "1rem 0",
                listStyle: "decimal outside",
              }}
              {...props}
            >
              {children}
            </ol>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
