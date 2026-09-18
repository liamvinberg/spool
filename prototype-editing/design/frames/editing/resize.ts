export type ResizeEdge = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const MIN_SIZE = 0.01;
const MAX_SIZE = Number.MAX_SAFE_INTEGER;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

function bounds(min: number, max: number) {
	const lower = clamp(finite(min, MIN_SIZE), MIN_SIZE, MAX_SIZE);
	// CSS gives the minimum precedence when min and max contradict each other.
	const upper = Math.max(lower, clamp(Number.isNaN(max) ? MAX_SIZE : max, MIN_SIZE, MAX_SIZE));
	return { min: lower, max: upper };
}

// All geometry is relative to the gesture's original, unzoomed border box.
export function resizeBox(
	start: { width: number; height: number },
	edge: ResizeEdge,
	dx: number,
	dy: number,
	center: boolean,
	proportional: boolean,
	limits: { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number },
): { width: number; height: number; shiftX: number; shiftY: number } {
	const originalWidth = clamp(finite(start.width, 1), MIN_SIZE, MAX_SIZE);
	const originalHeight = clamp(finite(start.height, 1), MIN_SIZE, MAX_SIZE);
	const horizontal = edge.includes("w") ? -1 : edge.includes("e") ? 1 : 0;
	const vertical = edge.includes("n") ? -1 : edge.includes("s") ? 1 : 0;
	const multiplier = center ? 2 : 1;
	const changeWidth = horizontal * clamp(finite(dx, 0), -MAX_SIZE, MAX_SIZE) * multiplier;
	const changeHeight = vertical * clamp(finite(dy, 0), -MAX_SIZE, MAX_SIZE) * multiplier;
	const widthBounds = bounds(limits.minWidth, limits.maxWidth);
	const heightBounds = bounds(limits.minHeight, limits.maxHeight);
	let width = originalWidth + changeWidth;
	let height = originalHeight + changeHeight;
	if (proportional) {
		const relativeWidth = changeWidth / originalWidth;
		const relativeHeight = changeHeight / originalHeight;
		const dominant = Math.abs(relativeWidth) >= Math.abs(relativeHeight) ? relativeWidth : relativeHeight;
		const minimumScale = Math.max(widthBounds.min / originalWidth, heightBounds.min / originalHeight);
		const maximumScale = Math.min(widthBounds.max / originalWidth, heightBounds.max / originalHeight);
		// If no shared scale satisfies both axes, the dimension limits take priority.
		const scale = minimumScale <= maximumScale ? clamp(1 + dominant, minimumScale, maximumScale) : 1 + dominant;
		width = originalWidth * scale;
		height = originalHeight * scale;
	}
	width = clamp(width, widthBounds.min, widthBounds.max);
	height = clamp(height, heightBounds.min, heightBounds.max);
	const shiftX =
		center || (proportional && horizontal === 0)
			? (originalWidth - width) / 2
			: horizontal < 0
				? originalWidth - width
				: 0;
	const shiftY =
		center || (proportional && vertical === 0)
			? (originalHeight - height) / 2
			: vertical < 0
				? originalHeight - height
				: 0;
	return { width, height, shiftX, shiftY };
}
