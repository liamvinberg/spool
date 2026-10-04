/**
 * Live frames hold still when they hold back a canvas at rest.
 *
 * Every live frame draws on the one GPU the canvas draws on. One heavy enough
 * (pixels--glass, a few hundred clipped gradients redrawn every frame at
 * Retina density) held a whole canvas at rest to 6 display frames a second on
 * an M1, nobody touching anything: every hover, every selection and the first
 * frame of every gesture waited on it. So while the canvas rests and live
 * frames nobody is attending run, its display frames are sampled now and then,
 * and when they keep coming late those frames are held still where they are
 * (lifecycle.ts), the same hold a camera move puts on them.
 *
 * Holding them is a guess that they are the cause, and the next sample checks
 * it. A canvas still late with them held is late for something else (a power
 * saver capping it, another app on the GPU), so they are let go, and the same
 * frames are not blamed again until what runs unattended changes. A canvas
 * whose frames keep up is never touched: nothing is held until frames are
 * missed, twice running.
 */

/** A display frame this late, at the median of a sample, is a canvas visibly behind at any refresh rate. */
export const CROWDED_FRAME_MS = 25;
/** Display frames in one sample. */
const SAMPLE_FRAMES = 10;
/** How often a canvas at rest is sampled while there is something running to hold. */
export const CHECK_EVERY_MS = 1000;
/** Late samples in a row before the frames are held, so one slow moment never is. */
const STRIKES = 2;

export interface RestStrainDeps {
	/** The camera rests, and has long enough that its settle is not what a sample sees. */
	resting(): boolean;
	/** Live frames running right now that nobody is attending: what a late canvas is blamed on. */
	suspects(): readonly string[];
	/** Hold these frames still. */
	hold(frames: readonly string[]): void;
	/** Let these go again: holding them did not help. */
	release(frames: readonly string[]): void;
}

export function watchRestStrain(deps: RestStrainDeps): () => void {
	let stopped = false;
	let strikes = 0;
	/** Frames held on the last blame, whose hold the next sample checks. */
	let checking: readonly string[] | undefined;
	/** The frames a check acquitted, never blamed again while they are what runs. */
	let acquitted: string | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const next = () => {
		if (!stopped) timer = setTimeout(check, CHECK_EVERY_MS);
	};
	const check = () => {
		if (document.hidden || !deps.resting()) {
			// a hold the camera interrupted is kept: nothing has said it was wrong
			strikes = 0;
			checking = undefined;
			next();
			return;
		}
		const held = checking;
		if (held !== undefined) {
			checking = undefined;
			sample((late) => {
				if (!late) return;
				deps.release(held);
				acquitted = key(held);
			});
			return;
		}
		const suspects = deps.suspects();
		if (suspects.length === 0 || key(suspects) === acquitted) {
			strikes = 0;
			next();
			return;
		}
		acquitted = undefined;
		sample((late) => {
			strikes = late ? strikes + 1 : 0;
			if (strikes < STRIKES) return;
			strikes = 0;
			deps.hold(suspects);
			checking = suspects;
		});
	};
	/** Time a run of display frames, and say whether they came late, unless the camera moved meanwhile. */
	const sample = (judge: (late: boolean) => void) => {
		const gaps: number[] = [];
		let last: number | undefined;
		const tick = () => {
			if (stopped) return;
			// one clock throughout, as in motion-strain.ts: a frame's own timestamp
			// is when it began, not when this ran
			const now = performance.now();
			if (last !== undefined) gaps.push(now - last);
			last = now;
			if (gaps.length < SAMPLE_FRAMES) {
				requestAnimationFrame(tick);
				return;
			}
			// a gesture during the sample made it a sample of the gesture
			if (deps.resting()) judge(median(gaps) > CROWDED_FRAME_MS);
			else strikes = 0;
			next();
		};
		requestAnimationFrame(tick);
	};
	next();
	return () => {
		stopped = true;
		if (timer !== undefined) clearTimeout(timer);
	};
}

const key = (frames: readonly string[]) => [...frames].sort().join("\0");

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[sorted.length >> 1] ?? 0;
}
