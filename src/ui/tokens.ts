import { useEffect, useState } from "react";
import type { HostAdapter } from "../host/adapter";

/**
 * Debounced token counts for [id, text] pairs with the active tokenizer. Counting is a hint: the map stays
 * empty while the host has no tokenizer, and a failed count leaves the previous numbers in place.
 */
export function useTokenCounts(host: HostAdapter, items: [string, string][], delay = 400) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const source = items.map(([id, text]) => id + "\u0001" + text).join("\u0000");
  useEffect(() => {
    if (!items.length) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const next: Record<string, number> = {};
        for (const [id, text] of items) {
          const n = await host.tokenCount(text);
          if (n === null || !live) return;
          next[id] = n;
        }
        if (live) setCounts(next);
      } catch {
        /* Keep the last counts. */
      }
    }, delay);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [source]);
  return counts;
}
