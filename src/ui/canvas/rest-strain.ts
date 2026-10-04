/**
 * Live frames hold still when they hold back a canvas at rest.
 *
 * Every live frame draws on the one GPU the canvas draws on. One heavy enough
 * (pixels--glass, a few hundred clipped gradients redrawn every frame at
 * Retina density) held a whole canvas at rest to 6 display frames a second on
 * an M1, nobody touching anything: every hover, every selection and the first
 * frame of every gesture waited on it. So while the canvas rests and a live
 * frame nobody is attending runs, its display frames are sampled now and then,
 * and when they keep coming late the lifecycle holds those frames still where
 * they are (lifecycle.ts), the same hold a camera move puts on them. A canvas
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
	/**
	 * Whether a sample now could be blamed on frames worth holding: the canvas
	 * rests, settled, with a live frame running that nobody is attending.
	 */
	worthChecking(): boolean;
	/** The canvas kept missing frames; hold what is running unattended. */
	crowded(): void;
}

export function watchRestStrain(deps: RestStrainDeps): () => void {
	let stopped = false;
	let strikes = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const next = () => {
		if (!stopped) timer = setTimeout(check, CHECK_EVERY_MS);
	};
	const check = () => {
		if (document.hidden || !deps.worthChecking()) {
			strikes = 0;
			next();
			return;
		}
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
			// the camera moved or a frame was attended while the sample ran: it is of
			// something else
			if (!deps.worthChecking()) strikes = 0;
			else if (median(gaps) > CROWDED_FRAME_MS) strikes++;
			else strikes = 0;
			if (strikes >= STRIKES) {
				strikes = 0;
				deps.crowded();
			}
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

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[sorted.length >> 1] ?? 0;
}
