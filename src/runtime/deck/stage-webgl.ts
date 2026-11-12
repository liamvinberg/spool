/**
 * The WebGL contexts a stage's slides draw with (spool#265). A browser keeps only so many alive in one process and,
 * past that, takes the one drawn least lately: a slide kept rendered out of sight, which would come back blank. Chrome
 * keeps sixteen, and one process holds every stage document of the presenter's window, and the room's unless the room
 * plays from an origin of its own. A slide put on ahead, out of sight, draws its first frame and then nothing until it
 * goes on (spool#320): the GPU is the room's.
 */

/** WebGL canvases by the context they draw with. */
const contexts = new WeakMap<HTMLCanvasElement, WebGLRenderingContext | WebGL2RenderingContext>();

/**
 * How many WebGL contexts a stage document holds when its host names no share: the slide on screen's and those of the
 * slides put on ahead and kept behind it, under Chrome's sixteen with some left for whatever shares its process.
 */
export const WEBGL_SHARE = 10;

/** The calls that write to a canvas's drawing buffer, held while their canvas rests. */
const DRAWS = [
	"clear",
	"clearBufferfv",
	"clearBufferiv",
	"clearBufferuiv",
	"clearBufferfi",
	"blitFramebuffer",
	"drawArrays",
	"drawElements",
	"drawArraysInstanced",
	"drawElementsInstanced",
	"drawRangeElements",
] as const;
/** The same of the extensions a context hands out: instanced, multi and base-instance draws. */
const EXTENSION_DRAWS = /^(drawArrays|drawElements|drawRangeElements|multiDraw)/;

/** The slides resting out of sight, by their boxes, and the canvases in them. */
const restingBoxes = new WeakSet<Element>();
const resting = new WeakSet<HTMLCanvasElement>();

/** A slide's canvases draw nothing while it rests out of sight, and draw again as it goes on or wakes. */
export function restWebgl(box: Element, rest: boolean): void {
	if (rest) restingBoxes.add(box);
	else restingBoxes.delete(box);
	for (const canvas of box.querySelectorAll("canvas")) {
		if (rest) resting.add(canvas);
		else resting.delete(canvas);
	}
	if (!rest) unpark((canvases) => canvases.some((canvas) => !resting.has(canvas)));
	// a loop let go with its slide, never cancelled, is let go here too
	for (const [id, frame] of parked) if (frame.canvases.every((canvas) => !canvas.isConnected)) parked.delete(id);
}

/** Its context draws nothing while its slide rests: its last frame stays in its kept drawing buffer. */
function holdWhileResting(canvas: HTMLCanvasElement, context: object): void {
	for (let at: Element | null = canvas; at !== null; at = at.parentElement) {
		if (restingBoxes.has(at)) resting.add(canvas);
	}
	const hold = (calls: Record<string, unknown>, name: string) => {
		const draw = calls[name];
		if (typeof draw !== "function") return;
		calls[name] = function (this: unknown, ...args: unknown[]) {
			if (running !== undefined) {
				if (resting.has(canvas)) running.resting.add(canvas);
				else running.live = true;
			}
			if (resting.has(canvas)) return undefined;
			return draw.apply(this, args);
		};
	};
	const calls = context as Record<string, unknown>;
	for (const name of DRAWS) hold(calls, name);
	const getExtension = calls.getExtension;
	if (typeof getExtension !== "function") return;
	const held = new WeakSet<object>();
	calls.getExtension = function (this: unknown, ...args: unknown[]) {
		const extension: unknown = getExtension.apply(this, args);
		if (typeof extension === "object" && extension !== null && !held.has(extension)) {
			held.add(extension);
			const calls = extension as Record<string, unknown>;
			for (const name in calls) if (EXTENSION_DRAWS.test(name)) hold(calls, name);
		}
		return extension;
	};
}

/**
 * A slide resting out of sight runs no frames (spool#320). A loop of frames, a callback that asks for itself again,
 * that drew on resting canvases and on nothing else is parked as it asks, and asked for again once one of its canvases
 * draws again. The ids a document's frames are given are its own, so a slide cancels a parked frame as any other.
 */
interface ParkedFrame {
	readonly callback: FrameRequestCallback;
	readonly canvases: HTMLCanvasElement[];
}
const parked = new Map<number, ParkedFrame>();
/** The browser's id for each frame asked for, by the id given out for it. */
const asked = new Map<number, number>();
let frameIds = 0;
/** The frame running now, and what it drew on. */
let running: { callback: FrameRequestCallback; resting: Set<HTMLCanvasElement>; live: boolean } | undefined;
let requestFrame: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback);
let cancelFrame: (id: number) => void = (id) => cancelAnimationFrame(id);

function ask(id: number, callback: FrameRequestCallback): void {
	asked.set(
		id,
		requestFrame((time) => {
			asked.delete(id);
			const outer = running;
			running = { callback, resting: new Set(), live: false };
			try {
				callback(time);
			} finally {
				running = outer;
			}
		}),
	);
}

/** The parked frames whose canvases `which` picks asked for again. */
function unpark(which: (canvases: HTMLCanvasElement[]) => boolean): void {
	for (const [id, frame] of parked) {
		if (!which(frame.canvases)) continue;
		parked.delete(id);
		ask(id, frame.callback);
	}
}

/** The document's frames go through the stage, once, before any slide asks for one. */
function watchFrames(): void {
	const frames = window as unknown as {
		[NATIVE_FRAMES]?: [typeof requestAnimationFrame, typeof cancelAnimationFrame];
	};
	frames[NATIVE_FRAMES] ??= [window.requestAnimationFrame, window.cancelAnimationFrame];
	const [request, cancel] = frames[NATIVE_FRAMES];
	requestFrame = (callback) => request.call(window, callback);
	cancelFrame = (id) => cancel.call(window, id);
	window.requestAnimationFrame = (callback) => {
		const id = ++frameIds;
		if (running?.callback === callback && !running.live && running.resting.size > 0) {
			parked.set(id, { callback, canvases: [...running.resting] });
			return id;
		}
		ask(id, callback);
		return id;
	};
	window.cancelAnimationFrame = (id) => {
		parked.delete(id);
		const browser = asked.get(id);
		if (browser === undefined) return;
		asked.delete(id);
		cancelFrame(browser);
	};
}
const NATIVE_FRAMES = Symbol.for("spool.stage.frames");

/**
 * Whether a canvas out of sight may make a WebGL context now, as the stage judges it: one it refuses gets none, so the
 * browser never takes another's to make it.
 */
let allowWebgl: (canvas: HTMLCanvasElement) => boolean = () => true;
export function limitWebgl(allow: (canvas: HTMLCanvasElement) => boolean): void {
	allowWebgl = allow;
}

/**
 * Every WebGL context a slide asks for is known by its canvas, and keeps its drawing buffer, so its last frame can
 * still be read when the slide breaks: without it, a WebGL canvas is cleared once each frame is shown, and a copy reads
 * nothing. Installed once, before any slide runs, in a stage document only. Costs the GPU a copy per frame, which
 * slides can afford.
 */
export function watchWebgl(): void {
	watchFrames();
	const original = HTMLCanvasElement.prototype.getContext;
	function getContext(this: HTMLCanvasElement, kind: string, options?: unknown): RenderingContext | null {
		const isWebgl = kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl";
		if (isWebgl && !contexts.has(this) && !allowWebgl(this)) return null;
		const settings =
			isWebgl && (typeof options === "object" || options === undefined)
				? { ...(options as object | undefined), preserveDrawingBuffer: true }
				: options;
		const context = original.call(this, kind as "2d", settings as CanvasRenderingContext2DSettings);
		if (isWebgl && context !== null && !contexts.has(this)) {
			contexts.set(this, context as unknown as WebGLRenderingContext);
			holdWhileResting(this, context);
			// a loop parked for a slide out of sight may be the one this canvas draws with too
			unpark(() => true);
		}
		return context;
	}
	HTMLCanvasElement.prototype.getContext = getContext as typeof original;
}

/** The WebGL context a canvas draws with, if it has one. */
export function webglOf(canvas: HTMLCanvasElement): WebGLRenderingContext | WebGL2RenderingContext | undefined {
	return contexts.get(canvas);
}

/** How many live WebGL contexts the canvases in `box` hold. */
export function webglIn(box: Element): number {
	let count = 0;
	for (const canvas of box.querySelectorAll("canvas")) if (contexts.get(canvas)?.isContextLost() === false) count++;
	return count;
}

/**
 * The WebGL contexts the canvases in a box let go of given back to the browser now, not whenever the page is next
 * collected. After the tasks already queued, so whatever the slide does as it goes still draws on a live one.
 */
export function releaseWebgl(box: Element): void {
	const held = [...box.querySelectorAll("canvas")].flatMap((canvas) => contexts.get(canvas) ?? []);
	if (held.length === 0) return;
	setTimeout(() => {
		for (const gl of held) if (!gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
	});
}
