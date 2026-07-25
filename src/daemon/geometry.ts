import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, resolveDesignPath } from "./design-path";

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

/** The sidecar rides in the frame's folder — it moves when the folder moves (#39). */
export function sidecarFileIn(frameDir: string): string {
	return join(frameDir, "frame.json");
}

/** Anything short of four finite numbers reads as unplaced — heal, don't fail. */
export function readGeometry(file: string, designDir: string): Geometry | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(resolveDesignPath(designDir, file), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
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
export function writeGeometry(file: string, { x, y, w, h }: Geometry, designDir: string): void {
	writeFileSync(resolveDesignPath(designDir, file), geometryBytes({ x, y, w, h }));
}

/** Fill a newly discovered frame without overwriting an authored sidecar. */
export function writeGeometryIfAbsent(file: string, geometry: Geometry, designDir: string): Geometry | undefined {
	const target = resolveDesignPath(designDir, file);
	try {
		writeFileSync(target, geometryBytes(geometry), { flag: "wx" });
		return roundedGeometry(geometry);
	} catch (error) {
		if (isAlreadyExists(error)) return readGeometry(target, designDir);
		throw error;
	}
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
