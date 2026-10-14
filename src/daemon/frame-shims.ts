import { fileURLToPath } from "node:url";
import { buildFrameShims, type FrameShims } from "../frame-shim-build";

/**
 * The frame shims, built from source on first use. Only a checkout runs this
 * module: the release build swaps it for the strings it built once
 * (tsup.config.ts), so an installed spool and a Worker never bundle a shim.
 */
let built: FrameShims | undefined;

export function frameShims(): FrameShims {
	built ??= buildFrameShims(fileURLToPath(new URL("../runtime/frame-shim/", import.meta.url)));
	return built;
}
