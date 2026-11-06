import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const { code } = await transform(
  await readFile(new URL("../src/ui/mobile/drag.ts", import.meta.url), "utf8"),
  {
    loader: "ts",
    format: "esm",
  },
);
const { trackDrag } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const at = (clientX, clientY) => ({ clientX, clientY });

test("a drag's delta runs from its press to the last recorded move", () => {
  const track = trackDrag("y", at(40, 300), 1000);
  assert.equal(track.delta, 0);
  track.move(at(41, 320), 1016);
  track.move(at(39, 290), 1032);
  assert.equal(track.delta, -10);
  const sideways = trackDrag("x", at(40, 300), 1000);
  sideways.move(at(130, 260), 1016);
  assert.equal(sideways.delta, 90);
});

test("velocity is that of the last two samples, the press counting as the first", () => {
  const track = trackDrag("y", at(0, 100), 1000);
  assert.equal(track.velocity, 0);
  track.move(at(0, 120), 1010);
  assert.equal(track.velocity, 2);
  track.move(at(0, 125), 1030);
  assert.equal(track.velocity, 0.25);
  // A finger that stops before lifting has no velocity, however fast it came.
  track.move(at(0, 125), 1100);
  assert.equal(track.velocity, 0);
  // Two samples in the same millisecond count as one apart.
  track.move(at(0, 128), 1100);
  assert.equal(track.velocity, 3);
});

test("a flick is motion faster than the threshold, along the axis or against it", () => {
  const flick = (from, to, ms, threshold) => {
    const track = trackDrag("x", at(from, 0), 0);
    track.move(at(to, 0), ms);
    return track.flick(threshold);
  };
  assert.equal(flick(0, 60, 100, 0.5), 1);
  assert.equal(flick(60, 0, 100, 0.5), -1);
  assert.equal(flick(0, 50, 100, 0.5), 0);
  assert.equal(flick(50, 0, 100, 0.5), 0);
  assert.equal(flick(0, 36, 100, 0.35), 1);
  assert.equal(flick(0, 30, 100, 0.35), 0);
});

// Each gesture's release rule before the tracker, written as it was, against the same rule through it.
test("each gesture keeps its own threshold and direction", () => {
  const speeds = [
    -1.2, -0.5, -0.46, -0.45, -0.44, -0.36, -0.35, -0.2, 0, 0.2, 0.35, 0.36, 0.44, 0.45, 0.46, 0.5, 0.51, 1.2,
  ];
  for (const v of speeds) {
    const track = trackDrag("y", at(0, 0), 0);
    track.move(at(0, v * 100), 100);
    const speed = (v * 100 - 0) / Math.max(1, 100 - 0);
    // Sheets close on a flick away from their edge: down for bottom sheets, up for the top menu.
    for (const top of [false, true])
      assert.equal(track.flick(0.5) === (top ? -1 : 1), speed * (top ? -1 : 1) > 0.5, `sheet ${v} ${top}`);
    // The editor page folds back on a downward flick.
    assert.equal(track.flick(0.5) > 0, speed > 0.5, `page ${v}`);
    // RP's band measures speed upward: up opens the page, down returns to the dialogue.
    const rising = -speed;
    assert.equal(track.flick(0.45) < 0, rising > 0.45, `band up ${v}`);
    assert.equal(track.flick(0.45) > 0, rising < -0.45, `band down ${v}`);
    // Drawers measure speed toward the side they open from.
    for (const sign of [1, -1]) {
      const swipe = track.flick(0.35) * sign,
        toward = speed * sign;
      assert.equal(
        swipe > 0 ? true : swipe < 0 ? false : null,
        toward > 0.35 ? true : toward < -0.35 ? false : null,
      );
    }
  }
});
