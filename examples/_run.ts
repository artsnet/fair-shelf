import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** True when `moduleUrl` is the script Node was started with (so an example prints only when run directly). */
export function isMain(moduleUrl: string): boolean {
  try {
    return process.argv[1] !== undefined && moduleUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}
