import { EntriesView } from "../components/EntriesView";

const SCOPE = { kind: "unsorted" } as const;

/** Entries that are in no collection yet. */
export function UnsortedPage() {
  return <EntriesView scope={SCOPE} title="Unsorted" />;
}
