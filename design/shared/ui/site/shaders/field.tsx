import { useEffect, useRef } from "react";
import common from "./shaders/common.glsl";

const vertex = `attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

/** One fullscreen WebGL draw per tick. Pointer values and time never enter React. */
export function ShaderField({ fragment, paused }: { fragment: string; paused: boolean }) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const pause = useRef(paused);
	const wake = useRef<() => void>(() => {});
	useEffect(() => {
		pause.current = paused;
		wake.current();
	}, [paused]);

	useEffect(() => {
		const node = canvas.current;
		const container = node?.parentElement;
		const hero = node?.closest<HTMLElement>(".sg-hero");
		if (!node || !container || !hero) return;
		const gl = node.getContext("webgl", {
			alpha: false, antialias: false, depth: false, stencil: false,
			preserveDrawingBuffer: true, powerPreference: "low-power",
		});
		if (!gl) {
			container.dataset.backend = "fallback";
			return;
		}
		const compile = (type: number, source: string) => {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Shader allocation failed");
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				const message = gl.getShaderInfoLog(shader);
				gl.deleteShader(shader);
				throw new Error(message ?? "Shader compilation failed");
			}
			return shader;
		};
		let program: WebGLProgram | null = null;
		const shaders: WebGLShader[] = [];
		try {
			shaders.push(compile(gl.VERTEX_SHADER, vertex));
			shaders.push(compile(gl.FRAGMENT_SHADER, common + "\n" + fragment));
			program = gl.createProgram();
			if (!program) throw new Error("Program allocation failed");
			for (const shader of shaders) gl.attachShader(program, shader);
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Shader link failed");
		} catch (error) {
			console.error("Landing shader:", error);
			for (const shader of shaders) gl.deleteShader(shader);
			if (program) gl.deleteProgram(program);
			container.dataset.backend = "fallback";
			return;
		}
		gl.useProgram(program);
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(program, "a_position");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		const size = gl.getUniformLocation(program, "u_size");
		const clock = gl.getUniformLocation(program, "u_time");
		const pointer = gl.getUniformLocation(program, "u_pointer");
		const activity = gl.getUniformLocation(program, "u_active");
		const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
		let width = 1, height = 1, elapsed = 0, last = 0, raf = 0;
		let visible = true, lost = false, disposed = false;
		let x = .76, y = .46, tx = x, ty = y, active = 0, targetActive = 0;
		const running = () => !pause.current && !preference.matches && visible && !lost && !disposed;
		const draw = () => {
			if (lost || disposed) return;
			gl.uniform2f(size, width, height);
			gl.uniform1f(clock, preference.matches ? 0 : elapsed);
			gl.uniform2f(pointer, x, y);
			gl.uniform1f(activity, preference.matches ? 0 : active);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			container.dataset.backend = "webgl";
			container.dataset.motion = running() ? "running" : "still";
		};
		const tick = (stamp: number) => {
			raf = 0;
			const dt = last ? Math.min((stamp - last) / 1000, .05) : 0;
			last = stamp;
			if (running()) {
				elapsed += dt;
				const ease = 1 - Math.exp(-dt * 14);
				x += (tx - x) * ease; y += (ty - y) * ease;
				active += (targetActive - active) * ease;
			}
			draw();
			if (running()) raf = window.requestAnimationFrame(tick);
		};
		const sync = () => {
			if (raf) window.cancelAnimationFrame(raf);
			raf = 0; last = 0;
			draw();
			if (running()) raf = window.requestAnimationFrame(tick);
		};
		wake.current = sync;
		const resize = () => {
			const rect = container.getBoundingClientRect();
			width = Math.max(1, rect.width); height = Math.max(1, rect.height);
			const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
			node.width = Math.round(width * dpr); node.height = Math.round(height * dpr);
			gl.viewport(0, 0, node.width, node.height);
			sync();
		};
		const move = (event: PointerEvent) => {
			const rect = container.getBoundingClientRect();
			tx = (event.clientX - rect.left) / rect.width;
			ty = (event.clientY - rect.top) / rect.height;
			targetActive = 1;
		};
		const leave = () => { targetActive = 0; };
		const onLost = (event: Event) => {
			event.preventDefault(); lost = true;
			container.dataset.backend = "fallback";
			if (raf) window.cancelAnimationFrame(raf);
		};
		const observer = new ResizeObserver(resize);
		observer.observe(container);
		const intersection = new IntersectionObserver(([entry]) => {
			visible = entry?.isIntersecting ?? false;
			sync();
		});
		intersection.observe(container);
		hero.addEventListener("pointermove", move, { passive: true });
		hero.addEventListener("pointerleave", leave);
		node.addEventListener("webglcontextlost", onLost);
		preference.addEventListener("change", sync);
		resize();
		return () => {
			disposed = true;
			wake.current = () => {};
			window.cancelAnimationFrame(raf);
			observer.disconnect(); intersection.disconnect();
			hero.removeEventListener("pointermove", move);
			hero.removeEventListener("pointerleave", leave);
			node.removeEventListener("webglcontextlost", onLost);
			preference.removeEventListener("change", sync);
			gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
			for (const shader of shaders) gl.deleteShader(shader);
		};
	}, [fragment]);

	return <canvas ref={canvas} className="ss-canvas" aria-hidden="true" />;
}
