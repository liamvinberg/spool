import { readFileSync } from "node:fs";
import { join } from "node:path";
import { realDesignDir, resolveDesignPath } from "./design-path";

/**
 * design/canvas.json — the marker file — read in exactly one place.
 *
 * It started as a stamp nothing ever read back. It now carries the hands'
 * arrangement (#228) and whether the project keeps history (#158), and it is
 * about to carry whatever the next durable turns out to be, so the read lives
 * here rather than once per reader.
 *
 * The rule the file is under: strict on the way in, lenient on the way out. A
 * reader takes the keys it knows and leaves the rest alone, and a file that is
 * corrupt, missing or not a JSON object reads as absent rather than as an
 * error — the canvas works without this file, and a project whose file somebody
 * broke must still open.
 */

export type CanvasFile =
	| { kind: "read"; fields: Record<string, unknown> }
	| { kind: "absent" }
	/** Present, and not an object: the one state a write refuses rather than clobbers. */
	| { kind: "unreadable" };

export function canvasFile(root: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, "canvas.json"));
}

export function readCanvasFile(file: string): CanvasFile {
	let raw: string;
	try {
		// the boundary was answered before the read: this takes a resolved path
		raw = readFileSync(file, "utf8");
	} catch {
		return { kind: "absent" };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { kind: "unreadable" };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { kind: "unreadable" };
	return { kind: "read", fields: parsed as Record<string, unknown> };
}

/**
 * What one project's canvas.json says, for a reader that only wants to know.
 *
 * Every way of having nothing to say — no design/, no file, a file mid-write, a
 * file somebody broke — comes back as no fields, because none of them is a
 * reason to refuse to answer a question about a project.
 */
export function readCanvasFields(root: string): Record<string, unknown> {
	let file: string;
	try {
		file = canvasFile(root);
	} catch {
		return {};
	}
	const held = readCanvasFile(file);
	return held.kind === "read" ? held.fields : {};
}
