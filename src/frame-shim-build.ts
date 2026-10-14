import { join } from "node:path";
import { buildSync } from "esbuild";
import { lowerCombo, parseCombo } from "./ui/hotkey-combos";
import { relayedHotkeys, tabHotkeyCombos } from "./ui/hotkeys";

/**
 * The scripts spool puts into documents it serves, built from their typed
 * source in `src/runtime/frame-shim/` to the strings `daemon/document.ts`
 * inlines: the canvas shim every frame document carries, the capture worker's
 * one script, and the booth's probes. The release build runs this once
 * (tsup.config.ts) and bakes the strings into every bundle that carries them,
 * so the daemon and a Worker that bundles `spool.page/compile` again inline the
 * same bytes; a checkout runs it on first use (`daemon/frame-shims.ts`).
 */
export interface FrameShims {
	/** the capture worker page's script */
	captureWorker: string;
}

/** `dir`: the absolute path of `src/runtime/frame-shim`. */
export function buildFrameShims(dir: string): FrameShims {
	return {
		captureWorker: bundle(join(dir, "capture-worker.ts")),
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
