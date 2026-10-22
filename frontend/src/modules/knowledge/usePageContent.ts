import { useCallback, useEffect, useRef, useState } from "react";

import type { PageContent } from "./types";

/** How long typing must pause before the page is saved. */
export const SAVE_DELAY_MS = 600;

/** A page's content while it is open, and how to change it. */
export interface PageContentState {
  content: PageContent;
  /** Applies an edit at once and saves it a moment later (edits in a burst save once). */
  change: (edit: (content: PageContent) => PageContent) => void;
  /** Saves a pending edit now (e.g. before leaving). */
  flush: () => void;
}

/**
 * The open page's content. It starts from the cached entry and is then owned
 * by the editor: the server's answers do not flow back in while the page is
 * open, so typing is never interrupted. Pending edits are saved when the page
 * closes or the window is hidden; then `leaving` asks for a request that
 * outlives the page (a reload or a closed window would cancel a normal one).
 */
export function usePageContent(
  initial: PageContent,
  onSave: (content: PageContent, leaving: boolean) => void,
): PageContentState {
  const [content, setContent] = useState(initial);
  const latest = useRef(initial);
  const pending = useRef<PageContent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });

  const save = useCallback((leaving: boolean) => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next !== null) saveRef.current(next, leaving);
  }, []);
  const flush = useCallback(() => {
    save(false);
  }, [save]);

  const change = useCallback(
    (edit: (content: PageContent) => PageContent) => {
      const next = edit(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      pending.current = next;
      setContent(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  useEffect(() => {
    const leave = () => {
      save(true);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") leave();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", leave);
      save(false);
    };
  }, [save]);

  return { content, change, flush };
}
