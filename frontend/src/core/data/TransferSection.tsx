import { useRef, useState } from "react";

import type { ExportFile } from "../api/types";
import { IS_DEVICE } from "../platform";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { useToast } from "../../ui/useToast";
import { useExport, useImport } from "./dataQueries";
import { exportFileName, importSummary } from "./format";

/** Saves `data` as a JSON file through the browser's download. */
function download(data: unknown, name: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** A file picked for import, parsed and waiting for confirmation. */
interface Pending {
  name: string;
  file: ExportFile;
}

/** The Data page's export and import block: moves data between PCs. */
export function TransferSection() {
  const exporter = useExport();
  const importer = useImport();
  const { show } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const exportNow = () => {
    exporter.mutate(undefined, {
      onSuccess: (data) => {
        download(data, exportFileName(data.exported_at));
      },
      onError: (error) => {
        show({ title: "Could not export", description: error.message, tone: "error" });
      },
    });
  };

  const pick = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = "";
    if (file === undefined) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed !== "object" || parsed === null || !("format" in parsed)) {
        throw new Error("not an export");
      }
      // The server checks the shape; this only catches the wrong kind of file early.
      setPending({ name: file.name, file: parsed as ExportFile });
    } catch {
      show({
        title: "Not a PlanBox export",
        description: `${file.name} is not a file from "Download export".`,
        tone: "error",
      });
    }
  };

  const confirmImport = () => {
    if (pending === null) return;
    importer.mutate(pending.file, {
      onSuccess: (report) => {
        setPending(null);
        show({ title: "Import done", description: importSummary(report) });
      },
      onError: (error) => {
        setPending(null);
        show({ title: "Could not import", description: error.message, tone: "error" });
      },
    });
  };

  return (
    <section aria-labelledby="data-transfer" className="flex flex-col gap-4">
      <header>
        <h2 id="data-transfer" className="text-lg font-semibold tracking-tight">
          Export and import
        </h2>
        <p className="text-sm text-text-muted">
          {IS_DEVICE
            ? "Import an export file from a PC. Importing merges: for each item the newer version wins, deletions included, and a backup is taken first. Both need the same PlanBox version."
            : "Move your data between PCs: download an export on one, import it on the other, then the other way round. Importing merges: for each item the newer version wins, deletions included, and a backup is taken first. Both PCs need the same PlanBox version."}
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        {!IS_DEVICE && (
          <Button variant="secondary" onClick={exportNow} disabled={exporter.isPending}>
            {exporter.isPending ? "Exporting…" : "Download export"}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={importer.isPending}
        >
          {importer.isPending ? "Importing…" : "Import an export…"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          aria-label="Export file to import"
          className="hidden"
          onChange={(event) => void pick(event.target.files?.[0])}
        />
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={`Import ${pending?.name ?? "export"}?`}
        description="Items that are newer in the file replace the ones here; everything else stays. A backup is taken first."
        size="sm"
        initialFocus={cancelRef}
      >
        <div className="flex justify-end gap-2 px-5 pt-4 pb-5">
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={() => {
              setPending(null);
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={confirmImport} disabled={importer.isPending}>
            {importer.isPending ? "Importing…" : "Import"}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
