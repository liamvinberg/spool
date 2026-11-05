import type { RecordedInput } from "../runtime/record-protocol";

/**
 * The cursor drawn into a clip (spool#221), one place per frame, worked out
 * from the whole recording before a frame is drawn. The frame itself is given
 * the hand exactly as it moved; only the cursor drawn over it is smoothed, the
 * way the clips people post are.
 *
 * Smoothing looks both ways along the recording, a Gaussian over the frames
 * either side, so it rounds the tremor and the corners off a move without
 * lagging behind it. Around a press it gives way to the real point, and holds
 * it while a button is down, so a click lands where it landed and a dragged
 * thing stays under the cursor. A cursor that has not moved for
 * {@link IDLE_MS} fades out, and fades back in as soon as it moves again; one
 * that left the frame fades out where it left.
 */
export interface CursorPlace {
	x: number;
	y: number;
	/** 0 hidden to 1 shown. */
	opacity: number;
}

/** How still a cursor stays drawn. */
export const IDLE_MS = 1200;
/** The smoothing's reach, as a Gaussian's sigma, in frames either side. */
const SIGMA_FRAMES = 4;
const REACH_FRAMES = SIGMA_FRAMES * 3;
/** How far from a press the smoothing gives way to the real point. */
const PIN_MS = 150;
const FADE_IN_MS = 100;
const FADE_OUT_MS = 300;

/** Where the cursor is in each of the recording's first `frames` frames, `step` ms apart; null before the hand arrives. */
export function cursorTrack(inputs: readonly RecordedInput[], frames: number, step: number): (CursorPlace | null)[] {
	// the hand as it was, sampled once a frame
	const raw: ({ x: number; y: number; held: boolean; active: number; inside: boolean } | null)[] = [];
	const presses: number[] = [];
	let next = 0;
	let at: { x: number; y: number } | null = null;
	let buttons = 0;
	let active = Number.NEGATIVE_INFINITY;
	let inside = true;
	for (let index = 0; index < frames; index++) {
		const t = index * step;
		for (; next < inputs.length && (inputs[next] as RecordedInput).t <= t; next++) {
			const input = inputs[next] as RecordedInput;
			if (input.kind === "leave") {
				inside = false;
				continue;
			}
			if (!("x" in input)) continue;
			at = { x: input.x, y: input.y };
			active = input.t;
			inside = true;
			if (input.kind === "down") {
				buttons++;
				presses.push(input.t);
			} else if (input.kind === "up") {
				buttons = Math.max(0, buttons - 1);
				presses.push(input.t);
			}
		}
		raw.push(at === null ? null : { ...at, held: buttons > 0, active, inside });
	}

	const weights = Array.from({ length: REACH_FRAMES * 2 + 1 }, (_, i) =>
		Math.exp(-((i - REACH_FRAMES) ** 2) / (2 * SIGMA_FRAMES ** 2)),
	);
	let opacity = 0;
	return raw.map((here, index) => {
		if (here === null) return null;
		let x = 0;
		let y = 0;
		let total = 0;
		for (let offset = -REACH_FRAMES; offset <= REACH_FRAMES; offset++) {
			// the frames before the hand arrived, and past the end, count as where it is nearest
			const there = raw[Math.min(raw.length - 1, Math.max(0, index + offset))] ?? here;
			const weight = weights[offset + REACH_FRAMES] ?? 0;
			x += there.x * weight;
			y += there.y * weight;
			total += weight;
		}
		const t = index * step;
		const near = presses.reduce((most, press) => Math.max(most, 1 - Math.abs(t - press) / PIN_MS), 0);
		const pin = here.held ? 1 : Math.max(0, near);
		const shown = here.inside && (here.held || t - here.active < IDLE_MS);
		opacity = shown ? Math.min(1, opacity + step / FADE_IN_MS) : Math.max(0, opacity - step / FADE_OUT_MS);
		return {
			x: x / total + (here.x - x / total) * pin,
			y: y / total + (here.y - y / total) * pin,
			opacity,
		};
	});
}
