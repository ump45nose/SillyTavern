import test from "node:test";
import assert from "node:assert/strict";
import { quantile, summarize } from "../scripts/lib/stats.mjs";

test("quantile picks the nearest rank at or below without interpolating", () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(quantile(sorted, 0.5), 6);
  assert.equal(quantile(sorted, 0.95), 10);
  assert.equal(quantile(sorted, 1), 10);
  assert.equal(quantile([4, 9, 30], 0.5), 9);
  assert.equal(quantile([7], 0.95), 7);
});

test("summarize sorts a copy and rounds every figure to the requested digits", () => {
  const samples = [3.14159, 1.23456, 2.71828];
  assert.deepEqual(summarize(samples, 2), { n: 3, mean: 2.36, median: 2.72, p95: 3.14, max: 3.14 });
  assert.deepEqual(summarize(samples, 1), { n: 3, mean: 2.4, median: 2.7, p95: 3.1, max: 3.1 });
  assert.deepEqual(samples, [3.14159, 1.23456, 2.71828]);
});

test("summarize reports only the count for no samples", () => {
  assert.deepEqual(summarize([], 1), { n: 0 });
});
