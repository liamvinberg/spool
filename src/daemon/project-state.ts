import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { isSafeName } from "./project-files";

/**
 * Per-project canvas state in design/.spool/state.json: the last settled
 * camera (#12 — cameras are per-browser live, last-settle wins the persisted
 * slot), the arrows toggle (#34 — unset means on: the map is spool's
 * identity), and the page bookkeeping (#39 — the active page and each named
 * page's camera; the root page keeps the original camera slot, so flat
 * projects' files read unchanged). App-owned ephemera: corrupt state reads as
 * absent.
 */

export interface Camera {
	x: number;
	y: number;
	k: number;
}

export interface CanvasState {
	/** The root page's last settled camera. */
	camera?: Camera;
	arrows?: boolean;
	/** The page the canvas last had active; absent means the root page. */
	activePage?: string;
	/** Named pages' last settled cameras, keyed by page name. */
	pageCameras?: Record<string, Camera>;
}

const DEFAULT_STATE: CanvasState = {};

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
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	if ("mode" in record) return undefined;
	const state: CanvasState = {};
	if (record.arrows !== undefined) {
		if (typeof record.arrows !== "boolean") return undefined;
		state.arrows = record.arrows;
	}
	if (record.camera !== undefined) {
		const camera = parseCamera(record.camera);
		if (camera === undefined) return undefined;
		state.camera = camera;
	}
	if (record.activePage !== undefined) {
		if (typeof record.activePage !== "string" || !isSafeName(record.activePage)) return undefined;
		state.activePage = record.activePage;
	}
	if (record.pageCameras !== undefined) {
		if (typeof record.pageCameras !== "object" || record.pageCameras === null || Array.isArray(record.pageCameras)) {
			return undefined;
		}
		const cameras: Record<string, Camera> = {};
		for (const [page, raw] of Object.entries(record.pageCameras)) {
			const camera = parseCamera(raw);
			if (!isSafeName(page) || camera === undefined) return undefined;
			cameras[page] = camera;
		}
		state.pageCameras = cameras;
	}
	return state;
}

function parseCamera(value: unknown): Camera | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { x, y, k } = value as Record<string, unknown>;
	if (typeof x !== "number" || typeof y !== "number" || typeof k !== "number") return undefined;
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(k) || k <= 0) return undefined;
	return { x, y, k };
}
