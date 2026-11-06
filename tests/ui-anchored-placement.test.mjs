import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const { code } = await transform(await readFile(new URL("../src/ui/placement.ts", import.meta.url), "utf8"), {
  loader: "ts",
  format: "esm",
});
const { place, placedWidth, popoverPlacement, listPlacement, pickerPlacement } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

// Each layer's own computation before they shared one, as it was written in its component.
const before = {
  popover(a, p, { width: innerWidth, height: innerHeight }) {
    const above = a.top - p.height - 8;
    return {
      left: Math.max(10, Math.min(a.left, innerWidth - p.width - 10)),
      top: Math.max(10, Math.min(above >= 10 ? above : a.bottom + 8, innerHeight - p.height - 10)),
    };
  },
  list(rect, scrollHeight, { width: innerWidth, height: innerHeight }) {
    const width = Math.min(Math.max(rect.width, 180), innerWidth - 16);
    const below = innerHeight - rect.bottom - 14,
      above = rect.top - 14;
    const downward = below >= 150 || below >= above;
    const height = Math.min(260, Math.max(80, downward ? below : above));
    const renderedHeight = Math.min(height, scrollHeight + 2);
    return {
      left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
      top: downward ? rect.bottom + 6 : rect.top - renderedHeight - 6,
      width,
      maxHeight: height,
    };
  },
  picker(r, { width: innerWidth, height: innerHeight }) {
    const width = Math.min(340, innerWidth - 24);
    return {
      left: Math.max(12, Math.min(r.left, innerWidth - width - 12)),
      top: r.bottom + 8,
      width,
      maxHeight: Math.min(500, innerHeight - r.bottom - 20),
    };
  },
};

const views = [
  { width: 320, height: 480 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
];
function* anchors(view) {
  for (const width of [24, 120, 300, 520])
    for (const left of [0, 6, view.width / 2 - width / 2, view.width - width - 4, view.width - 10])
      for (const top of [
        -40,
        0,
        8,
        40,
        view.height / 2 - 18,
        view.height - 160,
        view.height - 60,
        view.height - 30,
      ])
        yield { left, top, bottom: top + 36, width };
}
const heights = [40, 120, 240, 300, 470, 900];

test("a popover sits where its own computation put it", () => {
  for (const view of views)
    for (const anchor of anchors(view))
      for (const height of heights)
        for (const width of [200, 352, 460]) {
          const layer = { width, height };
          assert.deepEqual(place(anchor, layer, view, popoverPlacement), before.popover(anchor, layer, view));
        }
});

test("a select's listbox sits where its own computation put it", () => {
  for (const view of views)
    for (const anchor of anchors(view))
      for (const content of heights) {
        // The listbox has a one-pixel border, measured with its content.
        const layer = { width: placedWidth(anchor, view, listPlacement), height: content + 2 };
        assert.deepEqual(place(anchor, layer, view, listPlacement), before.list(anchor, content, view));
      }
});

test("a resource picker's list sits where its own computation put it", () => {
  for (const view of views)
    for (const anchor of anchors(view))
      for (const height of heights) {
        const layer = { width: 340, height };
        assert.deepEqual(place(anchor, layer, view, pickerPlacement), before.picker(anchor, view));
      }
});

const view = { width: 1280, height: 800 };

test("a popover opens above its button, below when it does not fit, and stays inside the window", () => {
  const button = { left: 600, top: 700, bottom: 736, width: 32 },
    layer = { width: 352, height: 300 };
  assert.deepEqual(place(button, layer, view, popoverPlacement), { left: 600, top: 392 });
  const high = { left: 1250, top: 50, bottom: 86, width: 32 };
  assert.deepEqual(place(high, layer, view, popoverPlacement), { left: 918, top: 94 });
  const tall = { width: 352, height: 760 };
  assert.deepEqual(place(high, tall, view, popoverPlacement), { left: 918, top: 30 });
});

test("a listbox keeps to its trigger's width, flips up when short of room below, and scrolls within its side", () => {
  const trigger = { left: 100, top: 300, bottom: 332, width: 240 };
  assert.deepEqual(place(trigger, { width: 240, height: 122 }, view, listPlacement), {
    left: 100,
    top: 338,
    width: 240,
    maxHeight: 260,
  });
  const low = { left: 100, top: 680, bottom: 712, width: 120 };
  assert.deepEqual(place(low, { width: 180, height: 122 }, view, listPlacement), {
    left: 100,
    top: 552,
    width: 180,
    maxHeight: 260,
  });
  // Below is short of 150 but no shorter than above: it stays below, with at least 80 to scroll in.
  const squeezed = { left: 100, top: 40, bottom: 72, width: 120 };
  assert.deepEqual(place(squeezed, { width: 180, height: 400 }, { width: 400, height: 150 }, listPlacement), {
    left: 100,
    top: 78,
    width: 180,
    maxHeight: 80,
  });
});

test("a resource picker's list never leaves the space below its title", () => {
  const title = { left: 1100, top: 700, bottom: 736, width: 160 };
  assert.deepEqual(place(title, { width: 340, height: 600 }, view, pickerPlacement), {
    left: 928,
    top: 744,
    width: 340,
    maxHeight: 44,
  });
});
