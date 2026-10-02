import type { ColorScheme } from "../../cover";
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

/**
 * The colour scheme a frame on this canvas renders in. A frame is its own
 * document in an iframe, and Chrome hands it the browser's preference, not the
 * colour scheme of the canvas chrome around it, so the canvas's own media query
 * is exactly what every frame on it sees.
 */
export function frameScheme(): ColorScheme {
	return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
