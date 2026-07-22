import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";

/**
 * Per-project canvas state in design/.spool/state.json: the mode (#7 — D
 * toggles live/design, persisted per project, never auto-switched) and the
 * last settled camera (#12 — cameras are per-browser live, last-settle wins
 * the persisted slot). App-owned ephemera: corrupt state reads as absent.
 */

export type CanvasMode = "live" | "design";

export interface Camera {
	x: number;
	y: number;
	k: number;
}

export interface CanvasState {
	mode: CanvasMode;
	camera?: Camera;
}

const DEFAULT_STATE: CanvasState = { mode: "live" };

function stateFile(root: string): string {
	return join(root, "design", ".spool", "state.json");
}

export function readCanvasState(root: string): CanvasState {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(stateFile(root), "utf8"));
	} catch {
		return DEFAULT_STATE;
	}
	const state = parseCanvasState(parsed);
	return state ?? DEFAULT_STATE;
}

export function writeCanvasState(root: string, state: CanvasState): void {
	writeAtomic(stateFile(root), `${JSON.stringify(state, null, "\t")}\n`);
}

/** Strict on the way in (PUT bodies), lenient defaults on the way out. */
export function parseCanvasState(value: unknown): CanvasState | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	if (record.mode !== "live" && record.mode !== "design") return undefined;
	if (record.camera === undefined) return { mode: record.mode };
	const camera = record.camera as Record<string, unknown>;
	if (typeof camera !== "object" || camera === null) return undefined;
	const { x, y, k } = camera;
	if (typeof x !== "number" || typeof y !== "number" || typeof k !== "number") return undefined;
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(k) || k <= 0) return undefined;
	return { mode: record.mode, camera: { x, y, k } };
}
