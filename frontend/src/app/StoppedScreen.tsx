import { Power } from "lucide-react";

import { Button } from "../ui/Button";

/** Replaces the app after a shutdown: the server is gone, so nothing else works. */
export function StoppedScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-bg px-4">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <Power size={28} strokeWidth={1.75} aria-hidden className="text-text-muted" />
        <h1 className="text-xl font-semibold tracking-tight">PlanBox has stopped</h1>
        <p className="text-base text-text-muted">
          Everything is saved. You can close this tab. To start again, run{" "}
          <code className="font-mono text-sm">py main.py</code>, then reload.
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload
        </Button>
      </div>
    </div>
  );
}
