import { useMemo } from "react";

import { newId } from "../../core/ids";
import { useUndo } from "../../core/undo/undoContext";
import {
  useCreateArea,
  useCreateList,
  useCreateSection,
  useDeleteContainer,
  useMoveContainer,
  useRenameContainer,
  useRestoreContainer,
  type ContainerKind,
  type MoveContainerVars,
} from "./mutations";

const NOUN: Record<ContainerKind, string> = { area: "area", list: "list", section: "section" };

/** Areas, lists and sections: create, rename, move, delete with undo. */
export function useContainerActions() {
  const pushUndo = useUndo();
  const createArea = useCreateArea();
  const createList = useCreateList();
  const createSection = useCreateSection();
  const rename = useRenameContainer();
  const move = useMoveContainer();
  const remove = useDeleteContainer();
  const restore = useRestoreContainer();

  return useMemo(
    () => ({
      createArea(name: string): string {
        const id = newId();
        createArea.mutate({ id, name: name.trim() });
        return id;
      },
      createList(name: string, areaId: string | null): string {
        const id = newId();
        createList.mutate({ id, name: name.trim(), area_id: areaId });
        return id;
      },
      createSection(listId: string, name: string): string {
        const id = newId();
        createSection.mutate({ id, name: name.trim(), list_id: listId });
        return id;
      },
      rename(kind: ContainerKind, id: string, name: string): void {
        rename.mutate({ kind, id, name: name.trim() });
      },
      move(vars: MoveContainerVars): void {
        move.mutate(vars);
      },
      remove(kind: ContainerKind, id: string, name: string): void {
        remove.mutate(
          { kind, id },
          {
            onSuccess: (deleted) => {
              const inside =
                deleted.todos > 0
                  ? ` and ${deleted.todos} todo${deleted.todos === 1 ? "" : "s"}`
                  : "";
              pushUndo({
                label: `Deleted ${NOUN[kind]} “${name}”${inside}`,
                undo: () => {
                  restore.mutate({ kind, id });
                },
              });
            },
          },
        );
      },
    }),
    [pushUndo, createArea, createList, createSection, rename, move, remove, restore],
  );
}

/** The bound container actions. */
export type ContainerActions = ReturnType<typeof useContainerActions>;
