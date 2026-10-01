const vertex = `attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

export type Quad = {
	gl: WebGLRenderingContext;
	uniform: (name: string) => WebGLUniformLocation | null;
	draw: () => void;
	dispose: () => void;
};

/** One full-canvas triangle running a fragment shader. Throws when the shader fails. */
export function createQuad(canvas: HTMLCanvasElement, fragment: string, alpha: boolean): Quad | null {
	const gl = canvas.getContext("webgl", {
		alpha,
		premultipliedAlpha: true,
		antialias: false,
		depth: false,
		stencil: false,
		preserveDrawingBuffer: true,
		powerPreference: "low-power",
	});
	if (!gl) return null;
	const program = gl.createProgram();
	const buffer = gl.createBuffer();
	const shaders: WebGLShader[] = [];
	const dispose = () => {
		gl.deleteBuffer(buffer);
		gl.deleteProgram(program);
		for (const shader of shaders) gl.deleteShader(shader);
	};
	if (!program || !buffer) {
		dispose();
		return null;
	}
	for (const [type, source] of [
		[gl.VERTEX_SHADER, vertex],
		[gl.FRAGMENT_SHADER, fragment],
	] as const) {
		const shader = gl.createShader(type);
		if (!shader) continue;
		shaders.push(shader);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const log = gl.getShaderInfoLog(shader);
			dispose();
			throw new Error(log ?? "shader compile failed");
		}
		gl.attachShader(program, shader);
	}
	gl.bindAttribLocation(program, 0, "a_position");
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program);
		dispose();
		throw new Error(log ?? "shader link failed");
	}
	// biome-ignore lint/correctness/useHookAtTopLevel: WebGL useProgram binds a shader program, not a React hook.
	gl.useProgram(program);
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	const cache = new Map<string, WebGLUniformLocation | null>();
	return {
		gl,
		uniform(name) {
			if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
			return cache.get(name) ?? null;
		},
		draw() {
			gl.viewport(0, 0, canvas.width, canvas.height);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		},
		dispose,
	};
}

export function prefersReducedMotion() {
	return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A damped spring stepped by hand, so values never live in React state. */
export function stepSpring(
	state: { x: number; v: number },
	target: number,
	dt: number,
	stiffness: number,
	damping: number,
) {
	// Semi-implicit Euler in small slices stays stable for stiff springs.
	const slices = Math.max(1, Math.ceil(dt / (1 / 240)));
	const h = dt / slices;
	for (let i = 0; i < slices; i++) {
		const force = -stiffness * (state.x - target) - damping * state.v;
		state.v += force * h;
		state.x += state.v * h;
	}
}
