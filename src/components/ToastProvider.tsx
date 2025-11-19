// src/components/ToastProvider.tsx
import React, { createContext, type ReactNode, useContext } from "react";
import toast, { Toaster } from "react-hot-toast"; // 只导入必要的函数和组件

// 定义 Toast 上下文的类型
// 使用 Parameters<typeof toast> 来获取 toast 函数第二个参数（options）的类型
interface ToastContextType {
  success: (message: string, options?: Parameters<typeof toast>[1]) => void;
  error: (message: string, options?: Parameters<typeof toast>[1]) => void;
  info: (message: string, options?: Parameters<typeof toast>[1]) => void;
  warning: (message: string, options?: Parameters<typeof toast>[1]) => void;
  dismiss: (toastId?: string) => void;
}

// 创建 Context
const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Provider 组件
interface ToastProviderProps {
  children: ReactNode;
  position?:
    | "top-left"
    | "top-center"
    | "top-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";
  duration?: number; // 新增 duration prop
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  position = "top-right", // 默认位置
  duration = 4000, // 默认显示时长 4 秒
}) => {
  // 定义默认的 toast 选项
  const defaultToastOptions = {
    duration: duration, // 使用传入的 duration 作为默认值
    style: {
        background: '#363636',            
        color: '#fff',
    },
    success: {
        style: {              
            background: '#28a745', // Bootstrap success green              
            color: '#fff',
          },
          icon: '✅',
    },
    error: {
      style: {
        background: '#dc3545', // Bootstrap danger red
        color: '#fff',
      },
      icon: '❌',
    },
    info: {
      style: {
        background: '#007bff', // Bootstrap info blue
        color: '#fff',
      },
      icon: 'ℹ️',
    },
    warning: {
      style: {
        background: '#ffc107', // Bootstrap warning yellow
        color: '#333',
      },
      icon: '⚠️',
    },
  };

  const showToast = (
    message: string,
    type: "success" | "error" | "info" | "warning" = "success",
    options?: Parameters<typeof toast>[1]
  ) => {
    // 合并默认选项和用户传入的选项
    // 注意：用户传入的 options 会覆盖默认选项（例如，如果用户设置了 duration）
    const finalOptions = { ...defaultToastOptions, ...options };

    switch (type) {
      case "success":
        toast.success(message, finalOptions);
        break;
      case "error":
        toast.error(message, finalOptions);
        break;
      case "info":
        toast(message, finalOptions); // react-hot-toast 默认样式为 info
        break;
      case "warning":
        // react-hot-toast 没有内置 warning 样式，可以使用 custom 或 info 并自定义样式
        toast(message, { ...finalOptions, icon: "⚠️" }); // 使用图标区分，并合并选项
        break;
      default:
        toast(message, finalOptions);
    }
  };

  const value: ToastContextType = {
    success: (message: string, options?: Parameters<typeof toast>[1]) =>
      showToast(message, "success", options),
    error: (message: string, options?: Parameters<typeof toast>[1]) =>
      showToast(message, "error", options),
    info: (message: string, options?: Parameters<typeof toast>[1]) =>
      showToast(message, "info", options),
    warning: (message: string, options?: Parameters<typeof toast>[1]) =>
      showToast(message, "warning", options),
    dismiss: (toastId?: string) => toast.dismiss(toastId),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* 配置 Toaster */}
      <Toaster
        position={position}
        toastOptions={defaultToastOptions} // 将默认选项也应用到 Toaster 组件
      />
    </ToastContext.Provider>
  );
};

// 自定义 Hook 用于在组件中使用 Toast 功能
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
