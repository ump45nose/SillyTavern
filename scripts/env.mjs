import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The .env of the checkout these scripts run from. */
export const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");

/**
 * KEY=value lines, taken verbatim: the value is everything after the first "=", nothing is trimmed or
 * unquoted, and only lines starting with "#" are comments. A missing file throws unless `optional`.
 * @returns {Record<string, string>}
 */
export function readEnv({ file = envFile, optional = false } = {}) {
  if (optional && !fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}
