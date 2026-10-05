import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, resolveDesignPath } from "./design-path";
import { type Geometry, parseSidecar, type Sidecar } from "./sidecar";

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

export { type Footprint, type Geometry, isFiniteNumber, parseGeometry, parseSidecar, type Sidecar } from "./sidecar";

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
