import type { Camera } from "../api";
import { type Box, intersects, visibleWorldRect } from "./camera";

/**
 * The frames a resting camera shows, by name: what the daemon's photo booth
 * photographs first, ahead of the rest of the page and of everything else.
 *
 * The viewport itself, with no ring: the ring is where a frame mounts before
 * it is seen (#81), and a cover for a frame just off screen is a pan away from
 * mattering, which is exactly what the rest of the page already means to the
 * booth.
 */
export function framesOnScreen(
	frames: ReadonlyArray<Box & { name: string }>,
	camera: Camera | null,
	viewport: { width: number; height: number } | null,
): string[] {
	if (camera === null || viewport === null || viewport.width <= 0 || viewport.height <= 0) return [];
	const seen = visibleWorldRect(camera, viewport.width, viewport.height, 0);
	return frames.filter((frame) => intersects(frame, seen)).map((frame) => frame.name);
}
