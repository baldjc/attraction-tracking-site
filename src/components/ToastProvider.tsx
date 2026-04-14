"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CheckCircleIcon, XCircleIcon, InformationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    success: (msg) => addToast("success", msg),
    error: (msg) => addToast("error", msg),
    info: (msg) => addToast("info", msg),
  };

  const icons = {
    success: <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />,
    error: <XCircleIcon className="w-5 h-5 text-red-500 shrink-0" />,
    info: <InformationCircleIcon className="w-5 h-5 text-[#6ba3c7] shrink-0" />,
  };

  const borderColors = {
    success: "border-l-4 border-l-green-500",
    error: "border-l-4 border-l-red-500",
    info: "border-l-4 border-l-[#6ba3c7]",
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 bg-white dark:bg-[#1a2433] ${borderColors[t.type]} rounded-lg shadow-xl px-4 py-3 min-w-[280px] max-w-[400px] animate-slide-in-right`}
          >
            {icons[t.type]}
            <p className="flex-1 text-sm text-[#2f3437] dark:text-[#e2e8f0]">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-[#2f3437]/30 hover:text-[#2f3437]/60 dark:text-white/30 dark:hover:text-white/60 shrink-0"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
