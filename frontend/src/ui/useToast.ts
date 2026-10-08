import { Toast } from "@base-ui/react/toast";
import { useMemo } from "react";

/** What a toast says and offers. */
export interface ToastOptions {
  title: string;
  description?: string;
  /** "error" adds a danger accent; errors also stay a little longer. */
  tone?: "default" | "error";
  /** One action, typically "Undo" or "Retry". */
  action?: { label: string; onClick: () => void };
}

/** Shows toasts; returns the toast's id from `show`. */
export function useToast(): { show: (options: ToastOptions) => string } {
  const manager = Toast.useToastManager();
  return useMemo(
    () => ({
      show: ({ title, description, tone = "default", action }: ToastOptions) =>
        manager.add({
          title,
          ...(description !== undefined && { description }),
          type: tone,
          ...(tone === "error" && { timeout: 8000, priority: "high" as const }),
          ...(action && { actionProps: { children: action.label, onClick: action.onClick } }),
        }),
    }),
    [manager],
  );
}
