import { useEffect, useRef } from "react";
import fragment from "./carry.glsl";

const vertex = `attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

/**
 * The travel law. An exponential gives the first frame its jump; the floor rate
 * under it means the last of the distance is spent rather than approached, so
 * the motion has an end instead of a tail.
 */
const CARRY_TAU = 0.2;
const CARRY_FLOOR = 0.65;
const PRESS_TAU = 0.16;
const PRESS_FLOOR = 0.35;

/**
 * The standing pigment field, and the clock the whole frame runs on. Travel and
 * press are integrated here and published every frame, so the copy, the mark and
 * the bounds move off the same number the shader is drawing.
 */
export function CarryField({ step, press, onCarry }: { step: number; press: number; onCarry: (carry: number) => void }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const targetRef = useRef(step);
	const pressRef = useRef(press);
	const publishRef = useRef(onCarry);
	const bumpRef = useRef<((pressed: boolean) => void) | null>(null);
	publishRef.current = onCarry;
	useEffect(() => {
		targetRef.current = step;
		bumpRef.current?.(false);
	}, [step]);
	useEffect(() => {
		if (press === 0) return;
		bumpRef.current?.(true);
	}, [press]);
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl", {
			alpha: false, antialias: false, depth: false, stencil: false,
			powerPreference: "low-power", preserveDrawingBuffer: true,
		});
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
		let width = 1, height = 1;
		let carry = targetRef.current, pressure = 0, elapsed = 0;
		let last = 0, animation = 0;
		let paint: (() => void) | null = null;
		let dispose: (() => void) | null = null;

		if (gl) {
			const program = gl.createProgram();
			const buffer = gl.createBuffer();
			if (program && buffer) {
				const shaders: WebGLShader[] = [];
				for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
					const shader = gl.createShader(type);
					if (!shader) continue;
					shaders.push(shader);
					gl.shaderSource(shader, source);
					gl.compileShader(shader);
					if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error("Carry field:", gl.getShaderInfoLog(shader));
					gl.attachShader(program, shader);
				}
				gl.bindAttribLocation(program, 0, "a_position");
				gl.linkProgram(program);
				if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
					gl.useProgram(program);
					gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
					gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
					gl.enableVertexAttribArray(0);
					gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
					const sizeUniform = gl.getUniformLocation(program, "u_size");
					const timeUniform = gl.getUniformLocation(program, "u_time");
					const carryUniform = gl.getUniformLocation(program, "u_carry");
					const pressUniform = gl.getUniformLocation(program, "u_press");
					paint = () => {
						gl.uniform2f(sizeUniform, width, height);
						gl.uniform1f(timeUniform, elapsed);
						gl.uniform1f(carryUniform, carry);
						gl.uniform1f(pressUniform, pressure);
						gl.drawArrays(gl.TRIANGLES, 0, 3);
					};
					canvas.dataset.backend = "webgl";
				} else {
					console.error("Carry field:", gl.getProgramInfoLog(program));
				}
				dispose = () => {
					gl.deleteBuffer(buffer);
					gl.deleteProgram(program);
					for (const shader of shaders) gl.deleteShader(shader);
				};
			}
		}

		const publish = () => publishRef.current(carry);
		const tick = (now: number) => {
			animation = 0;
			if (document.hidden || reduced.matches) return;
			const delta = last ? Math.min((now - last) / 1000, 0.08) : 0;
			last = now;
			elapsed += delta;
			const remaining = targetRef.current - carry;
			const distance = Math.abs(remaining);
			const travelled = Math.min(distance, (distance / CARRY_TAU + CARRY_FLOOR) * delta);
			carry += Math.sign(remaining) * travelled;
			pressure = Math.max(0, pressure * Math.exp(-delta / PRESS_TAU) - delta * PRESS_FLOOR);
			publish();
			paint?.();
			animation = window.requestAnimationFrame(tick);
		};
		const resume = (pressed: boolean) => {
			if (pressed && !reduced.matches) pressure = 1;
			if (animation) window.cancelAnimationFrame(animation);
			animation = 0;
			// Carry the clock across the wake, so the frame after a click already
			// travels instead of spending itself measuring the gap.
			last = performance.now();
			if (reduced.matches) { carry = targetRef.current; pressure = 0; }
			publish();
			paint?.();
			if (!reduced.matches && !document.hidden) animation = window.requestAnimationFrame(tick);
		};
		const resize = () => {
			const box = canvas.getBoundingClientRect();
			width = Math.max(1, box.width);
			height = Math.max(1, box.height);
			const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
			const scale = Math.min(1, 1100 / width) * pixelRatio;
			canvas.width = Math.max(1, Math.round(width * scale));
			canvas.height = Math.max(1, Math.round(height * scale));
			gl?.viewport(0, 0, canvas.width, canvas.height);
			paint?.();
		};
		const wake = () => resume(false);
		bumpRef.current = resume;
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		reduced.addEventListener("change", wake);
		document.addEventListener("visibilitychange", wake);
		resize();
		resume(false);
		return () => {
			bumpRef.current = null;
			window.cancelAnimationFrame(animation);
			observer.disconnect();
			reduced.removeEventListener("change", wake);
			document.removeEventListener("visibilitychange", wake);
			dispose?.();
		};
	}, []);
	return <canvas ref={canvasRef} aria-hidden="true" data-carry-field=""
		style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", background: "#11100f" }} />;
}
