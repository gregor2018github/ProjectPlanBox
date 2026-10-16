import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PickerList } from "./PickerList";

const options = [
  { id: "a", label: "Robotics" },
  { id: "b", label: "Reading" },
];

describe("PickerList", () => {
  it("clears the typed text after a click pick and keeps focus for the next one", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onQueryChange = vi.fn();
    render(
      <PickerList label="Tags" options={options} onPick={onPick} onQueryChange={onQueryChange} />,
    );
    const input = screen.getByRole("combobox");

    await user.click(input);
    await user.type(input, "Rob");
    await user.click(screen.getByRole("option", { name: "Robotics" }));

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(onQueryChange).toHaveBeenLastCalledWith("");
  });

  it("clears the typed text after an Enter pick and after creating", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<PickerList label="Tags" options={options} onPick={vi.fn()} onCreate={onCreate} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "Read{Enter}");
    expect(input).toHaveValue("");

    await user.type(input, "Work{Enter}");
    expect(onCreate).toHaveBeenCalledWith("Work");
    expect(input).toHaveValue("");
  });
});
