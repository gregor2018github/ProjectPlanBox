import { afterEach, describe, expect, it } from "vitest";

import { isBackgroundClick } from "./isBackgroundClick";

function mount(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  return container;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isBackgroundClick", () => {
  it("accepts the container and plain wrappers", () => {
    const container = mount(`<section><h1 id="h">Inbox</h1></section>`);
    expect(isBackgroundClick(container, container)).toBe(true);
    expect(isBackgroundClick(container.querySelector("#h")!, container)).toBe(true);
  });

  it("rejects rows, controls and anything inside them", () => {
    const container = mount(
      `<ul><li><span id="title">Todo</span></li></ul><button><svg id="icon"></svg></button>`,
    );
    expect(isBackgroundClick(container.querySelector("#title")!, container)).toBe(false);
    expect(isBackgroundClick(container.querySelector("#icon")!, container)).toBe(false);
  });

  it("rejects targets outside the container, such as portals", () => {
    const container = mount(`<p>View</p>`);
    const portal = mount(`<p id="menu">Menu</p>`);
    expect(isBackgroundClick(portal.querySelector("#menu")!, container)).toBe(false);
  });
});
