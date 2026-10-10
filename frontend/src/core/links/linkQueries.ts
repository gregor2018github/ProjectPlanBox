/**
 * Links between entities of any modules: one cached list per entity, with
 * optimistic add/remove (ARCHITECTURE §8) and undo. Both ends' caches are
 * refetched afterwards, since the server summarises titles.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useApiClient } from "../api/apiContext";
import { unwrap } from "../api/client";
import type { components } from "../api/schema";
import { newId } from "../ids";
import { useUndo } from "../undo/undoContext";
import { useToast } from "../../ui/useToast";

/** A link with both ends summarised. */
export type Link = components["schemas"]["LinkOut"];

/** One end of a link. */
export type LinkEnd = components["schemas"]["LinkEndOut"];

/** Query keys for links. */
export const linkKeys = {
  all: ["core", "links"] as const,
  of: (ref: string) => ["core", "links", ref] as const,
};

const SCOPE = { id: "links" };

/** Live links from and to one entity. */
export function useLinks(ref: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: linkKeys.of(ref),
    queryFn: () => unwrap(client.GET("/api/links", { params: { query: { entity: ref } } })),
  });
}

/** The end of a link that is not `ref`. */
export function otherEnd(link: Link, ref: string): LinkEnd {
  return link.source.ref === ref ? link.target : link.source;
}

/** Adds and removes links, with undo. */
export function useLinkActions() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const pushUndo = useUndo();
  const { show } = useToast();

  const refresh = () => queryClient.invalidateQueries({ queryKey: linkKeys.all });
  const fail = (title: string) => (error: Error) => {
    show({ title, description: error.message, tone: "error" });
  };

  const create = useMutation({
    scope: SCOPE,
    mutationFn: (vars: { link: Link }) =>
      unwrap(
        client.POST("/api/links", {
          body: { id: vars.link.id, source: vars.link.source.ref, target: vars.link.target.ref },
        }),
      ),
    onMutate: async ({ link }) => {
      await queryClient.cancelQueries({ queryKey: linkKeys.all });
      const key = linkKeys.of(link.source.ref);
      const previous = queryClient.getQueryData<Link[]>(key);
      queryClient.setQueryData<Link[]>(key, (links = []) => [...links, link]);
      return { key, previous };
    },
    onError: (error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
      fail("Could not add the link")(error);
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    scope: SCOPE,
    mutationFn: (vars: { id: string; viewer: string }) =>
      unwrap(client.DELETE("/api/links/{link_id}", { params: { path: { link_id: vars.id } } })),
    onMutate: async ({ id, viewer }) => {
      await queryClient.cancelQueries({ queryKey: linkKeys.all });
      const key = linkKeys.of(viewer);
      const previous = queryClient.getQueryData<Link[]>(key);
      queryClient.setQueryData<Link[]>(key, (links = []) => links.filter((l) => l.id !== id));
      return { key, previous };
    },
    onError: (error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
      fail("Could not remove the link")(error);
    },
    onSettled: refresh,
  });

  const restore = useMutation({
    scope: SCOPE,
    mutationFn: (id: string) =>
      unwrap(client.POST("/api/links/{link_id}/restore", { params: { path: { link_id: id } } })),
    onError: fail("Could not restore the link"),
    onSettled: refresh,
  });

  return useMemo(
    () => ({
      /** Links `from` (the entity being viewed) to `to`. */
      add(from: LinkEnd, to: LinkEnd): void {
        const link: Link = {
          id: newId(),
          source: from,
          target: to,
          created_at: new Date().toISOString(),
        };
        create.mutate({ link });
        pushUndo({
          label: `Linked “${to.title}”`,
          silent: true,
          undo: () => {
            remove.mutate({ id: link.id, viewer: from.ref });
          },
        });
      },
      /** Removes a link as seen from `viewer`; the toast offers Undo. */
      remove(link: Link, viewer: string): void {
        remove.mutate(
          { id: link.id, viewer },
          {
            onSuccess: () => {
              pushUndo({
                label: `Removed link to “${otherEnd(link, viewer).title}”`,
                undo: () => {
                  restore.mutate(link.id);
                },
              });
            },
          },
        );
      },
    }),
    [create, remove, restore, pushUndo],
  );
}
