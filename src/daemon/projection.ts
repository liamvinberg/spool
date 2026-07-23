import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_COLS, DEFAULT_ROWS, pxForCells } from "../term/cells";
import { readGeometry, writeGeometry } from "./geometry";
import { termScreenFile, thumbFile } from "./thumbs";

/**
 * The canvas projection of design/frames (#22): every folder holding a frame
 * entry, with geometry from its frame.json sidecar. Geometry is the one
 * thing hands own; a frame born without a sidecar gets one filled in here —
 * placed beside the existing field, written to disk so placement is durable,
 * never re-rolled per request (#3: "optional frame.json, app fills in").
 *
 * The kind discriminant (#42) is the entry filename — frame.tsx is html,
 * term.tsx is terminal — because a kind must stay knowable by every layer
 * even while source is broken mid-edit; a filename survives a syntax error.
 * Both entries in one folder is a discovery error naming the folder: it
 * projects as html so the canvas can show the error document.
 */

export type FrameKind = "html" | "term";

export interface ProjectedFrame {
	name: string;
	kind: FrameKind;
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

export function frameKind(frameDir: string): FrameKind | "conflict" | undefined {
	const html = existsSync(join(frameDir, "frame.tsx"));
	const term = existsSync(join(frameDir, "term.tsx"));
	if (html && term) return "conflict";
	if (term) return "term";
	if (html) return "html";
	return undefined;
}

/** A frame's kind for root + name; conflicted folders count as html so their error shows. */
export function projectedKind(root: string, frame: string): FrameKind | undefined {
	const kind = frameKind(join(root, "design", "frames", frame));
	return kind === "conflict" ? "html" : kind;
}

const DEFAULT_W = 390;
const DEFAULT_H = 844;
const GUTTER = 80;

/** New terminal frames start at the conventional floor, in exact cell pixels. */
const TERM_DEFAULT = pxForCells(DEFAULT_COLS, DEFAULT_ROWS);

function defaultFootprint(kind: FrameKind): { w: number; h: number } {
	return kind === "term" ? TERM_DEFAULT : { w: DEFAULT_W, h: DEFAULT_H };
}

export function listProjectFrames(root: string): Projection {
	const framesDir = join(root, "design", "frames");
	const entries = frameNames(root);
	if (entries === undefined) return { root, frames: [] };

	const placed: ProjectedFrame[] = [];
	const unplaced: { name: string; kind: FrameKind }[] = [];
	for (const name of entries) {
		const kind = projectedKind(root, name) ?? "html";
		const geometry = readGeometry(join(framesDir, name, "frame.json"));
		if (geometry === undefined) {
			unplaced.push({ name, kind });
		} else {
			placed.push({ name, kind, ...geometry, hasThumb: hasThumb(root, name) });
		}
	}

	// new frames land beside the field, on its top line, never on top of it
	let cursor = placed.length === 0 ? GUTTER : Math.max(...placed.map((f) => f.x + f.w)) + GUTTER;
	const baseline = placed.length === 0 ? GUTTER : Math.min(...placed.map((f) => f.y));
	for (const { name, kind } of unplaced) {
		const footprint = defaultFootprint(kind);
		const frame = { name, kind, x: cursor, y: baseline, ...footprint, hasThumb: hasThumb(root, name) };
		cursor += footprint.w + GUTTER;
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

/** Every frame folder holding an entry file, sorted; undefined when frames/ is unreadable. */
export function frameNames(root: string): string[] | undefined {
	const framesDir = join(root, "design", "frames");
	try {
		return readdirSync(framesDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && frameKind(join(framesDir, entry.name)) !== undefined)
			.map((entry) => entry.name)
			.sort();
	} catch {
		return undefined;
	}
}

function hasThumb(root: string, frame: string): boolean {
	// a terminal's cover is its serialized screen, rasterized daemon-side (#42)
	if (projectedKind(root, frame) === "term") return existsSync(termScreenFile(root, frame));
	return existsSync(thumbFile(root, frame));
}

/** One frame's geometry: its sidecar if sound, the default footprint otherwise. Never writes. */
export function frameGeometry(root: string, frame: string): { w: number; h: number } {
	const geometry = readGeometry(join(root, "design", "frames", frame, "frame.json"));
	if (geometry !== undefined) return { w: geometry.w, h: geometry.h };
	return defaultFootprint(projectedKind(root, frame) ?? "html");
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
