import { afterEach, describe, expect, it, vi } from "vitest";

import { installMatchMedia } from "../../test/matchMedia";
import { confirmDelete, deleteConfirmation } from "./confirmDelete";

const question = { title: "Delete todo?", description: "“Buy milk” will be deleted." };

afterEach(() => {
  deleteConfirmation.dismiss();
});

describe("confirmDelete", () => {
  it("deletes at once with a mouse", () => {
    installMatchMedia(() => false);
    const run = vi.fn();
    confirmDelete(question, run);
    expect(run).toHaveBeenCalledOnce();
    expect(deleteConfirmation.get()).toBeNull();
  });

  it("waits for an answer on a touch screen", () => {
    installMatchMedia((query) => query === "(pointer: coarse)");
    const run = vi.fn();

    confirmDelete(question, run);
    expect(run).not.toHaveBeenCalled();
    expect(deleteConfirmation.get()).toMatchObject(question);

    deleteConfirmation.dismiss();
    expect(run).not.toHaveBeenCalled();

    confirmDelete(question, run);
    deleteConfirmation.accept();
    expect(run).toHaveBeenCalledOnce();
    expect(deleteConfirmation.get()).toBeNull();
  });
});
