// ExitConfirmationModal.tsx
import React, { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { exit } from "@tauri-apps/plugin-process";

// 定义事件监听器类型
type UnlistenFn = () => void;

const ExitConfirmationModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    let unlistenPromise: Promise<UnlistenFn> | null = null;

    const setupListener = async () => {
      unlistenPromise = listen("exit-requested", async () => {
        setIsOpen(true);
      });
    };

    setupListener();

    // 清理函数
    return () => {
      if (unlistenPromise) {
        unlistenPromise.then((unsub: UnlistenFn) => unsub());
      }
    };
  }, []);

  const handleConfirm = async () => {
    setIsOpen(false);
    await exit(0);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {/* 标题栏 */}
        <div className="modal-header">
          <div className="header-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 17C10.02 17 8.5 15.48 8.5 13.5C8.5 11.52 10.02 10 12 10C13.98 10 15.5 11.52 15.5 13.5C15.5 15.48 13.98 17 12 17ZM13 9H11V7H13V9Z"
                fill="#3b82f6"
              />
            </svg>
          </div>
          <h3>提示</h3>
          <button className="close-btn" onClick={handleClose}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
                fill="#6b7280"
              />
            </svg>
          </button>
        </div>

        {/* 内容区 */}
        <div className="modal-body">
          <p>确定退出应用吗？</p>
        </div>

        {/* 按钮区 */}
        <div className="modal-buttons">
          <button className="cancel-btn" onClick={handleCancel}>
            取消
          </button>
          <button className="confirm-btn" onClick={handleConfirm}>
            确定
          </button>
        </div>
      </div>
      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
        }

        .modal-content {
          background: white;
          padding: 0;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          min-width: 300px;
          max-width: 400px;
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
          background-color: #f9fafb;
        }

        .header-icon {
          margin-right: 8px;
          color: #3b82f6;
        }

        .modal-header h3 {
          margin: 0;
          color: #1f2937;
          font-size: 0.875rem; /* 减小标题字体 */
          font-weight: 600;
        }

        .close-btn {
          margin-left: auto;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          color: #6b7280;
          transition: all 0.2s ease;
        }

        .close-btn:hover {
          background-color: #e5e7eb;
          color: #111827;
        }

        .modal-body {
          padding: 16px 20px;
          text-align: center;
        }

        .modal-body p {
          margin: 0;
          color: #374151;
          font-size: 0.875rem; /* 减小正文字体 */
          line-height: 1.4;
        }

        .modal-buttons {
          display: flex;
          gap: 8px; /* 减小按钮间距 */
          padding: 12px 16px;
          border-top: 1px solid #e5e7eb;
          justify-content: flex-end;
        }

        .cancel-btn,
        .confirm-btn {
          padding: 6px 12px; /* 减小按钮内边距 */
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          font-size: 0.875rem; /* 减小按钮字体 */
          transition: all 0.2s ease;
        }

        .cancel-btn {
          background-color: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .cancel-btn:hover {
          background-color: #e5e7eb;
          border-color: #9ca3af;
        }

        .confirm-btn {
          background-color: #3b82f6;
          color: white;
          border: 1px solid #2563eb;
        }

        .confirm-btn:hover {
          background-color: #2563eb;
          border-color: #1d4ed8;
        }
      `}</style>
    </div>
  );
};

export default ExitConfirmationModal;
