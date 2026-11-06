import fs from "node:fs";
import path from "node:path";
import { artifacts, launch, session } from "../browser.mjs";

/**
 * Runs a verification script's body in a fresh browser and always writes
 * artifacts/<name>/verification.json. A failure is logged and sets the exit code instead of
 * throwing, after a failure.png of the latest session's page.
 *
 * The body receives `dir` (artifacts/<name>), `report` (for extra fields), `pass(label, details)`,
 * `session(options)` (browser.mjs's session, whose page errors go into the report) and
 * `cleanup(fn)`: run after the failure screenshot and before the report is written, its errors ignored.
 */
export async function runCheck(name, body) {
  const dir = path.join(artifacts, name);
  fs.mkdirSync(dir, { recursive: true });
  const report = { checkedAt: new Date().toISOString(), passed: false, checks: [], errors: [] };
  const browser = await launch(),
    sessions = [],
    cleanups = [];
  const pass = (label, details) => {
    report.checks.push({ name: label, passed: true, details });
    console.log("PASS", label, ...(details === undefined ? [] : [JSON.stringify(details)]));
  };
  const open = async (options) => {
    const opened = await session(browser, options);
    sessions.push(opened);
    return opened;
  };
  try {
    await body({ dir, report, pass, session: open, cleanup: (fn) => cleanups.push(fn) });
    report.passed = true;
  } catch (error) {
    report.failure = error.stack;
    process.exitCode = 1;
    console.error(error);
    const page = sessions.at(-1)?.page;
    if (page) await page.screenshot({ path: path.join(dir, "failure.png") }).catch(() => {});
  } finally {
    for (const fn of cleanups) {
      try {
        await fn();
      } catch {}
    }
    report.errors = sessions.flatMap((opened) => opened.errors);
    fs.writeFileSync(path.join(dir, "verification.json"), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
