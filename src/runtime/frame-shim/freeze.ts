import { nativeCancelRaf, nativeRaf } from "./natives";

/**
 * An export reads a canvas after frame code's own task has finished (#174):
 * whatever WebGL drew is already gone by then, because the spec has the
 * browser clear the drawing buffer once it is done compositing, unless the
 * context was created with preserveDrawingBuffer. A 2D context has no such
 * step, so only webgl/webgl2 need the override — and it overrides a frame
 * author's own `false` too, since an accurate export is the point, not a
 * setting to negotiate with.
 */
export function preserveDrawingBuffers(): void {
	const nativeGetContext = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = function getContext(
		this: HTMLCanvasElement,
		type: string,
		attributes?: unknown,
	) {
		let given = attributes;
		if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
			given = { ...(given as object | undefined), preserveDrawingBuffer: true };
		}
		return Reflect.apply(nativeGetContext, this, [type, given]);
	} as typeof nativeGetContext;
}

/**
 * The freeze (#171, #172). A live frame holds its own animation rather than
 * paying for frames nobody is reading — while the camera moves, where a 1.5s
 * pan over eight animated frames spent 265 ms of it inside their rAF loops,
 * and while nothing has attended the frame for a long minute, where the same
 * eight cost 45% of a core for as long as the tab stayed open.
 *
 * Gating rAF is the load-bearing half. getAnimations() covers CSS and Web
 * Animations and has never heard of a rAF loop, which is what a canvas
 * animation and every spring actually are. Held callbacks are re-delivered on
 * thaw and never cancelled — a loop that loses its callback is a frame that
 * never animates again.
 *
 * The clock holds with them. Every timestamp this rAF hands out is the real
 * one less the time spent frozen, so a loop that integrates `time - last`
 * resumes with an ordinary frame's delta instead of a minute's worth, and the
 * animation continues from where it stood rather than leaping to where it
 * would have been. Paused animations already resume this way — the clock
 * offset is only rAF being told the same thing. It never runs backwards:
 * the offset accrues real elapsed time, so it can never exceed the timestamp
 * it is subtracted from.
 *
 * Only rAF's own timestamp holds. `performance.now()` is the frame's, read
 * straight, and a loop that stamps a start with one and measures against the
 * other reads an elapsed short by the freeze. That is the same trade the
 * platform makes for a paused animation's currentTime, and the alternative —
 * a shimmed clock the whole document reads — would be spool lying to frame
 * code about the time of day.
 *
 * The shim's own nativeRaf stays live under the freeze, and on real time, for
 * the same reason it is bound before frame code runs: a capture's settle rides
 * it. A frozen iframe keeps compositing its last painted pixels, so nothing
 * visibly changes; the animation simply holds where it stood.
 */
let frozen = false;
let frozenAt = 0;
let frozenFor = 0;
let nextRafHandle = 1;
// handle -> { cb, native }; a native of 0 is a callback the freeze is holding
const rafs = new Map<number, { cb: FrameRequestCallback; native: number }>();
const paused = new Set<Animation>();

export function gateAnimationFrames(): void {
	window.requestAnimationFrame = function requestAnimationFrame(callback: FrameRequestCallback): number {
		if (typeof callback !== "function") {
			throw new TypeError("requestAnimationFrame: parameter 1 is not of type 'Function'");
		}
		const handle = nextRafHandle++;
		const entry = { cb: callback, native: 0 };
		rafs.set(handle, entry);
		if (!frozen) {
			entry.native = nativeRaf((time) => {
				rafs.delete(handle);
				callback(time - frozenFor);
			});
		}
		return handle;
	};

	window.cancelAnimationFrame = function cancelAnimationFrame(handle: number): void {
		const entry = rafs.get(handle);
		if (entry === undefined) return;
		rafs.delete(handle);
		if (entry.native !== 0) nativeCancelRaf(entry.native);
	};
}

// The freeze takes hold this tick rather than one frame later: whatever the
// renderer had already scheduled joins the held callbacks instead of firing.
function holdFrames(): void {
	for (const entry of rafs.values()) {
		if (entry.native === 0) continue;
		nativeCancelRaf(entry.native);
		entry.native = 0;
	}
}

function releaseFrames(): void {
	const due: number[] = [];
	for (const pair of rafs) if (pair[1].native === 0) due.push(pair[0]);
	if (due.length === 0) return;
	nativeRaf((time) => {
		// re-frozen inside the same tick: they stay held for the next thaw
		if (frozen) return;
		for (const handle of due) {
			const entry = rafs.get(handle);
			// cancelled while held, or already delivered by an earlier thaw
			if (entry === undefined) continue;
			rafs.delete(handle);
			try {
				entry.cb(time - frozenFor);
			} catch (error) {
				// one held callback's throw is not the next one's problem —
				// native rAF isolates them, so this does too
				setTimeout(() => {
					throw error;
				});
			}
		}
	});
}

function holdAnimations(): void {
	let running: Animation[] = [];
	try {
		running = document.getAnimations();
	} catch {}
	for (const animation of running) {
		if (animation.playState !== "running") continue;
		try {
			animation.pause();
		} catch {
			continue;
		}
		paused.add(animation);
	}
}

function releaseAnimations(): void {
	for (const animation of paused) {
		try {
			animation.play();
		} catch {}
	}
	paused.clear();
}

export function setFrozen(on: boolean): void {
	if (on === frozen) return;
	frozen = on;
	if (on) {
		frozenAt = performance.now();
		holdFrames();
		holdAnimations();
	} else {
		// banked before anything is released: the thaw's own callbacks read it
		frozenFor += performance.now() - frozenAt;
		releaseAnimations();
		releaseFrames();
	}
}
