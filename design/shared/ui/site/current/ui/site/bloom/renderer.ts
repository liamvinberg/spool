import fragment from "./field.glsl";
import { createResolutionBudget, drawingSize } from "./resolution";

const vertex = `attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

// Native scrolling can advance before JavaScript paints the next frame.
const scrollMargin = 256;

function createPipeline(gl: WebGLRenderingContext) {
	const program = gl.createProgram();
	const buffer = gl.createBuffer();
	const shaders: WebGLShader[] = [];
	const dispose = () => {
		gl.deleteBuffer(buffer);
		gl.deleteProgram(program);
		for (const shader of shaders) gl.deleteShader(shader);
	};
	try {
		if (!program || !buffer) throw new Error("Bloom allocation failed");
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertex],
			[gl.FRAGMENT_SHADER, fragment],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Bloom shader allocation failed");
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			gl.attachShader(program, shader);
		}
		gl.bindAttribLocation(program, 0, "a_position");
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(gl.getProgramInfoLog(program) ?? "Bloom shader link failed");
		}
		// biome-ignore lint/correctness/useHookAtTopLevel: WebGL useProgram binds a shader program, not a React hook.
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		// One triangle covers the viewport without a shared diagonal edge.
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		const uniform = (name: string) => gl.getUniformLocation(program, name);
		return {
			dispose,
			uniforms: {
				size: uniform("u_size"),
				time: uniform("u_time"),
				scroll: uniform("u_scroll"),
				total: uniform("u_total"),
				compare: uniform("u_compare"),
				start: uniform("u_start"),
				reveal: uniform("u_reveal"),
				quiet: uniform("u_quiet[0]"),
			},
		};
	} catch (error) {
		dispose();
		throw error;
	}
}

/** Owns this canvas's GPU resources, document measurements and animation loop. */
export function createBloomRenderer(canvas: HTMLCanvasElement, entrance: "none" | "grow" = "none") {
	const holder = canvas.parentElement;
	const page = canvas.closest(".bl-page")?.querySelector<HTMLElement>(".sg-page");
	if (!holder || !page) return null;
	const gl = canvas.getContext("webgl", {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		preserveDrawingBuffer: false,
		powerPreference: "low-power",
		// Spool also captures this shader in software-rendered canvas stills.
		failIfMajorPerformanceCaveat: false,
	});
	if (!gl) return null;

	const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
	const budget = createResolutionBudget();
	let pipeline: ReturnType<typeof createPipeline> | null = null;
	let width = 1,
		height = 1,
		elapsed = 0,
		raf = 0;
	let last: number | null = null;
	let accumulated = 0;
	let drawnScroll = Number.NaN;
	let opening = entrance === "grow" && document.documentElement.dataset.opening === "pending";
	let revealed = entrance !== "grow" || document.documentElement.dataset.opening === "fallback";
	let paused = false,
		disposed = false;
	const running = () => !!pipeline && !opening && !paused && !preference.matches && !document.hidden && !disposed;

	const resizeBuffer = () => {
		const size = drawingSize(width, height, window.devicePixelRatio || 1, budget.scale);
		if (canvas.width === size.width && canvas.height === size.height) return;
		canvas.width = size.width;
		canvas.height = size.height;
		gl.viewport(0, 0, canvas.width, canvas.height);
	};
	const draw = () => {
		if (!pipeline || disposed || document.hidden) return;
		const { uniforms } = pipeline;
		const scroll = window.scrollY - scrollMargin;
		if (scroll !== drawnScroll) {
			// Move the painted slice and its document origin together. The browser
			// then scrolls these pixels with the content between shader draws.
			holder.style.setProperty("--bl-top", `${scroll}px`);
			drawnScroll = scroll;
		}
		gl.uniform2f(uniforms.size, width, height);
		gl.uniform1f(uniforms.time, preference.matches ? 0 : elapsed);
		const reveal = preference.matches || paused ? 1 : Math.min(elapsed / 1.15, 1);
		if (reveal === 1) revealed = true;
		gl.uniform1f(uniforms.reveal, revealed ? 1 : reveal);
		gl.uniform1f(uniforms.scroll, scroll);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	};
	const tick = (stamp: number) => {
		raf = 0;
		if (!pipeline || disposed) return;
		const interval = last === null ? 0 : stamp - last;
		last = stamp;
		if (running()) {
			elapsed += Math.min(interval / 1000, 0.05);
			accumulated += interval;
			if (budget.sample(interval)) resizeBuffer();
			// Ambient motion needs at most 60 draws, including on 120 Hz screens.
			if (accumulated >= 1000 / 60 - 0.5) {
				draw();
				accumulated = Math.max(0, accumulated - 1000 / 60) % (1000 / 60);
			}
			raf = window.requestAnimationFrame(tick);
		} else draw();
	};
	const sync = () => {
		window.cancelAnimationFrame(raf);
		raf = 0;
		last = null;
		accumulated = 0;
		budget.reset();
		holder.dataset.motion = running() ? "running" : "still";
		draw();
		if (running()) raf = window.requestAnimationFrame(tick);
	};
	const rect = (element: Element | null): number[] => {
		if (!element) return [0, -10000, 0, 0];
		const box = element.getBoundingClientRect();
		return [box.left, box.top + window.scrollY, box.width, box.height];
	};
	const measure = () => {
		if (!pipeline || disposed) return;
		width = Math.max(1, page.clientWidth);
		height = Math.max(1, window.innerHeight) + scrollMargin * 2;
		holder.style.setProperty("--bl-height", `${height}px`);
		resizeBuffer();
		const { uniforms } = pipeline;
		gl.uniform1f(uniforms.total, page.scrollHeight);
		gl.uniform4fv(uniforms.compare, rect(page.querySelector("#compare")));
		gl.uniform4fv(uniforms.start, rect(page.querySelector("#start")));
		const copy = [
			...page.querySelectorAll(
				".sg-hero > p, .sg-copy, .sg-section-heading > div, .sg-variant-caption, .sm-play-bottom, .sm-updates",
			),
		]
			.slice(0, 12)
			.map(rect);
		while (copy.length < 12) copy.push([0, -10000, 0, 0]);
		gl.uniform4fv(uniforms.quiet, copy.flat());
		sync();
	};
	const initialize = () => {
		if (disposed) return;
		try {
			pipeline = createPipeline(gl);
			measure();
			holder.dataset.backend = "webgl";
		} catch (error) {
			pipeline?.dispose();
			pipeline = null;
			holder.dataset.backend = "fallback";
			console.warn("Bloom background unavailable:", error);
		}
	};
	const onLost = (event: Event) => {
		event.preventDefault();
		pipeline?.dispose();
		pipeline = null;
		holder.dataset.backend = "fallback";
		sync();
	};
	const onScroll = () => {
		// A paused or reduced-motion field still follows document scrolling.
		if (!raf && pipeline && !disposed && !document.hidden) raf = window.requestAnimationFrame(tick);
	};
	const onOpening = () => {
		opening = false;
		sync();
	};
	const resize = new ResizeObserver(measure);
	resize.observe(page);
	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", measure, { passive: true });
	window.addEventListener("pageshow", measure);
	window.addEventListener("spool:opening", onOpening);
	preference.addEventListener("change", sync);
	document.addEventListener("visibilitychange", sync);
	canvas.addEventListener("webglcontextlost", onLost);
	canvas.addEventListener("webglcontextrestored", initialize);
	initialize();
	void document.fonts.ready.then(measure);

	return {
		setPaused(value: boolean) {
			paused = value;
			sync();
		},
		dispose() {
			disposed = true;
			window.cancelAnimationFrame(raf);
			resize.disconnect();
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", measure);
			window.removeEventListener("pageshow", measure);
			window.removeEventListener("spool:opening", onOpening);
			preference.removeEventListener("change", sync);
			document.removeEventListener("visibilitychange", sync);
			canvas.removeEventListener("webglcontextlost", onLost);
			canvas.removeEventListener("webglcontextrestored", initialize);
			pipeline?.dispose();
			pipeline = null;
		},
	};
}
