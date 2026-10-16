import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SWIPE_DISTANCE, SWIPE_EDGE, useSwipeNavigation } from "./useSwipeNavigation";

function Harness({ onPrevious, onNext }: { onPrevious: () => void; onNext: () => void }) {
  const swipe = useSwipeNavigation(onPrevious, onNext);
  return (
    <div data-testid="area" {...swipe}>
      <span data-testid="handle" data-swipe-ignore />
    </div>
  );
}

function setup() {
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  render(<Harness onPrevious={onPrevious} onNext={onNext} />);
  const move = (target: string, from: [number, number], to: [number, number]) => {
    const element = screen.getByTestId(target);
    fireEvent.touchStart(element, { touches: [{ clientX: from[0], clientY: from[1] }] });
    fireEvent.touchEnd(element, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
  };
  return { onPrevious, onNext, move };
}

describe("useSwipeNavigation", () => {
  it("goes to the next period on a swipe left and the previous on a swipe right", () => {
    const { onPrevious, onNext, move } = setup();
    move("area", [300, 200], [100, 220]);
    expect(onNext).toHaveBeenCalledOnce();
    move("area", [100, 200], [300, 190]);
    expect(onPrevious).toHaveBeenCalledOnce();
  });

  it("leaves short and mostly vertical moves to taps and scrolling", () => {
    const { onPrevious, onNext, move } = setup();
    move("area", [200, 200], [200 - SWIPE_DISTANCE + 1, 200]);
    move("area", [300, 100], [180, 400]);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it("ignores the screen edges and marked elements", () => {
    const { onPrevious, onNext, move } = setup();
    move("area", [SWIPE_EDGE - 1, 200], [300, 200]);
    move("handle", [300, 200], [100, 200]);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
  });
});
