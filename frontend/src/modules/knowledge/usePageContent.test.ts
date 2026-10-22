import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addBox, newBox } from "./pageContent";
import { textBox } from "./testData";
import type { PageContent } from "./types";
import { SAVE_DELAY_MS, usePageContent } from "./usePageContent";

describe("usePageContent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const start: PageContent = { boxes: [textBox("first")] };

  it("applies edits at once and saves a burst of them once, after a pause", () => {
    const save = vi.fn();
    const { result } = renderHook(() => usePageContent(start, save));

    act(() => {
      result.current.change((c) => addBox(c, newBox("a", 10, 10)));
      result.current.change((c) => addBox(c, newBox("b", 20, 20)));
    });
    expect(result.current.content.boxes).toHaveLength(3);
    expect(save).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(result.current.content, false);
  });

  it("ignores edits that change nothing", () => {
    const save = vi.fn();
    const { result } = renderHook(() => usePageContent(start, save));

    act(() => {
      result.current.change((c) => c);
      vi.advanceTimersByTime(SAVE_DELAY_MS);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("saves a pending edit when the page closes, and with keepalive when the window goes", () => {
    const save = vi.fn();
    const { result, unmount } = renderHook(() => usePageContent(start, save));

    act(() => {
      result.current.change((c) => addBox(c, newBox("a", 0, 0)));
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({}), true);

    act(() => {
      result.current.change((c) => addBox(c, newBox("b", 0, 0)));
    });
    unmount();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({}), false);
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS);
    });
    expect(save).toHaveBeenCalledTimes(2);
  });
});
