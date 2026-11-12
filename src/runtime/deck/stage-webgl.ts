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

/** The calls that draw, held while their canvas rests. */
const DRAWS = [
	"clear",
	"drawArrays",
	"drawElements",
	"drawArraysInstanced",
	"drawElementsInstanced",
	"drawRangeElements",
] as const;

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
}

/** Its context draws nothing while its slide rests: its last frame stays in its kept drawing buffer. */
function holdWhileResting(canvas: HTMLCanvasElement, context: object): void {
	for (let at: Element | null = canvas; at !== null; at = at.parentElement) {
		if (restingBoxes.has(at)) resting.add(canvas);
	}
	const calls = context as Record<string, unknown>;
	for (const name of DRAWS) {
		const draw = calls[name];
		if (typeof draw !== "function") continue;
		calls[name] = function (this: unknown, ...args: unknown[]) {
			if (resting.has(canvas)) return undefined;
			return draw.apply(this, args);
		};
	}
}

/**
 * Every WebGL context a slide asks for is known by its canvas, and keeps its drawing buffer, so its last frame can
 * still be read when the slide breaks: without it, a WebGL canvas is cleared once each frame is shown, and a copy reads
 * nothing. Installed once, before any slide runs, in a stage document only. Costs the GPU a copy per frame, which
 * slides can afford.
 */
export function watchWebgl(): void {
	const original = HTMLCanvasElement.prototype.getContext;
	function getContext(this: HTMLCanvasElement, kind: string, options?: unknown): RenderingContext | null {
		const isWebgl = kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl";
		const settings =
			isWebgl && (typeof options === "object" || options === undefined)
				? { ...(options as object | undefined), preserveDrawingBuffer: true }
				: options;
		const context = original.call(this, kind as "2d", settings as CanvasRenderingContext2DSettings);
		if (isWebgl && context !== null && !contexts.has(this)) {
			contexts.set(this, context as unknown as WebGLRenderingContext);
			holdWhileResting(this, context);
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
