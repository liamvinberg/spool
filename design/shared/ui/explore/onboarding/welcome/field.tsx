import { useEffect, useRef } from "react";
import fragment from "./field.glsl";

type Direction = "quiet" | "flowing" | "opening" | "dissolve";
const directions: Record<Direction, number> = { quiet: 0, flowing: 1, opening: 2, dissolve: 3 };
const vertex = `attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

/** The site's pigment, kept alive across welcome steps. All state stays local. */
export function WelcomeField({ variant, step }: { variant: Direction; step: number }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const targetRef = useRef(step);
	const repaintRef = useRef<(() => void) | null>(null);
	useEffect(() => {
		targetRef.current = step;
		repaintRef.current?.();
	}, [step]);
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl", {
			alpha: false, antialias: false, depth: false, stencil: false,
			powerPreference: "low-power", preserveDrawingBuffer: true,
		});
		if (!gl) return;
		const program = gl.createProgram();
		const buffer = gl.createBuffer();
		if (!program || !buffer) return;
		const shaders: WebGLShader[] = [];
		for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
			const shader = gl.createShader(type);
			if (!shader) continue;
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			gl.attachShader(program, shader);
		}
		gl.bindAttribLocation(program, 0, "a_position");
		gl.linkProgram(program);
		const dispose = () => {
			gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
			for (const shader of shaders) gl.deleteShader(shader);
		};
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error("Welcome field:", gl.getProgramInfoLog(program));
			dispose();
			return;
		}
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
		const sizeUniform = gl.getUniformLocation(program, "u_size");
		const timeUniform = gl.getUniformLocation(program, "u_time");
		const stepUniform = gl.getUniformLocation(program, "u_step");
		const dissolveUniform = gl.getUniformLocation(program, "u_dissolve");
		gl.uniform1f(gl.getUniformLocation(program, "u_variant"), directions[variant]);
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
		let width = 1, height = 1, scene = targetRef.current, elapsed = 0, thinning = 0;
		let last = 0, animation = 0;
		const draw = () => {
			gl.uniform2f(sizeUniform, width, height);
			gl.uniform1f(timeUniform, elapsed);
			gl.uniform1f(stepUniform, scene);
			gl.uniform1f(dissolveUniform, thinning);
			gl.drawArrays(gl.TRIANGLES,0,3);
		};
		const tick = (now: number) => {
			animation = 0;
			if (document.hidden || reduced.matches) return;
			const delta = last ? Math.min((now-last)/1000,.08) : 0;
			last = now;
			elapsed += delta;
			const distance = targetRef.current-scene;
			// Loosen the material as it starts travelling; let it gather as it settles.
			// Both values stay continuous when someone changes direction midway.
			thinning += (Math.min(1,Math.abs(distance)*2)-thinning)*(1-Math.exp(-delta*5));
			scene += distance*(1-Math.exp(-delta*(variant === "dissolve" ? 2.6 : 4.8)));
			draw();
			animation = window.requestAnimationFrame(tick);
		};
		const resume = () => {
			if (animation) window.cancelAnimationFrame(animation);
			animation=0;
			last=0;
			if (reduced.matches) { scene=targetRef.current; thinning=0; }
			draw();
			if (!reduced.matches && !document.hidden) animation=window.requestAnimationFrame(tick);
		};
		const resize = () => {
			const box=canvas.getBoundingClientRect();
			width=Math.max(1,box.width); height=Math.max(1,box.height);
			// The material is soft by design. A bounded buffer keeps nine specimens light.
			const pixelRatio=Math.min(window.devicePixelRatio,1);
			const scale=Math.min(1,900/width)*pixelRatio;
			canvas.width=Math.max(1,Math.round(width*scale));
			canvas.height=Math.max(1,Math.round(height*scale));
			gl.viewport(0,0,canvas.width,canvas.height);
			draw();
		};
		repaintRef.current=resume;
		const observer=new ResizeObserver(resize);
		observer.observe(canvas);
		reduced.addEventListener("change",resume);
		document.addEventListener("visibilitychange",resume);
		resize(); resume();
		canvas.dataset.backend="webgl";
		return () => {
			repaintRef.current=null;
			window.cancelAnimationFrame(animation);
			observer.disconnect();
			reduced.removeEventListener("change",resume);
			document.removeEventListener("visibilitychange",resume);
			dispose();
		};
	}, [variant]);
	return <canvas ref={canvasRef} aria-hidden="true" data-welcome-field={variant}
		style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",background:"#101010"}} />;
}
