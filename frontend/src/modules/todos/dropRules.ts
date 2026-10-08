/**
 * Turns a finished drag into a move: which container, between which
 * neighbours. Pure, so the rules are tested without a browser.
 */
import type { DropInfo } from "../../ui/dnd";
import type { Placement } from "./types";

/** Data every sortable todo row carries (its container and the ids shown there). */
export interface TodoDropData {
  kind: "todo-row";
  placement: Placement;
  ids: readonly string[];
}

/** Data of a place a todo can be dropped onto (a sidebar list, an empty group). */
export interface TodoDestinationData {
  kind: "todo-destination";
  placement: Placement;
  /** Ids shown in that container; empty means "append at the end". */
  ids?: readonly string[];
}

/** The move to perform, or null when nothing changes. */
export interface TodoDropMove {
  target: Placement;
  before_id: string | null;
  after_id: string | null;
}

function isPlacement(value: unknown): value is Placement {
  return typeof value === "object" && value !== null && "list_id" in value && "parent_id" in value;
}

/** Interprets a drop of `todoId`. */
export function resolveTodoDrop(todoId: string, info: DropInfo): TodoDropMove | null {
  if (info.canceled || info.target === null) return null;
  const data = info.target.data;
  if (!isPlacement(data.placement)) return null;
  const target = data.placement;

  if (data.kind === "todo-destination") {
    return { target, before_id: null, after_id: null };
  }
  if (data.kind !== "todo-row") return null;
  if (info.group === info.initialGroup && info.index === info.initialIndex) return null;

  const ids = (Array.isArray(data.ids) ? (data.ids as string[]) : []).filter((id) => id !== todoId);
  const index = Math.min(Math.max(info.index ?? ids.length, 0), ids.length);
  return { target, before_id: ids[index] ?? null, after_id: ids[index - 1] ?? null };
}

/** The sortable group key of a container. */
export function groupKey(p: Placement): string {
  return `todos:${p.list_id ?? "inbox"}:${p.section_id ?? "-"}:${p.parent_id ?? "-"}`;
}
