/**
 * What a frame.json sidecar's bytes say (#3), read without touching a disk: the
 * daemon reads the file and the cloud reads its copy of it, and both have to
 * place the same frame in the same spot.
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

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** A size spool can place: zero and below are not footprints, they are mistakes. */
function isPositiveNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value > 0;
}

/**
 * What a placeholder frame says of the work coming to it: a frame folder whose sidecar holds
 * a `placeholder` record and no frame.tsx yet. Spool writes it the moment a designer starts,
 * so the canvas, and every teammate's canvas through sync, shows where the work will land.
 */
export interface PlaceholderNote {
	/** the direction's name, in the delegation's own words */
	title?: string;
	/** the designer's brief, cut short */
	brief?: string;
	/** when the designer started, as an ISO time */
	since?: string;
}

/** The placeholder record in a sidecar's value; nothing when it holds none. */
export function parsePlaceholder(value: unknown): PlaceholderNote | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const note = (value as Record<string, unknown>).placeholder;
	if (typeof note !== "object" || note === null || Array.isArray(note)) return undefined;
	const { title, brief, since } = note as Record<string, unknown>;
	return {
		...(typeof title === "string" && title !== "" ? { title } : {}),
		...(typeof brief === "string" && brief !== "" ? { brief } : {}),
		...(typeof since === "string" && since !== "" ? { since } : {}),
	};
}
