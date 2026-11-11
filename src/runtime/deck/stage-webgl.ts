/**
 * The WebGL contexts a stage's slides draw with (spool#265). A browser keeps only so many alive in one process and,
 * past that, takes the one drawn least lately: a slide kept rendered out of sight, which would come back blank. Chrome
 * keeps sixteen, and one process holds every stage document of the presenter's window and the room's.
 */

/** WebGL canvases by the context they draw with. */
const contexts = new WeakMap<HTMLCanvasElement, WebGLRenderingContext | WebGL2RenderingContext>();
let made: (() => void) | undefined;

/**
 * How many WebGL contexts one stage document keeps: three share a process (the presenter's slide, its next preview
 * and the room), each two for a moment while a new build takes over, so twelve at most, under Chrome's sixteen with
 * some left for the canvas.
 */
export const WEBGL_KEPT = 2;

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
			made?.();
		}
		return context;
	}
	HTMLCanvasElement.prototype.getContext = getContext as typeof original;
}

/** Hears each WebGL context a slide makes from now on. */
export function onWebglMade(listener: () => void): void {
	made = listener;
}

/** The WebGL context a canvas draws with, if it has one. */
export function webglOf(canvas: HTMLCanvasElement): WebGLRenderingContext | WebGL2RenderingContext | undefined {
	return contexts.get(canvas);
}

/** How many WebGL contexts the canvases in `box` hold. */
export function webglIn(box: Element): number {
	let count = 0;
	for (const canvas of box.querySelectorAll("canvas")) if (contexts.has(canvas)) count++;
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
