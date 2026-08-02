import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { carriedKeys, carriedPage, isPagePath, pageWithin } from "../page-path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";

/**
 * Per-project canvas state in design/.spool/state.json: the last settled
 * camera (#12 — cameras are per-browser live, last-settle wins the persisted
 * slot), the arrows toggle (#34 — unset means on: the map is spool's
 * identity), and the page bookkeeping (#39 — the active page and each named
 * page's camera; the root page keeps the original camera slot, so flat
 * projects' files read unchanged). A page is named by its path (#231), so a
 * flat project's keys are exactly what they were. App-owned ephemera: corrupt
 * state reads as absent.
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
	/** The page the canvas last had active, by path; absent means the root page. */
	activePage?: string;
	/** Named pages' last settled cameras, keyed by page path. */
	pageCameras?: Record<string, Camera>;
}

const DEFAULT_STATE: CanvasState = {};

function stateFile(root: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "state.json"));
}

export function readCanvasState(root: string): CanvasState {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(stateFile(root), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
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
		if (typeof record.activePage !== "string" || !isPagePath(record.activePage)) return undefined;
		state.activePage = record.activePage;
	}
	if (record.pageCameras !== undefined) {
		if (typeof record.pageCameras !== "object" || record.pageCameras === null || Array.isArray(record.pageCameras)) {
			return undefined;
		}
		const cameras: Record<string, Camera> = {};
		for (const [page, raw] of Object.entries(record.pageCameras)) {
			const camera = parseCamera(raw);
			if (!isPagePath(page) || camera === undefined) return undefined;
			cameras[page] = camera;
		}
		state.pageCameras = cameras;
	}
	return state;
}

/**
 * The state a page that moved leaves, or nothing when the state never named it
 * (#228, #231). The page the canvas is on and every page's camera are keyed by
 * path, so a move that left them behind would put the canvas on a page that no
 * longer exists. A page carries its whole subtree, so every key inside the one
 * that moved is said again at its new path.
 */
export function pageMovedInState(state: CanvasState, from: string, to: string): CanvasState | undefined {
	const active = state.activePage === undefined ? undefined : carriedPage(state.activePage, from, to);
	const cameras = Object.entries(state.pageCameras ?? {});
	const carriedCameras = cameras.some(([page]) => carriedPage(page, from, to) !== undefined);
	if (active === undefined && !carriedCameras) return undefined;
	const carried: CanvasState = { ...state };
	if (active !== undefined) carried.activePage = active;
	if (state.pageCameras !== undefined) carried.pageCameras = carriedKeys(state.pageCameras, from, to);
	return carried;
}

/** The state trashed pages leave, the pages inside them included. */
export function pagesDroppedFromState(state: CanvasState, pages: readonly string[]): CanvasState | undefined {
	const gone = (page: string): boolean => pages.some((each) => page === each || pageWithin(each, page));
	const active = state.activePage !== undefined && gone(state.activePage);
	const held = Object.keys(state.pageCameras ?? {}).some(gone);
	if (!active && !held) return undefined;
	const dropped: CanvasState = { ...state };
	// the canvas falls back to the root page, which is permanent and cannot go
	if (active) delete dropped.activePage;
	if (state.pageCameras !== undefined) {
		const cameras = { ...state.pageCameras };
		for (const page of Object.keys(cameras)) {
			if (gone(page)) delete cameras[page];
		}
		dropped.pageCameras = cameras;
	}
	return dropped;
}

function parseCamera(value: unknown): Camera | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { x, y, k } = value as Record<string, unknown>;
	if (typeof x !== "number" || typeof y !== "number" || typeof k !== "number") return undefined;
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(k) || k <= 0) return undefined;
	return { x, y, k };
}
