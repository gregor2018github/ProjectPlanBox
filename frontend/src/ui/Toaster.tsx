import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";

import { cx } from "./cx";

/** Renders the toast queue in the bottom-right corner (bottom, full width, on phones). */
export function Toaster() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 outline-none md:left-auto md:w-80">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className={cx(
              "flex items-start gap-3 rounded-lg bg-surface-raised p-3 text-text shadow-md transition-[opacity,transform] duration-(--duration-base) ease-out data-[ending-style]:opacity-0 data-[ending-style]:duration-(--duration-exit) data-[ending-style]:ease-in data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0 dark:inset-ring dark:inset-ring-border",
              toast.type === "error" && "border-l-4 border-danger",
            )}
          >
            <div className="min-w-0 flex-1">
              <Toast.Title className="text-base font-medium" />
              <Toast.Description className="text-sm text-text-muted" />
            </div>
            {toast.actionProps && (
              <Toast.Action className="h-7 shrink-0 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent-subtle coarse:h-11" />
            )}
            <Toast.Close
              aria-label="Dismiss"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-hover hover:text-text coarse:size-11"
            >
              <X size={16} strokeWidth={1.75} aria-hidden />
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
