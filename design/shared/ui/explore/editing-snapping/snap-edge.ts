// Resize-edge calculation copied from the canvas for this isolated prototype.
import type { Box } from "./geometry";
const EPS = 1e-6;
const STOPS = ["min", "mid", "max"] as const;
const extentOf = (box: Box, axis: "x" | "y") =>
	axis === "x"
		? { min: box.x, mid: box.x + box.w / 2, max: box.x + box.w }
		: { min: box.y, mid: box.y + box.h / 2, max: box.y + box.h };
export function snapEdge(
	value: number,
	statics: Box[],
	axis: "x" | "y",
	threshold: number,
	extraStops: readonly number[] = [],
): { value: number; guides: number[] } {
	let best: number | undefined;
	for (const target of statics) {
		const stops = extentOf(target, axis);
		for (const stop of STOPS) {
			if (
				Math.abs(stops[stop] - value) <= threshold &&
				(best === undefined || Math.abs(stops[stop] - value) < Math.abs(best - value))
			) {
				best = stops[stop];
			}
		}
	}
	for (const stop of extraStops) {
		if (
			Math.abs(stop - value) <= threshold &&
			(best === undefined || Math.abs(stop - value) < Math.abs(best - value))
		)
			best = stop;
	}
	if (best === undefined) return { value, guides: [] };
	const snapped = best;
	const guides: number[] = extraStops.filter((stop) => Math.abs(stop - snapped) <= EPS);
	for (const target of statics) {
		const stops = extentOf(target, axis);
		for (const stop of STOPS) {
			if (Math.abs(stops[stop] - snapped) <= EPS && !guides.includes(stops[stop])) guides.push(stops[stop]);
		}
	}
	return { value: snapped, guides: guides.sort((a, b) => a - b) };
}
