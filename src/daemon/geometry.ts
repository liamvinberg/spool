import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The frame.json sidecar (#3): geometry only, the one file hands own. Reads
 * heal — anything short of four finite numbers is unplaced — while the API
 * write is strict: a resize that cannot land must fail loudly, never silently
 * (#23 writes only this file, and the seam tests hold it to that).
 */

export interface Geometry {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function sidecarFile(root: string, frame: string): string {
	return join(root, "design", "frames", frame, "frame.json");
}

/** Anything short of four finite numbers reads as unplaced — heal, don't fail. */
export function readGeometry(file: string): Geometry | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return undefined;
	}
	return parseGeometry(parsed);
}

export function parseGeometry(value: unknown): Geometry | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { x, y, w, h } = value as Record<string, unknown>;
	if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) return undefined;
	return { x, y, w, h };
}

/** The canonical sidecar bytes; geometry lands as integers. */
export function writeGeometry(file: string, { x, y, w, h }: Geometry): void {
	const rounded = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
	writeFileSync(file, `${JSON.stringify(rounded, null, "\t")}\n`);
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
