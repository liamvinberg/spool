/** WebGL plumbing both material takes share: one full-screen triangle, a
 * program, a pixel-ratio cap, and a loop that only runs while it is seen. */

export const FULLSCREEN_VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

export function createProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
	const program = gl.createProgram();
	if (!program) throw new Error("program allocation failed");
	const shaders: WebGLShader[] = [];
	for (const [type, source] of [
		[gl.VERTEX_SHADER, vertex],
		[gl.FRAGMENT_SHADER, fragment],
	] as const) {
		const shader = gl.createShader(type);
		if (!shader) throw new Error("shader allocation failed");
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
		}
		gl.attachShader(program, shader);
		shaders.push(shader);
	}
	gl.bindAttribLocation(program, 0, "a_position");
	gl.linkProgram(program);
	for (const shader of shaders) gl.deleteShader(shader);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
	}
	const cache = new Map<string, WebGLUniformLocation | null>();
	const uniform = (name: string) => {
		if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
		return cache.get(name) ?? null;
	};
	return { program, uniform };
}

/** One triangle covering the viewport, bound to attribute 0. */
export function createTriangle(gl: WebGL2RenderingContext) {
	const vao = gl.createVertexArray();
	const buffer = gl.createBuffer();
	gl.bindVertexArray(vao);
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	return {
		draw() {
			gl.bindVertexArray(vao);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		},
		dispose() {
			gl.deleteBuffer(buffer);
			gl.deleteVertexArray(vao);
		},
	};
}

/** Lowers quality after sustained missed frames, never after one hitch, and
 * keeps the lowered level for the visit so it cannot oscillate. */
export function createResolutionBudget() {
	let scale = 1;
	let duration = 0;
	let frames = 0;
	let slow = 0;
	const reset = () => {
		duration = 0;
		frames = 0;
		slow = 0;
	};
	return {
		get scale() {
			return scale;
		},
		reset,
		sample(interval: number): boolean {
			if (interval <= 0 || interval >= 250) {
				reset();
				return false;
			}
			duration += interval;
			frames++;
			if (interval > 22) slow++;
			if (duration < 2000) return false;
			const previous = scale;
			if (slow / frames > 0.12) scale = Math.max(0.5, scale * 0.8);
			reset();
			return previous !== scale;
		},
	};
}

export function pixelRatio(cap: number, scale = 1) {
	return Math.min(window.devicePixelRatio || 1, cap) * scale;
}

export function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)");
}

/**
 * A requestAnimationFrame loop capped at 60 draws a second that stops while
 * the element is offscreen, the tab is hidden, or motion is reduced. With
 * motion reduced it still draws once on every change so the still is right.
 */
export function createLoop(
	element: Element,
	step: (seconds: number, interval: number) => void,
	options: { margin?: string } = {},
) {
	const reduced = prefersReducedMotion();
	let visible = true;
	let raf = 0;
	let last: number | null = null;
	let accumulated = 0;
	let elapsed = 0;
	let disposed = false;
	const running = () => visible && !document.hidden && !reduced.matches && !disposed;
	const tick = (stamp: number) => {
		raf = 0;
		if (!running()) return;
		const interval = last === null ? 0 : stamp - last;
		last = stamp;
		accumulated += interval;
		if (accumulated >= 1000 / 60 - 1 || interval === 0) {
			const delta = Math.min(accumulated, 50);
			elapsed += delta / 1000;
			accumulated = 0;
			step(elapsed, delta);
		}
		raf = window.requestAnimationFrame(tick);
	};
	const sync = () => {
		window.cancelAnimationFrame(raf);
		raf = 0;
		last = null;
		accumulated = 0;
		if (disposed) return;
		if (running()) raf = window.requestAnimationFrame(tick);
		else if (!document.hidden) step(elapsed, 0);
	};
	const observer = new IntersectionObserver(
		(entries) => {
			visible = entries.some((entry) => entry.isIntersecting);
			sync();
		},
		{ rootMargin: options.margin ?? "120px 0px" },
	);
	observer.observe(element);
	reduced.addEventListener("change", sync);
	document.addEventListener("visibilitychange", sync);
	sync();
	return {
		get reduced() {
			return reduced.matches;
		},
		/** Draw once now without advancing time; for scroll and resize. */
		poke() {
			if (!raf && !disposed && !document.hidden) step(elapsed, 0);
		},
		dispose() {
			disposed = true;
			window.cancelAnimationFrame(raf);
			observer.disconnect();
			reduced.removeEventListener("change", sync);
			document.removeEventListener("visibilitychange", sync);
		},
	};
}
