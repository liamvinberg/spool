import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, resolveDesignPath } from "./design-path";

/**
 * The frame.json sidecar (#3): geometry only, the one file hands own. Reads
 * heal — bytes that state no usable size are unplaced — while the API write is
 * strict: a resize that cannot land must fail loudly, never silently (#23
 * writes only this file, and the seam tests hold it to that).
 *
 * A size with no position is the authoring shape (#113): the agent writes the
 * size, spool writes the position, so an agent never types a coordinate unless
 * it means to move something and never lands a frame on top of another.
 */

export interface Geometry {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** A size awaiting a position: what an agent states, spool completes. */
export interface Footprint {
	w: number;
	h: number;
}

/**
 * What a sidecar's bytes state. `sized` is deliberate authoring and `none` is
 * everything spool may conclude nothing from, which includes a write caught in
 * flight — the two must never collapse, because one is completed and the other
 * is left strictly alone.
 */
export type Sidecar =
	| { kind: "placed"; geometry: Geometry }
	| { kind: "sized"; footprint: Footprint }
	| { kind: "none" };

/** The sidecar rides in the frame's folder — it moves when the folder moves (#39). */
export function sidecarFileIn(frameDir: string): string {
	return join(frameDir, "frame.json");
}

/** Unreadable or unusable bytes read as `none` — heal, don't fail. */
export function readSidecar(file: string, designDir: string): Sidecar {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(resolveDesignPath(designDir, file), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return { kind: "none" };
	}
	return parseSidecar(parsed);
}

export function parseSidecar(value: unknown): Sidecar {
	const geometry = parseGeometry(value);
	if (geometry !== undefined) return { kind: "placed", geometry };
	const footprint = parseFootprint(value);
	if (footprint !== undefined) return { kind: "sized", footprint };
	return { kind: "none" };
}

export function parseGeometry(value: unknown): Geometry | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { x, y, w, h } = value as Record<string, unknown>;
	if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) return undefined;
	return { x, y, w, h };
}

/**
 * A size and no position: two positive numbers, with neither coordinate present.
 * A stated coordinate spool cannot use is not half an instruction to improve on
 * — the sidecar reads as `none` and spool leaves the bytes where they are.
 */
function parseFootprint(value: unknown): Footprint | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { x, y, w, h } = value as Record<string, unknown>;
	if (x !== undefined || y !== undefined) return undefined;
	if (!isPositiveNumber(w) || !isPositiveNumber(h)) return undefined;
	return { w, h };
}

/** The canonical sidecar bytes; geometry lands as integers. */
export function writeGeometry(file: string, { x, y, w, h }: Geometry, designDir: string): void {
	writeFileSync(resolveDesignPath(designDir, file), geometryBytes({ x, y, w, h }));
}

/**
 * Give a newly discovered frame its place: create the sidecar, or complete one
 * that states a size and no position. A placement already on disk wins, and so
 * do bytes spool can conclude nothing from — that is what keeps a write caught
 * in flight from being replaced by a guess.
 */
export function writePlacement(file: string, geometry: Geometry, designDir: string): Geometry | undefined {
	const target = resolveDesignPath(designDir, file);
	try {
		writeFileSync(target, geometryBytes(geometry), { flag: "wx" });
		return roundedGeometry(geometry);
	} catch (error) {
		if (!isAlreadyExists(error)) throw error;
	}
	const sidecar = readSidecar(target, designDir);
	if (sidecar.kind === "placed") return sidecar.geometry;
	if (sidecar.kind === "none") return undefined;
	// the size that lands is the one on disk, not the caller's: the file may have
	// been authored between its read and this write, and the author owns the size
	const placed = { ...geometry, ...sidecar.footprint };
	writeFileSync(target, geometryBytes(placed));
	return roundedGeometry(placed);
}

function geometryBytes(geometry: Geometry): string {
	return `${JSON.stringify(roundedGeometry(geometry), null, "\t")}\n`;
}

function roundedGeometry({ x, y, w, h }: Geometry): Geometry {
	return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "EEXIST";
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** A size spool can place: zero and below are not footprints, they are mistakes. */
function isPositiveNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value > 0;
}
