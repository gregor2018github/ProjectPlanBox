import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { newId } from "../../core/ids";
import { useUndo } from "../../core/undo/undoContext";
import { nextAreaHue } from "./areaHues";
import {
  useCreateArea,
  useCreateList,
  useCreateSection,
  useDeleteContainer,
  useMoveContainer,
  useRenameContainer,
  useRestoreContainer,
  useUpdateArea,
  type AreaPatch,
  type ContainerKind,
  type MoveContainerVars,
} from "./mutations";
import { todoKeys } from "./queries";
import type { Area } from "./types";

const NOUN: Record<ContainerKind, string> = { area: "area", list: "list", section: "section" };

/** Areas, lists and sections: create, rename, move, delete with undo. */
export function useContainerActions() {
  const pushUndo = useUndo();
  const createArea = useCreateArea();
  const createList = useCreateList();
  const createSection = useCreateSection();
  const rename = useRenameContainer();
  const updateArea = useUpdateArea();
  const queryClient = useQueryClient();
  const move = useMoveContainer();
  const remove = useDeleteContainer();
  const restore = useRestoreContainer();

  return useMemo(
    () => ({
      createArea(name: string): string {
        const id = newId();
        const taken = (queryClient.getQueryData<Area[]>(todoKeys.areas) ?? []).map((a) => a.hue);
        createArea.mutate({ id, name: name.trim(), hue: nextAreaHue(taken) });
        return id;
      },
      updateArea(id: string, patch: AreaPatch): void {
        updateArea.mutate({
          id,
          patch: patch.name === undefined ? patch : { ...patch, name: patch.name.trim() },
        });
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
    [
      pushUndo,
      queryClient,
      createArea,
      updateArea,
      createList,
      createSection,
      rename,
      move,
      remove,
      restore,
    ],
  );
}

/** The bound container actions. */
export type ContainerActions = ReturnType<typeof useContainerActions>;
