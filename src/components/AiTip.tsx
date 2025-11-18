// src/components/AiTip.tsx
import React, { useState, Fragment } from "react";
import {
  useFloating,
  useInteractions,
  useHover,
  useFocus,
  useClick,
  useDismiss,
  useRole,
  autoUpdate,
  flip,
  shift,
} from "@floating-ui/react";

interface AiTipProps {
  content?: string;
  className?: string;
  title?: string;
  // 新增：允许用户指定位置
  placement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "top-start"
    | "top-end"
    | "bottom-start"
    | "bottom-end"
    | "left-start"
    | "left-end"
    | "right-start"
    | "right-end";
}

const AiTip: React.FC<AiTipProps> = ({
  content = "",
  className = "",
  title = "",
  placement = "top", // 默认位置
}) => {
  const [open, setOpen] = useState(false);

  const { x, y, strategy, refs, context } = useFloating({
    open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    placement: placement,
    middleware: [
      flip({ padding: 8 }), // 当空间不足时，自动翻转到其他位置
      shift({ padding: 8 }), // 微调位置，避免溢出
    ],
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useHover(context, { move: false }),
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: "tooltip" }),
  ]);

  return (
    <Fragment>
      <button
        ref={refs.setReference}
        className="text-xs text-gray-500 hover:text-gray-700 focus:outline-none"
        type="button"
        aria-label={title}
        {...getReferenceProps()}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={refs.setFloating}
          style={{
            position: strategy,
            top: y ?? 0,
            left: x ?? 0,
            maxWidth: "min(90vw, 300px)",
            minWidth: "120px",
          }}
          className={`z-10 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg shadow-lg text-sm ${className}`}
          {...getFloatingProps()}
        >
          <p className="text-blue-800 whitespace-pre-line word-break break-all overflow-wrap break-word">
            <strong>AI 提示：</strong>
            {content}
          </p>
        </div>
      )}
    </Fragment>
  );
};

export default AiTip;
