import { Toast } from "@base-ui/react/toast";
import type { ReactNode } from "react";

/** Props for {@link ToastProvider}. */
export interface ToastProviderProps {
  children: ReactNode;
}

/** Holds the toast queue; render a {@link Toaster} somewhere inside it. */
export function ToastProvider({ children }: ToastProviderProps) {
  return (
    <Toast.Provider limit={3} timeout={5000}>
      {children}
    </Toast.Provider>
  );
}
