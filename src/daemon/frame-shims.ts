import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFrameShims, type FrameShims } from "../frame-shim-build";

/**
 * The frame shims, built from source on first use. Only a checkout runs this
 * module: the release build swaps it for the strings it built once
 * (tsup.config.ts), so an installed spool and a Worker never bundle a shim.
 */
let built: FrameShims | undefined;

export function frameShims(): FrameShims {
	// a path, not a URL: a test's DOM may stand its own URL in for node's
	built ??= buildFrameShims(join(dirname(fileURLToPath(import.meta.url)), "../runtime/frame-shim"));
	return built;
}
