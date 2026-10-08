import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

/** Props for {@link TooltipProvider}. */
export interface TooltipProviderProps {
  children: ReactNode;
}

/** Shares tooltip delays app-wide, so moving between tooltips feels instant. */
export function TooltipProvider({ children }: TooltipProviderProps) {
  return (
    <BaseTooltip.Provider delay={500} closeDelay={0}>
      {children}
    </BaseTooltip.Provider>
  );
}
