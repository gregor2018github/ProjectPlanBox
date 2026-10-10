import { EntriesView } from "../components/EntriesView";

const SCOPE = { kind: "all" } as const;

/** Every note, link and snippet. */
export function AllEntriesPage() {
  return <EntriesView scope={SCOPE} title="Knowledge" />;
}
