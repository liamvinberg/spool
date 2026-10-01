import { useEffect, useRef } from "react";
import { createProgram, createResolutionBudget, createTriangle, FULLSCREEN_VERTEX, pixelRatio, prefersReducedMotion } from "./gl";
import screen from "./screen.glsl";
import toneSource from "./tone.glsl";

/** Native scrolling can run ahead of the next draw; the slice overhangs by this much. */
const MARGIN = 280;
const TONE_SCALE = 1 / 4;

/**
 * The page's ground, printed: a one-colour halftone of the pigment field in
 * document coordinates. It reads where to lay ink from the page itself, by
 * selector: the hero it sits beside, a mid-page anchor, the band it floods
 * into, and the copy it keeps clear of.
 */
export function HalftoneField({
	page,
	hero,
	mid,
	band,
	quiet,
}: {
	page: string;
	hero: string;
	mid: string;
	band: string;
	quiet: string;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const surface = canvas.current;
		if (!surface) return;
		const field = createHalftone(surface, { page, hero, mid, band, quiet });
		return () => field?.dispose();
	}, [page, hero, mid, band, quiet]);
	return (
		<div className="m-halftone" aria-hidden="true" data-backend="fallback">
			<canvas ref={canvas} />
		</div>
	);
}

function createHalftone(
	surface: HTMLCanvasElement,
	selectors: { page: string; hero: string; mid: string; band: string; quiet: string },
) {
	const holder = surface.parentElement;
	const page = surface.closest<HTMLElement>(selectors.page);
	if (!holder || !page) return null;
	const gl = surface.getContext("webgl2", {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		powerPreference: "low-power",
	});
	if (!gl) return null;

	let tone: ReturnType<typeof createProgram>;
	let dots: ReturnType<typeof createProgram>;
	try {
		tone = createProgram(gl, FULLSCREEN_VERTEX, toneSource);
		dots = createProgram(gl, FULLSCREEN_VERTEX, screen);
	} catch (error) {
		console.warn("Halftone unavailable:", error);
		return null;
	}
	const triangle = createTriangle(gl);
	const toneTexture = gl.createTexture();
	const toneBuffer = gl.createFramebuffer();
	const budget = createResolutionBudget();
	const reduced = prefersReducedMotion();

	let width = 1;
	let height = 1;
	let ratio = 1;
	let toneSize = [1, 1];
	let elapsed = 0;
	let pullStart: number | null = null;
	let raf = 0;
	let last: number | null = null;
	let disposed = false;
	let accumulated = 0;
	let dirty = true;
	const rects = { hero: [0, -1e4, 0, 0], mid: [0, -1e4, 0, 0], band: [0, -1e4, 0, 0], quiet: [] as number[] };

	const rect = (element: Element | null) => {
		if (!element) return [0, -1e4, 0, 0];
		const box = element.getBoundingClientRect();
		const origin = page.getBoundingClientRect();
		return [box.left - origin.left, box.top - origin.top, box.width, box.height];
	};

	const resize = () => {
		ratio = pixelRatio(1.75, budget.scale);
		surface.width = Math.max(1, Math.round(width * ratio));
		surface.height = Math.max(1, Math.round(height * ratio));
		toneSize = [Math.max(4, Math.round(width * TONE_SCALE)), Math.max(4, Math.round(height * TONE_SCALE))];
		gl.bindTexture(gl.TEXTURE_2D, toneTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, toneSize[0], toneSize[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindFramebuffer(gl.FRAMEBUFFER, toneBuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, toneTexture, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	};

	const measure = () => {
		if (disposed) return;
		width = Math.max(1, page.clientWidth);
		height = Math.max(1, window.innerHeight) + MARGIN * 2;
		holder.style.setProperty("--m-halftone-height", `${height}px`);
		rects.hero = rect(page.querySelector(selectors.hero));
		rects.mid = rect(page.querySelector(selectors.mid));
		rects.band = rect(page.querySelector(selectors.band));
		const quiet = [...page.querySelectorAll(selectors.quiet)].slice(0, 8).map(rect);
		while (quiet.length < 8) quiet.push([0, -1e4, 0, 0]);
		rects.quiet = quiet.flat();
		resize();
		holder.dataset.backend = "webgl";
		draw();
	};

	const draw = () => {
		if (disposed || document.hidden) return;
		const pageTop = page.getBoundingClientRect().top;
		// The slice's top, in the page's own coordinates.
		const top = Math.round(-pageTop - MARGIN);
		holder.style.transform = `translate3d(0, ${top}px, 0)`;
		const pull = reduced.matches ? 1 : pullStart === null ? 0 : Math.min((elapsed - pullStart) / 1.9, 1);

		gl.useProgram(tone.program);
		gl.bindFramebuffer(gl.FRAMEBUFFER, toneBuffer);
		gl.viewport(0, 0, toneSize[0], toneSize[1]);
		gl.uniform2f(tone.uniform("u_size"), width, height);
		gl.uniform1f(tone.uniform("u_top"), top);
		gl.uniform1f(tone.uniform("u_time"), reduced.matches ? 0 : elapsed);
		gl.uniform4fv(tone.uniform("u_hero"), rects.hero);
		gl.uniform4fv(tone.uniform("u_mid"), rects.mid);
		gl.uniform4fv(tone.uniform("u_band"), rects.band);
		gl.uniform4fv(tone.uniform("u_quiet[0]"), rects.quiet);
		triangle.draw();
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		gl.useProgram(dots.program);
		gl.viewport(0, 0, surface.width, surface.height);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, toneTexture);
		gl.uniform1i(dots.uniform("u_tone"), 0);
		gl.uniform2f(dots.uniform("u_size"), width, height);
		gl.uniform1f(dots.uniform("u_top"), top);
		gl.uniform1f(dots.uniform("u_ratio"), ratio);
		gl.uniform1f(dots.uniform("u_cell"), width < 700 ? 5.5 : 7);
		gl.uniform1f(dots.uniform("u_pull"), pull);
		triangle.draw();
	};

	const running = () => !disposed && !document.hidden && !reduced.matches;
	const tick = (stamp: number) => {
		raf = 0;
		if (!running()) return;
		const interval = last === null ? 0 : stamp - last;
		last = stamp;
		elapsed += Math.min(interval, 50) / 1000;
		accumulated += interval;
		if (pullStart === null) pullStart = elapsed + 0.12;
		if (budget.sample(interval)) resize();
		// The print drifts slowly: 30 draws a second is plenty, except while the
		// squeegee is moving or the page has scrolled since the last draw.
		const pulling = elapsed - pullStart < 2;
		if (dirty || pulling || accumulated >= 1000 / 30 - 1) {
			draw();
			accumulated = 0;
			dirty = false;
		}
		raf = window.requestAnimationFrame(tick);
	};
	const sync = () => {
		window.cancelAnimationFrame(raf);
		raf = 0;
		last = null;
		budget.reset();
		draw();
		if (running()) raf = window.requestAnimationFrame(tick);
	};
	const onScroll = () => {
		dirty = true;
		if (!raf) draw();
	};
	const observer = new ResizeObserver(measure);
	observer.observe(page);
	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", measure, { passive: true });
	reduced.addEventListener("change", sync);
	document.addEventListener("visibilitychange", sync);
	void document.fonts.ready.then(measure);
	measure();
	sync();

	return {
		dispose() {
			disposed = true;
			window.cancelAnimationFrame(raf);
			observer.disconnect();
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", measure);
			reduced.removeEventListener("change", sync);
			document.removeEventListener("visibilitychange", sync);
			triangle.dispose();
			gl.deleteProgram(tone.program);
			gl.deleteProgram(dots.program);
			gl.deleteTexture(toneTexture);
			gl.deleteFramebuffer(toneBuffer);
		},
	};
}
