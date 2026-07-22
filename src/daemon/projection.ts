import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readGeometry, writeGeometry } from "./geometry";
import { thumbFile } from "./thumbs";

/**
 * The canvas projection of design/frames (#22): every folder holding a
 * frame.tsx, with geometry from its frame.json sidecar. Geometry is the one
 * thing hands own; a frame born without a sidecar gets one filled in here —
 * placed beside the existing field, written to disk so placement is durable,
 * never re-rolled per request (#3: "optional frame.json, app fills in").
 */

export interface ProjectedFrame {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	hasThumb: boolean;
}

export interface Projection {
	root: string;
	frames: ProjectedFrame[];
}

const DEFAULT_W = 390;
const DEFAULT_H = 844;
const GUTTER = 80;

export function listProjectFrames(root: string): Projection {
	const framesDir = join(root, "design", "frames");
	const entries = frameNames(root);
	if (entries === undefined) return { root, frames: [] };

	const placed: ProjectedFrame[] = [];
	const unplaced: string[] = [];
	for (const name of entries) {
		const geometry = readGeometry(join(framesDir, name, "frame.json"));
		if (geometry === undefined) {
			unplaced.push(name);
		} else {
			placed.push({ name, ...geometry, hasThumb: hasThumb(root, name) });
		}
	}

	// new frames land beside the field, on its top line, never on top of it
	let cursor = placed.length === 0 ? GUTTER : Math.max(...placed.map((f) => f.x + f.w)) + GUTTER;
	const baseline = placed.length === 0 ? GUTTER : Math.min(...placed.map((f) => f.y));
	for (const name of unplaced) {
		const frame = { name, x: cursor, y: baseline, w: DEFAULT_W, h: DEFAULT_H, hasThumb: hasThumb(root, name) };
		cursor += DEFAULT_W + GUTTER;
		try {
			writeGeometry(join(framesDir, name, "frame.json"), frame);
		} catch {
			// read-only checkout: placement stays deterministic within this daemon run
		}
		placed.push(frame);
	}

	placed.sort((a, b) => a.name.localeCompare(b.name));
	return { root, frames: placed };
}

/** Every frame folder holding a frame.tsx, sorted; undefined when frames/ is unreadable. */
export function frameNames(root: string): string[] | undefined {
	const framesDir = join(root, "design", "frames");
	try {
		return readdirSync(framesDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && existsSync(join(framesDir, entry.name, "frame.tsx")))
			.map((entry) => entry.name)
			.sort();
	} catch {
		return undefined;
	}
}

function hasThumb(root: string, frame: string): boolean {
	return existsSync(thumbFile(root, frame));
}

/** One frame's geometry: its sidecar if sound, the default footprint otherwise. Never writes. */
export function frameGeometry(root: string, frame: string): { w: number; h: number } {
	const geometry = readGeometry(join(root, "design", "frames", frame, "frame.json"));
	return geometry === undefined ? { w: DEFAULT_W, h: DEFAULT_H } : { w: geometry.w, h: geometry.h };
}

export interface ProjectSummary {
	frameCount: number;
	/** Up to three thumbnail-backed frame names, freshest capture first. */
	covers: string[];
}

/** One home card (#13): registry identity plus the summary scan. */
export interface ProjectCard extends ProjectSummary {
	name: string;
	root: string;
	openedAt: string;
}

/** The home card's read: a pure scan, never fills sidecars, tolerates a vanished disk. */
export function summarizeProject(root: string): ProjectSummary {
	const names = frameNames(root);
	if (names === undefined) return { frameCount: 0, covers: [] };
	const covers = names
		.map((name) => ({ name, shotAt: thumbMtime(root, name) }))
		.filter((cover) => cover.shotAt !== undefined)
		.sort((a, b) => (b.shotAt as number) - (a.shotAt as number))
		.slice(0, 3)
		.map((cover) => cover.name);
	return { frameCount: names.length, covers };
}

function thumbMtime(root: string, frame: string): number | undefined {
	try {
		return statSync(thumbFile(root, frame)).mtimeMs;
	} catch {
		return undefined;
	}
}
