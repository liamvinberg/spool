import { useEffect, useRef } from "react";
import fragment from "./field.glsl";

export type BloomTake = "returns" | "current" | "atmosphere" | "companion" | "surrounds" | "immersion" | "returns-end";
const MODES: Record<BloomTake, number> = {
	returns: 0, current: 1, atmosphere: 2, companion: 3, surrounds: 4, immersion: 5, "returns-end": 6,
};
const vertex = `attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

/** One viewport-sized canvas samples one document-sized field. The document stays native HTML. */
export function BloomField({ take, paused }: { take: BloomTake; paused: boolean }) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const pause = useRef(paused);
	const wake = useRef(() => {});
	useEffect(() => {
		pause.current = paused;
		wake.current();
	}, [paused]);

	useEffect(() => {
		const node = canvas.current;
		const holder = node?.parentElement;
		const page = node?.closest(".bl-page")?.querySelector<HTMLElement>(".sg-page");
		const main = page?.querySelector("main");
		if (!node || !holder || !page || !main) return;
		const gl = node.getContext("webgl", {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: true,
			powerPreference: "low-power",
		});
		if (!gl) {
			holder.dataset.backend = "fallback";
			return;
		}
		const shaders: WebGLShader[] = [];
		let program: WebGLProgram | null = null;
		try {
			for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
				const shader = gl.createShader(type);
				if (!shader) throw new Error("Bloom shader allocation failed");
				shaders.push(shader);
				gl.shaderSource(shader, source);
				gl.compileShader(shader);
				if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
					throw new Error(gl.getShaderInfoLog(shader) ?? "Bloom shader compilation failed");
				}
			}
			program = gl.createProgram();
			if (!program) throw new Error("Bloom program allocation failed");
			for (const shader of shaders) gl.attachShader(program, shader);
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
				throw new Error(gl.getProgramInfoLog(program) ?? "Bloom shader link failed");
			}
		} catch (error) {
			console.error("Bloom field:", error);
			for (const shader of shaders) gl.deleteShader(shader);
			if (program) gl.deleteProgram(program);
			holder.dataset.backend = "fallback";
			return;
		}
		gl.useProgram(program);
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(program, "a_position");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		const uniform = (name: string) => gl.getUniformLocation(program!, name);
		const uniforms = {
			size: uniform("u_size"), time: uniform("u_time"), scroll: uniform("u_scroll"),
			total: uniform("u_total"), take: uniform("u_take"), reduced: uniform("u_reduced"),
			boxes: uniform("u_boxes[0]"), quiet: uniform("u_quiet[0]"),
		};
		const landmarks = [
			[uniform("u_hero"), ".sg-hero"], [uniform("u_try"), "#try"],
			[uniform("u_compare"), "#compare"], [uniform("u_agent"), "#agent"],
			[uniform("u_files"), "#files"], [uniform("u_start"), "#start"],
		] as const;
		gl.uniform1f(uniforms.take, MODES[take]);
		const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
		let width = 1, height = 1, elapsed = 0, last = 0, raf = 0;
		let disposed = false, lost = false, visible = true;
		const running = () => !pause.current && !preference.matches && visible && !document.hidden && !disposed && !lost;
		const draw = () => {
			if (disposed || lost) return;
			gl.uniform2f(uniforms.size, width, height);
			gl.uniform1f(uniforms.time, preference.matches ? 0 : elapsed);
			gl.uniform1f(uniforms.scroll, page.scrollTop);
			gl.uniform1f(uniforms.reduced, preference.matches ? 1 : 0);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			holder.dataset.backend = "webgl";
			holder.dataset.motion = running() ? "running" : "still";
		};
		const tick = (stamp: number) => {
			raf = 0;
			const dt = last ? Math.min((stamp - last) / 1000, .05) : 0;
			last = stamp;
			if (running()) elapsed += dt;
			draw();
			if (running()) raf = window.requestAnimationFrame(tick);
		};
		const sync = () => {
			window.cancelAnimationFrame(raf);
			raf = 0;
			last = 0;
			draw();
			if (running()) raf = window.requestAnimationFrame(tick);
		};
		wake.current = sync;
		const rect = (element: Element | null): number[] => {
			if (!element) return [0, -10000, 0, 0];
			const bounds = element.getBoundingClientRect();
			const origin = page.getBoundingClientRect();
			return [bounds.left - origin.left, bounds.top - origin.top + page.scrollTop, bounds.width, bounds.height];
		};
		const measure = () => {
			if (disposed || lost) return;
			const bounds = holder.getBoundingClientRect();
			width = Math.max(1, bounds.width);
			height = Math.max(1, bounds.height);
			const dpr = Math.min(window.devicePixelRatio || 1, 1.25, 2200 / Math.max(width, height));
			const w = Math.round(width * dpr), h = Math.round(height * dpr);
			if (node.width !== w || node.height !== h) {
				node.width = w;
				node.height = h;
				gl.viewport(0, 0, w, h);
			}
			gl.uniform1f(uniforms.total, page.scrollHeight);
			for (const [location, selector] of landmarks) gl.uniform4fv(location, rect(page.querySelector(selector)));
			const boxes = [
				".sg-hero-app > :first-child", ".sg-live-example > .sg-product",
				".sg-agent > :nth-child(2)", ".sg-source-pair",
				".sg-variants > :nth-child(1) .sg-variant-open",
				".sg-variants > :nth-child(2) .sg-variant-open",
				".sg-variants > :nth-child(3) .sg-variant-open",
			].flatMap((selector) => rect(page.querySelector(selector)));
			gl.uniform4fv(uniforms.boxes, boxes);
			const copy = [...page.querySelectorAll(
				".sg-hero > p, .sg-copy, .sg-section-heading > div, .sg-variant-caption, .sm-play-bottom, .sm-updates",
			)].slice(0, 12).map((element) => rect(element));
			while (copy.length < 12) copy.push([0, -10000, 0, 0]);
			gl.uniform4fv(uniforms.quiet, copy.flat());
			sync();
		};
		const onScroll = () => {
			// The ambient loop already reads scrollTop. A still needs just one new draw.
			if (!raf && !disposed && !lost) raf = window.requestAnimationFrame(tick);
		};
		const onLost = (event: Event) => {
			event.preventDefault();
			lost = true;
			window.cancelAnimationFrame(raf);
			holder.dataset.backend = "fallback";
		};
		const resize = new ResizeObserver(measure);
		resize.observe(holder);
		resize.observe(main);
		const intersection = new IntersectionObserver(([entry]) => {
			visible = entry?.isIntersecting ?? false;
			sync();
		});
		intersection.observe(holder);
		page.addEventListener("scroll", onScroll, { passive: true });
		preference.addEventListener("change", sync);
		document.addEventListener("visibilitychange", sync);
		node.addEventListener("webglcontextlost", onLost);
		measure();
		void document.fonts.ready.then(measure);
		return () => {
			disposed = true;
			wake.current = () => {};
			window.cancelAnimationFrame(raf);
			resize.disconnect();
			intersection.disconnect();
			page.removeEventListener("scroll", onScroll);
			preference.removeEventListener("change", sync);
			document.removeEventListener("visibilitychange", sync);
			node.removeEventListener("webglcontextlost", onLost);
			gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
			for (const shader of shaders) gl.deleteShader(shader);
		};
	}, [take]);

	return <canvas ref={canvas} className="bl-canvas" aria-hidden="true" />;
}
