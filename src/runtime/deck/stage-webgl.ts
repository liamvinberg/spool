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
	if (!rest)
		unpark((frame) =>
			frame.slide === undefined ? frame.canvases.some((canvas) => !resting.has(canvas)) : !rests(frame.slide),
		);
	// a loop let go with its slide, never cancelled, is let go here too
	for (const [id, frame] of parked)
		if (
			frame.slide === undefined
				? frame.canvases.every((canvas) => !canvas.isConnected)
				: boxesOf(frame.slide).length === 0
		)
			parked.delete(id);
}

/** Every copy of a slide on the stage, by the slide's frame. */
function boxesOf(slide: string): NodeListOf<Element> {
	return document.querySelectorAll(`[data-spool-stage-slide="${CSS.escape(slide)}"]`);
}

/** Whether a slide rests: every copy of it on the stage rests out of sight. */
function rests(slide: string): boolean {
	const boxes = boxesOf(slide);
	return boxes.length > 0 && [...boxes].every((box) => restingBoxes.has(box));
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
 * A slide resting out of sight runs no frames (spool#320, spool#330). A loop of frames, a callback that asks for itself
 * again, that drew on resting canvases and on nothing else is parked as it asks, and asked for again once one of its
 * canvases draws again. A frame a resting slide's own module asks for is parked too, and asked for again as the slide
 * goes on: the stage tells whose it is by the script that asked, which the stage document's preloads name. A frame
 * asked for by code the slides share (a library, a component of the project's) runs, since it may be another slide's.
 * The ids a document's frames are given are its own, so a slide cancels a parked frame as any other.
 */
interface ParkedFrame {
	readonly callback: FrameRequestCallback;
	readonly canvases: HTMLCanvasElement[];
	/** the slide whose own module asked for it */
	readonly slide?: string;
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

/** The parked frames `which` picks asked for again. */
function unpark(which: (frame: ParkedFrame) => boolean): void {
	for (const [id, frame] of parked) {
		if (!which(frame)) continue;
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
		const slide = restingAsker(new Error().stack ?? "");
		if (slide !== undefined) {
			parked.set(id, { callback, canvases: [], slide });
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

/** Each slide's own module by its address, as the stage document's preloads name them, and how many they were. */
let ownModules = new Map<string, string>();
let preloads = -1;
/**
 * The slide resting out of sight whose own module asked for a frame, by the stack of the ask: the script of the call
 * just below the stage's own. Code of spool's asking on a slide's behalf, a library or a stack read another way is no
 * slide's.
 */
function restingAsker(stack: string): string | undefined {
	const caller = stack.split("\n").filter((line) => /^\s*at /.test(line))[1];
	const script = caller?.match(/(https?:\/\/[^\s()]+?):\d+:\d+/)?.[1];
	if (script === undefined) return undefined;
	const links = document.querySelectorAll<HTMLLinkElement>("link[data-spool-frame]");
	if (links.length !== preloads) {
		preloads = links.length;
		ownModules = new Map([...links].map((link) => [link.href, link.dataset.spoolFrame ?? ""]));
	}
	const slide = ownModules.get(script);
	return slide !== undefined && slide !== "" && rests(slide) ? slide : undefined;
}

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

/** The contexts let go of and not yet given back, oldest first. */
const letGo: (WebGLRenderingContext | WebGL2RenderingContext)[] = [];
let giving = false;
let mayGive: () => boolean = () => true;

/** When the document may spend a moment giving a context back: never while a step plays (spool#330). */
export function giveBackWhen(may: () => boolean): void {
	mayGive = may;
}

/**
 * The WebGL contexts the canvases in a box let go of given back to the browser soon, not whenever the page is next
 * collected: one a frame, after the frame, and only while `giveBackWhen` allows, since giving one back can take tens of
 * milliseconds. Until then the browser counts it, and takes it first should it need room: it is drawn least lately.
 */
export function releaseWebgl(box: Element): void {
	for (const canvas of box.querySelectorAll("canvas")) {
		const gl = contexts.get(canvas);
		if (gl !== undefined) letGo.push(gl);
	}
	giveBackLater();
}

function giveBackLater(): void {
	if (giving || letGo.length === 0) return;
	giving = true;
	requestFrame(() =>
		setTimeout(() => {
			giving = false;
			if (mayGive()) {
				const gl = letGo.shift();
				if (gl !== undefined && !gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
			}
			giveBackLater();
		}),
	);
}
