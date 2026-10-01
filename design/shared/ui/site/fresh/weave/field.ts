/**
 * One full-viewport fragment shader on a canvas: compile, size, draw, dispose.
 * Forked from the current landing's bloom renderer. The caller owns the loop
 * and sets its own uniforms; this owns the GPU and the resolution budget.
 */
const vertex = `attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

export type Field = {
	gl: WebGLRenderingContext;
	/** "software" means no GPU: draw at a low resolution and skip ambient motion. */
	backend: "webgl" | "software";
	uniform(name: string): WebGLUniformLocation | null;
	resize(width: number, height: number): void;
	/** Feed frame intervals; returns true once sustained slow frames lower the resolution. */
	sample(interval: number): boolean;
	draw(): void;
	dispose(): void;
};

function context(canvas: HTMLCanvasElement, caveat: boolean) {
	return canvas.getContext("webgl", {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		powerPreference: "low-power",
		failIfMajorPerformanceCaveat: caveat,
	});
}

export function createField(canvas: HTMLCanvasElement, fragment: string, maxRatio = 1.5): Field | null {
	let backend: Field["backend"] = "webgl";
	let gl = context(canvas, true);
	if (!gl) {
		gl = context(canvas, false);
		backend = "software";
	}
	if (!gl) return null;
	const program = gl.createProgram();
	const buffer = gl.createBuffer();
	const shaders: WebGLShader[] = [];
	const dispose = () => {
		gl.deleteBuffer(buffer);
		gl.deleteProgram(program);
		for (const shader of shaders) gl.deleteShader(shader);
	};
	try {
		if (!program || !buffer) throw new Error("Loom field allocation failed");
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertex],
			[gl.FRAGMENT_SHADER, fragment],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Loom shader allocation failed");
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				throw new Error(gl.getShaderInfoLog(shader) ?? "Loom shader compile failed");
			}
			gl.attachShader(program, shader);
		}
		gl.bindAttribLocation(program, 0, "a_position");
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(gl.getProgramInfoLog(program) ?? "Loom shader link failed");
		}
		// biome-ignore lint/correctness/useHookAtTopLevel: WebGL useProgram binds a shader program, not a React hook.
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		// One triangle covers the viewport without a shared diagonal edge.
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	} catch (error) {
		dispose();
		console.warn("Loom field unavailable:", error);
		return null;
	}

	const cache = new Map<string, WebGLUniformLocation | null>();
	// Lower quality after sustained missed frames, never after one hitch, and never back up.
	let quality = backend === "software" ? 0.5 : 1;
	let duration = 0,
		frames = 0,
		slow = 0;
	let cssWidth = 1,
		cssHeight = 1;
	const applySize = () => {
		const dpr = window.devicePixelRatio || 1;
		const ratio = Math.min(dpr, maxRatio, 2400 / Math.max(cssWidth, cssHeight)) * quality;
		const width = Math.max(1, Math.round(cssWidth * ratio));
		const height = Math.max(1, Math.round(cssHeight * ratio));
		if (canvas.width === width && canvas.height === height) return;
		canvas.width = width;
		canvas.height = height;
		gl.viewport(0, 0, width, height);
	};

	return {
		gl,
		backend,
		uniform(name) {
			if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
			return cache.get(name) ?? null;
		},
		resize(width, height) {
			cssWidth = Math.max(1, width);
			cssHeight = Math.max(1, height);
			applySize();
		},
		sample(interval) {
			if (interval <= 0 || interval >= 250) {
				duration = frames = slow = 0;
				return false;
			}
			duration += interval;
			frames++;
			if (interval > 20) slow++;
			if (duration < 2000) return false;
			const lower = slow / frames > 0.1 && quality > 0.4;
			duration = frames = slow = 0;
			if (!lower) return false;
			quality = Math.max(0.4, quality * 0.8);
			applySize();
			return true;
		},
		draw() {
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		},
		dispose,
	};
}
