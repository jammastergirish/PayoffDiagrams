"use client";

import * as React from "react";
import { createContext, useContext, useState, useCallback } from "react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: Toast["type"], duration?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast["type"] = "info", duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm animate-in slide-in-from-right-5 fade-in duration-200 cursor-pointer ${
            toast.type === "success"
              ? "bg-green-500/90 border-green-400/50 text-white"
              : toast.type === "error"
              ? "bg-red-500/90 border-red-400/50 text-white"
              : "bg-slate-800/90 border-white/10 text-white"
          }`}
          onClick={() => onDismiss(toast.id)}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" && <span>✓</span>}
            {toast.type === "error" && <span>✗</span>}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
