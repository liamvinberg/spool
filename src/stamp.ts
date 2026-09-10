/**
 * The compile-time stamp, taken apart.
 *
 * `frames/cart/frame.tsx:14:3` is the whole of how a hand addresses an
 * element: the file it is written in, relative to `design/`, and the line and
 * column its opening tag starts at. Every side of the lane reads one — the
 * daemon before it parses, the canvas before it draws a path — so the shape is
 * named once here rather than re-derived per reader.
 *
 * The frame shim keeps its own copy, because injected code has no imports.
 */
export interface StampRef {
	/** the file under `design/`: `frames/cart/frame.tsx` */
	rel: string;
	line: number;
	column: number;
}

export function parseStampRef(stamp: string | null | undefined): StampRef | undefined {
	const match = /^(.+):(\d+):(\d+)$/.exec(stamp ?? "");
	if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) return undefined;
	return { rel: match[1], line: Number.parseInt(match[2], 10), column: Number.parseInt(match[3], 10) };
}
