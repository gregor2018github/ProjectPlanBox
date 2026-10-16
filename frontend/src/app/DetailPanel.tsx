import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { DESKTOP_QUERY, useMediaQuery } from "../core/useMediaQuery";
import { cx } from "../ui/cx";
import { IconButton } from "../ui/IconButton";
import { panelTransition } from "../ui/motion";
import { useModules } from "./modulesContext";
import { panelMotion, PHONE_PANEL_CLASS } from "./panelMotion";

const WIDTH = 400;

/** Props for {@link DetailPanel}. */
export interface DetailPanelProps {
  /** The `?item=` search param, e.g. "todos.todo:<id>". */
  item: string | undefined;
  onClose: () => void;
}

/**
 * The optional right-hand panel. The owning module renders the content;
 * an item no module claims shows nothing.
 */
export function DetailPanel({ item, onClose }: DetailPanelProps) {
  const modules = useModules();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [entityType, id] = splitItem(item);
  const Content =
    entityType === undefined
      ? undefined
      : modules.find((m) => m.detail?.[entityType])?.detail?.[entityType];

  return (
    <AnimatePresence initial={false}>
      {Content && id !== undefined && (
        <motion.aside
          key="detail"
          aria-label="Details"
          {...panelMotion(desktop, WIDTH)}
          transition={panelTransition}
          className={cx(
            PHONE_PANEL_CLASS,
            "overflow-clip bg-surface shadow-lg md:static md:shrink-0 md:shadow-none",
          )}
        >
          <div className="flex h-full w-full flex-col md:w-[400px]">
            <div className="flex h-12 shrink-0 items-center justify-end px-3">
              <IconButton label="Close details" icon={X} shortcut="]" onClick={onClose} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              <Content key={id} id={id} />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function splitItem(item: string | undefined): [string | undefined, string | undefined] {
  if (item === undefined) return [undefined, undefined];
  const index = item.indexOf(":");
  if (index <= 0) return [undefined, undefined];
  return [item.slice(0, index), item.slice(index + 1)];
}
