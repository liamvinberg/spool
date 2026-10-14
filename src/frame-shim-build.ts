import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { lowerCombo, parseCombo } from "./ui/hotkey-combos";
import { relayedHotkeys, tabHotkeyCombos } from "./ui/hotkeys";

/**
 * The scripts spool puts into documents it serves, built from their typed
 * source in `src/runtime/frame-shim/` to the strings `daemon/document.ts`
 * inlines: the canvas shim every frame document carries, the capture worker's
 * one script, and the booth's probes.
 *
 * `pnpm build:shims` writes them to `daemon/frame-shims.ts`, which is checked
 * in: every reader takes the same plain strings, whatever bundles it, so the
 * daemon, a checkout and a Worker that bundles `spool.page/compile` inline the
 * same bytes and none of them builds anything. A test beside the shim's source
 * fails while the written strings are not what its source builds to.
 */
export interface FrameShims {
	/** the canvas shim (#8/#22), a classic script */
	canvasShim: string;
	/** the capture worker page's script */
	captureWorker: string;
	/** an expression for the booth's isolated world: `{ contentHeight, settle }` */
	boothProbes: string;
}

/** The shim's source: `src/runtime/frame-shim`. */
export const FRAME_SHIM_DIR: string = fileURLToPath(new URL("./runtime/frame-shim", import.meta.url));

/** Where the built strings are written. */
export const FRAME_SHIMS_MODULE: string = fileURLToPath(new URL("./daemon/frame-shims.ts", import.meta.url));

/** `dir`: the absolute path of `src/runtime/frame-shim`. */
export function buildFrameShims(dir: string): FrameShims {
	return {
		canvasShim: bundle(join(dir, "canvas-shim.ts")),
		captureWorker: bundle(join(dir, "capture-worker.ts")),
		boothProbes: `(() => {\n${bundle(join(dir, "booth-probes.ts"), "spoolProbes")}return spoolProbes;\n})()`,
	};
}

/**
 * The keys an entered frame hands back to the canvas, from the register's
 * `relay` entries: each lowered combo, the entry it runs, and whether the
 * browser's own meaning is eaten (a chord under ctrl or ⌘ has one; Esc stays
 * the frame's too, its own modals included). The register is the canvas's,
 * so the shim is handed what it reads of it rather than carrying it.
 */
function relayKeys() {
	return relayedHotkeys().flatMap(({ id, combos, yields, typing }) =>
		combos.map((combo) => {
			const parsed = parseCombo(combo);
			return { id, match: lowerCombo(parsed), prevent: parsed.accel || parsed.ctrl, yields, typing };
		}),
	);
}

function bundle(entry: string, globalName?: string): string {
	const result = buildSync({
		entryPoints: [entry],
		// the paths the bundle names its modules by, from the repository root wherever this runs
		absWorkingDir: resolve(dirname(entry), "../../.."),
		bundle: true,
		format: "iife",
		platform: "browser",
		target: "es2022",
		legalComments: "none",
		write: false,
		logLevel: "silent",
		define: {
			__SPOOL_RELAY_KEYS__: JSON.stringify(relayKeys()),
			// the tab keys, which an open edit of a frame's words keeps from the window
			__SPOOL_EDIT_HELD_KEYS__: JSON.stringify(tabHotkeyCombos().map((combo) => lowerCombo(parseCombo(combo)))),
		},
		...(globalName === undefined ? {} : { globalName }),
	});
	const js = result.outputFiles[0]?.text;
	if (js === undefined) throw new Error(`${entry} bundle produced no output`);
	return js;
}

/** The built strings as the module `daemon/frame-shims.ts` is. */
export function frameShimsModule(shims: FrameShims): string {
	return `// Written by \`pnpm build:shims\` from src/runtime/frame-shim (src/frame-shim-build.ts): edit the source, not this.
export const frameShims = {
	canvasShim: ${JSON.stringify(shims.canvasShim)},
	captureWorker: ${JSON.stringify(shims.captureWorker)},
	boothProbes: ${JSON.stringify(shims.boothProbes)},
};
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	writeFileSync(FRAME_SHIMS_MODULE, frameShimsModule(buildFrameShims(FRAME_SHIM_DIR)));
}
