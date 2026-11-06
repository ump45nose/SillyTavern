/** The sample at quantile `q` of an ascending list: the nearest rank at or below it, not interpolated. */
export const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/** Count, mean, median, p95 and max of timing samples, rounded to `digits` decimals. */
export function summarize(samples, digits) {
  if (!samples.length) return { n: 0 };
  const sorted = [...samples].sort((a, b) => a - b),
    round = (value) => +value.toFixed(digits);
  return {
    n: samples.length,
    mean: round(samples.reduce((a, b) => a + b, 0) / samples.length),
    median: round(quantile(sorted, 0.5)),
    p95: round(quantile(sorted, 0.95)),
    max: round(sorted.at(-1)),
  };
}
