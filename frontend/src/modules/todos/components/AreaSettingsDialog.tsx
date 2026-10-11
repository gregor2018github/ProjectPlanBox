import { useRef, useState, type SubmitEvent } from "react";

import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { HueWheel } from "../../../ui/HueWheel";
import { Input } from "../../../ui/Input";
import { tintProps } from "../../../ui/tint";
import { AREA_HUES } from "../areaHues";
import type { Area } from "../types";
import type { ContainerActions } from "../useContainerActions";

/** Props for {@link AreaSettingsDialog}. */
export interface AreaSettingsDialogProps {
  area: Area;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containers: ContainerActions;
}

/** An area's name and colour; the colour tints the area's pages and its sidebar mark. */
export function AreaSettingsDialog({
  area,
  open,
  onOpenChange,
  containers,
}: AreaSettingsDialogProps) {
  const [name, setName] = useState(area.name);
  const [hue, setHue] = useState(area.hue);
  const [wasOpen, setWasOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);
  // Start from the stored values every time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(area.name);
      setHue(area.hue);
    }
  }

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;
    const patch = {
      ...(trimmed !== area.name && { name: trimmed }),
      ...(hue !== area.hue && { hue }),
    };
    if (Object.keys(patch).length > 0) containers.updateArea(area.id, patch);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Area settings"
      size="sm"
      initialFocus={inputRef}
    >
      {/* Tinted with the hue being picked, so the dialog previews it. */}
      <form onSubmit={submit} {...tintProps(hue)} className="flex flex-col gap-4 px-5 pt-3 pb-5">
        <label className="flex flex-col gap-1 text-sm text-text-muted">
          Name
          <Input
            ref={inputRef}
            value={name}
            maxLength={200}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-sm text-text-muted">Colour</legend>
          <HueWheel value={hue} onChange={setHue} label="Area colour" presets={AREA_HUES} />
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={name.trim() === ""}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
