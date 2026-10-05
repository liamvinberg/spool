import * as esbuild from "esbuild";
import type { CompileHost } from "./design-compile";
import { diskDesignFiles } from "./disk-files";
import { compileFrameCssOnWorker } from "./stylesheet-workers";

/**
 * The daemon's compile: native esbuild, the disk, and frame stylesheets made
 * on its stylesheet workers.
 */
export const daemonCompileHost: CompileHost = {
	esbuild,
	files: diskDesignFiles,
	stylesheets: compileFrameCssOnWorker,
};
