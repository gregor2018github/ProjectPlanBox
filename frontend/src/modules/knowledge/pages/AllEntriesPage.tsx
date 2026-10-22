import { EntriesView } from "../components/EntriesView";

const SCOPE = { kind: "all" } as const;

/** Every page. */
export function AllEntriesPage() {
  return <EntriesView scope={SCOPE} title="Knowledge" />;
}
