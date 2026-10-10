import { useMemo } from "react";

import { CompletedGroup } from "../components/CompletedGroup";
import { EmptyHint } from "../components/EmptyHint";
import { NewTodoInline } from "../components/NewTodoInline";
import { PageHeader } from "../../../ui/PageHeader";
import { TodoGroup } from "../components/TodoGroup";
import { ViewLayout } from "../../../ui/ViewLayout";
import { flattenWithChildren, inboxView } from "../selectors";
import { INBOX, type Todo } from "../types";
import { useTodoUi } from "../uiStore";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";
import { useTodoKeyboard } from "../useTodoKeyboard";

const inInbox = (t: Todo) => t.list_id === null && t.parent_id === null;

/** The Inbox: todos not yet in a list, in manual order. */
export function InboxPage() {
  const data = useTodoData();
  const actions = useTodoActions();
  const expanded = useTodoUi((s) => s.expanded);
  const view = useMemo(() => inboxView(data.todos), [data.todos]);
  const visible = useMemo(
    () => [...flattenWithChildren(view.open, data.todos, expanded), ...view.done],
    [view, data.todos, expanded],
  );
  useTodoKeyboard(visible, actions, { reorder: true });

  return (
    <ViewLayout>
      <PageHeader title="Inbox" />
      {!data.loading && view.open.length === 0 && view.done.length === 0 && (
        <EmptyHint text="Your Inbox is empty." />
      )}
      <TodoGroup
        todos={view.open}
        data={data}
        actions={actions}
        label="Inbox"
        container={INBOX}
        includes={inInbox}
      />
      <NewTodoInline placement={INBOX} data={data} actions={actions} />
      <CompletedGroup todos={view.done} data={data} actions={actions} />
    </ViewLayout>
  );
}
