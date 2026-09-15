import { useEffect, useId, useRef, useState } from "react";
import fragment from "./lamp-beam.glsl";

const vertex = `attribute vec2 position; varying vec2 v_uv; void main() { v_uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }`;

export function LampBeam({ active, reduced: forceReduced = false }: { active: boolean; reduced?: boolean }) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const start = useRef<(() => void) | null>(null);
	const activeRef = useRef(active);
	const [enabled, setEnabled] = useState(active);
	const [ready, setReady] = useState(false);
	const id = useId().replace(/:/g, "");
	useEffect(() => {
		activeRef.current = active;
		if (active) setEnabled(true);
		start.current?.();
	}, [active]);
	useEffect(() => {
		if (!enabled) return;
		const node = canvas.current;
		if (!node) return;
		const gl = (() => {
			try {
				return node.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true });
			} catch {
				return null;
			}
		})();
		if (!gl) return;
		const shaders: WebGLShader[] = [];
		let program: WebGLProgram | null = null;
		let buffer: WebGLBuffer | null = null;
		function dispose() {
			if (buffer) gl?.deleteBuffer(buffer);
			if (program) gl?.deleteProgram(program);
			for (const shader of shaders) gl?.deleteShader(shader);
		}
		try {
			program = gl.createProgram();
			if (!program) throw new Error("No WebGL program");
			for (const [kind, source] of [
				[gl.VERTEX_SHADER, vertex],
				[gl.FRAGMENT_SHADER, fragment],
			] as const) {
				const shader = gl.createShader(kind);
				if (!shader) throw new Error("No WebGL shader");
				shaders.push(shader);
				gl.shaderSource(shader, source);
				gl.compileShader(shader);
				if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Lamp shader compilation failed");
				gl.attachShader(program, shader);
			}
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Lamp shader link failed");
			// biome-ignore lint/correctness/useHookAtTopLevel: WebGL method, not a React hook.
			gl.useProgram(program);
			buffer = gl.createBuffer();
			if (!buffer) throw new Error("No WebGL buffer");
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
			const position = gl.getAttribLocation(program, "position");
			gl.enableVertexAttribArray(position);
			gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		} catch {
			dispose();
			return;
		}
		const time = gl.getUniformLocation(program, "u_time");
		const reduced = matchMedia("(prefers-reduced-motion: reduce)");
		let frame = 0;
		let lost = false;
		let elapsed = 0;
		let previous = 0;
		function draw(timestamp: number) {
			frame = 0;
			if (lost || !gl || !node) return;
			if (previous && !(reduced.matches || forceReduced)) elapsed += Math.min(timestamp - previous, 50) / 1000;
			previous = timestamp;
			gl.uniform1f(time, reduced.matches || forceReduced ? 0 : elapsed);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			if (activeRef.current && !(reduced.matches || forceReduced) && !document.hidden)
				frame = requestAnimationFrame(draw);
		}
		function wake() {
			if (frame) cancelAnimationFrame(frame);
			previous = 0;
			frame = requestAnimationFrame(draw);
		}
		function resize() {
			if (!node || !gl) return;
			const size = node.getBoundingClientRect();
			const ratio = Math.min(devicePixelRatio, 1.5);
			node.width = Math.max(1, Math.round(size.width * ratio));
			node.height = Math.max(1, Math.round(size.height * ratio));
			gl.viewport(0, 0, node.width, node.height);
			wake();
		}
		function contextLost(event: Event) {
			event.preventDefault();
			lost = true;
			cancelAnimationFrame(frame);
			setReady(false);
		}
		const observer = new ResizeObserver(resize);
		observer.observe(node);
		reduced.addEventListener("change", wake);
		document.addEventListener("visibilitychange", wake);
		node.addEventListener("webglcontextlost", contextLost);
		start.current = wake;
		resize();
		setReady(true);
		return () => {
			start.current = null;
			cancelAnimationFrame(frame);
			observer.disconnect();
			reduced.removeEventListener("change", wake);
			document.removeEventListener("visibilitychange", wake);
			node.removeEventListener("webglcontextlost", contextLost);
			dispose();
		};
	}, [enabled, forceReduced]);
	return (
		<div
			className="fold-beam"
			style={{ opacity: active ? 1 : 0 }}
			aria-hidden="true"
			data-renderer={ready ? "webgl" : "fallback"}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 1000 1000"
				className="fold-beam-fallback"
				style={{ opacity: ready ? 0 : 1 }}
			>
				<defs>
					<filter id={`${id}-soft`} x="-30%" y="-30%" width="160%" height="160%">
						<feGaussianBlur stdDeviation="24" />
					</filter>
					<linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
						<stop stopColor="#ffd699" stopOpacity=".25" />
						<stop offset="1" stopColor="#ffd699" stopOpacity="0" />
					</linearGradient>
					<radialGradient id={`${id}-pool`}>
						<stop stopColor="#ffd699" stopOpacity=".4" />
						<stop offset="1" stopColor="#ffd699" stopOpacity="0" />
					</radialGradient>
				</defs>
				<path d="M380 195h410l130 730H220Z" fill={`url(#${id}-beam)`} filter={`url(#${id}-soft)`} />
				<ellipse cx="590" cy="905" rx="290" ry="52" fill={`url(#${id}-pool)`} />
			</svg>
			<canvas ref={canvas} className="fold-beam-canvas" style={{ opacity: ready ? 1 : 0 }} />
		</div>
	);
}
