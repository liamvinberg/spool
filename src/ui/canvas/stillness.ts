import { useState } from "react";

/**
 * Whether the reader has asked for stillness, read once.
 *
 * Read once rather than watched, because everything that draws motion in the rail reads
 * it at mount and lays a settled picture: a preference that flips mid-turn takes effect
 * on the next thing that mounts, which is the same answer the clock gives.
 */
export const stillness = () =>
	typeof window !== "undefined" && typeof window.matchMedia === "function"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;

export function useStillness(): boolean {
	const [still] = useState(stillness);
	return still;
}
