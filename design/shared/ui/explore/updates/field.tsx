import { useEffect, useRef, type MutableRefObject } from "react";
import fragment from "./cover.glsl";
export type Take = "quiet" | "thread" | "pigment" | "weave" | "fold" | "aperture";
const takes: Record<Take, number> = { quiet: 0, thread: 1, pigment: 2, weave: 3, fold: 4, aperture: 5 };
const vertex =
	"attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}";
export function CoverField({
	take,
	amount,
	exiting,
}: {
	take: Take;
	amount: MutableRefObject<number>;
	exiting: MutableRefObject<boolean>;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl", {
			alpha: true,
			premultipliedAlpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: true,
			powerPreference: "low-power",
		});
		if (!gl) {
			canvas.dataset.backend = "fallback";
			return;
		}
		const program = gl.createProgram(),
			buffer = gl.createBuffer();
		if (!program || !buffer) return;
		const shaders: WebGLShader[] = [];
		const dispose = () => {
			for (const shader of shaders) gl.deleteShader(shader);
			gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
		};
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertex],
			[gl.FRAGMENT_SHADER, fragment],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) {
				dispose();
				return;
			}
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				console.error(gl.getShaderInfoLog(shader));
				dispose();
				return;
			}
			gl.attachShader(program, shader);
		}
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error(gl.getProgramInfoLog(program));
			dispose();
			return;
		}
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(program, "a_position");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		const size = gl.getUniformLocation(program, "u_size"),
			time = gl.getUniformLocation(program, "u_time"),
			cover = gl.getUniformLocation(program, "u_cover"),
			exit = gl.getUniformLocation(program, "u_exit");
		gl.uniform1f(gl.getUniformLocation(program, "u_take"), takes[take]);
		let raf = 0,
			last = -1,
			lastDraw = 0,
			width = 1,
			height = 1;
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
		const resize = () => {
			const box = canvas.getBoundingClientRect();
			width = box.width;
			height = box.height;
			const scale = Math.min(window.devicePixelRatio, 1, 1000 / width);
			canvas.width = Math.max(1, Math.round(width * scale));
			canvas.height = Math.max(1, Math.round(height * scale));
			gl.viewport(0, 0, canvas.width, canvas.height);
			last = -1;
		};
		const draw = (now: number) => {
			if (
				!document.hidden &&
				(last !== amount.current ||
					(amount.current > 0 &&
						(take === "pigment" || take === "weave" || take === "aperture") &&
						!reduced.matches &&
						now - lastDraw > 50))
			) {
				gl.uniform2f(size, width, height);
				gl.uniform1f(time, reduced.matches ? 0 : now / 1000);
				gl.uniform1f(cover, amount.current);
				gl.uniform1f(exit, exiting.current ? 1 : 0);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
				last = amount.current;
				lastDraw = now;
			}
			raf = window.requestAnimationFrame(draw);
		};
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();
		raf = window.requestAnimationFrame(draw);
		canvas.dataset.backend = "webgl";
		const lost = (event: Event) => {
			event.preventDefault();
			canvas.dataset.backend = "fallback";
		};
		canvas.addEventListener("webglcontextlost", lost);
		return () => {
			window.cancelAnimationFrame(raf);
			observer.disconnect();
			canvas.removeEventListener("webglcontextlost", lost);
			dispose();
		};
	}, [take, amount, exiting]);
	return <canvas ref={ref} className="update-field" aria-hidden="true" />;
}
