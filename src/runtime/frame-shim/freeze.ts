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
		const webgl = type === "webgl" || type === "webgl2" || type === "experimental-webgl";
		if (webgl) given = { ...(given as object | undefined), preserveDrawingBuffer: true };
		const context = Reflect.apply(nativeGetContext, this, [type, given]);
		if (webgl && context !== null) webglCanvases.add(this);
		return context;
	} as typeof nativeGetContext;
	// a context on an OffscreenCanvas draws WebGL too, copied to the canvases on screen: one shared by a slide's scenes
	// is none of the document's canvases, and still makes it a slide drawn with WebGL (spool#330)
	const Offscreen = globalThis.OffscreenCanvas;
	if (Offscreen === undefined) return;
	const nativeOffscreen = Offscreen.prototype.getContext;
	Offscreen.prototype.getContext = function getContext(this: OffscreenCanvas, type: string, attributes?: unknown) {
		const context = Reflect.apply(nativeOffscreen, this, [type, attributes]);
		if ((type === "webgl" || type === "webgl2") && context !== null && !webglOffscreen.has(this)) {
			webglOffscreen.add(this);
			offscreenWebgl++;
		}
		return context;
	} as typeof nativeOffscreen;
}

/** Canvases the frame made a WebGL context on. */
const webglCanvases = new WeakSet<HTMLCanvasElement>();
/** OffscreenCanvases it made one on, and how many. */
const webglOffscreen = new WeakSet<OffscreenCanvas>();
let offscreenWebgl = 0;
/** Display frames so far in which the frame's own requestAnimationFrame callbacks ran, and the last one's time. */
let delivered = 0;
let deliveredAt = -1;
const counted = (time: number) => {
	if (time === deliveredAt) return;
	deliveredAt = time;
	delivered++;
};

/**
 * What the photo booth's census (census.ts) cannot see from its own world
 * (spool#318): in how many display frames the frame's code had a rAF callback, which the booth
 * reads either side of a timing to tell a loop that runs while nothing moves,
 * and how many canvases in the document hold a WebGL context, OffscreenCanvases among them. The booth calls
 * it in the frame's world; nothing else does.
 */
export function exposeFrameWork(): void {
	Object.defineProperty(window, "__spoolFrameWork", {
		configurable: true,
		value: () => {
			let webgl = offscreenWebgl;
			for (const canvas of document.querySelectorAll("canvas")) if (webglCanvases.has(canvas)) webgl++;
			return { frames: delivered, webgl };
		},
	});
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
// handle -> { cb, native, asked }; a native of 0 is a callback the freeze is holding
const rafs = new Map<number, { cb: FrameRequestCallback; native: number; asked: number }>();
const paused = new Set<Animation>();

export function gateAnimationFrames(): void {
	window.requestAnimationFrame = function requestAnimationFrame(callback: FrameRequestCallback): number {
		if (typeof callback !== "function") {
			throw new TypeError("requestAnimationFrame: parameter 1 is not of type 'Function'");
		}
		const handle = nextRafHandle++;
		const entry = { cb: callback, native: 0, asked: performance.now() };
		rafs.set(handle, entry);
		if (!frozen) {
			entry.native = nativeRaf((time) => {
				rafs.delete(handle);
				counted(time);
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

// Native rAF isolates one callback's throw from the next; the shim's own deliveries do too.
function deliver(callback: FrameRequestCallback, time: number): void {
	counted(time);
	try {
		callback(time - frozenFor);
	} catch (error) {
		setTimeout(() => {
			throw error;
		});
	}
}

/** How long a frame's rAF callback may wait on the renderer before a capture delivers it itself. */
const OVERDUE_MS = 50;

/**
 * A capture's frames (spool#275). Chrome runs no rAF at all in a cross-origin
 * iframe out of the viewport, and an export captures frames wherever the camera
 * left them: a WebGL slide that draws on rAF never drew, and its PDF page showed
 * whatever stood behind its canvas. While a capture settles, a callback the
 * renderer has left waiting is delivered here, on a timer, as a frame on screen
 * would have had it; one on screen is delivered by the renderer before it is due.
 * The returned function stops it.
 */
export function deliverFramesForCapture(): () => void {
	const timer = setInterval(() => {
		if (frozen) return;
		const now = performance.now();
		for (const [handle, entry] of [...rafs]) {
			// a callback a thaw released waits on the renderer too
			if (now - entry.asked < OVERDUE_MS) continue;
			if (entry.native !== 0) nativeCancelRaf(entry.native);
			rafs.delete(handle);
			deliver(entry.cb, now);
		}
	}, 16);
	return () => clearInterval(timer);
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
			deliver(entry.cb, time);
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
