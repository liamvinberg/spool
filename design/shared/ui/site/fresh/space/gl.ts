/**
 * The small WebGL2 kit both space takes stand on: a context that knows whether
 * it is on a real GPU, programs drawn over one viewport triangle, a texture the
 * page can render into, and a resolution budget that only ever steps down.
 */

const vertex = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

export type Program = {
	program: WebGLProgram;
	uniform(name: string): WebGLUniformLocation | null;
	use(): void;
	dispose(): void;
};

export type Target = {
	texture: WebGLTexture;
	framebuffer: WebGLFramebuffer;
	width: number;
	height: number;
	dispose(): void;
};

export type Space = {
	gl: WebGL2RenderingContext;
	/** "software" means no GPU: draw at a low resolution and skip ambient motion. */
	backend: "webgl" | "software";
	program(fragment: string): Program;
	target(width: number, height: number, options?: { repeat?: boolean; data?: TexImageSource }): Target;
	/** Size the drawing buffer from css pixels, within the DPR cap and the budget. */
	resize(width: number, height: number): void;
	/** Feed frame intervals; returns true once sustained slow frames lower the resolution. */
	sample(interval: number): boolean;
	/** Bind the canvas and draw the viewport triangle with whatever program is in use. */
	draw(target?: Target | null): void;
	dispose(): void;
};

function context(canvas: HTMLCanvasElement, caveat: boolean) {
	return canvas.getContext("webgl2", {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		powerPreference: "high-performance",
		preserveDrawingBuffer: false,
		failIfMajorPerformanceCaveat: caveat,
	});
}

export function createSpace(canvas: HTMLCanvasElement, options: { maxRatio?: number; maxPixels?: number } = {}): Space | null {
	const maxRatio = options.maxRatio ?? 1.5;
	const maxPixels = options.maxPixels ?? 2_600_000;
	let backend: Space["backend"] = "webgl";
	let gl = context(canvas, true);
	if (!gl) {
		gl = context(canvas, false);
		backend = "software";
	}
	if (!gl) return null;
	const ctx = gl;

	const vao = ctx.createVertexArray();
	const buffer = ctx.createBuffer();
	ctx.bindVertexArray(vao);
	ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
	// One triangle covers the viewport without a shared diagonal edge.
	ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
	ctx.enableVertexAttribArray(0);
	ctx.vertexAttribPointer(0, 2, ctx.FLOAT, false, 0, 0);

	const programs: Program[] = [];
	const targets: Target[] = [];

	const compile = (type: number, source: string) => {
		const shader = ctx.createShader(type);
		if (!shader) throw new Error("Shader allocation failed");
		ctx.shaderSource(shader, source);
		ctx.compileShader(shader);
		if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
			const log = ctx.getShaderInfoLog(shader);
			ctx.deleteShader(shader);
			throw new Error(log ?? "Shader compile failed");
		}
		return shader;
	};

	let quality = backend === "software" ? 0.45 : 1;
	let cssWidth = 1,
		cssHeight = 1,
		duration = 0,
		frames = 0,
		slow = 0;
	const applySize = () => {
		const dpr = window.devicePixelRatio || 1;
		let ratio = Math.min(dpr, maxRatio) * quality;
		// Keep the pixel count inside the budget on very large screens.
		const pixels = cssWidth * cssHeight * ratio * ratio;
		if (pixels > maxPixels) ratio *= Math.sqrt(maxPixels / pixels);
		const width = Math.max(1, Math.round(cssWidth * ratio));
		const height = Math.max(1, Math.round(cssHeight * ratio));
		if (canvas.width === width && canvas.height === height) return;
		canvas.width = width;
		canvas.height = height;
	};

	return {
		gl: ctx,
		backend,
		program(fragment) {
			const program = ctx.createProgram();
			if (!program) throw new Error("Program allocation failed");
			const vs = compile(ctx.VERTEX_SHADER, vertex);
			const fs = compile(ctx.FRAGMENT_SHADER, fragment);
			ctx.attachShader(program, vs);
			ctx.attachShader(program, fs);
			ctx.bindAttribLocation(program, 0, "a_position");
			ctx.linkProgram(program);
			ctx.deleteShader(vs);
			ctx.deleteShader(fs);
			if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
				throw new Error(ctx.getProgramInfoLog(program) ?? "Program link failed");
			}
			const cache = new Map<string, WebGLUniformLocation | null>();
			const made: Program = {
				program,
				uniform(name) {
					if (!cache.has(name)) cache.set(name, ctx.getUniformLocation(program, name));
					return cache.get(name) ?? null;
				},
				use() {
					// biome-ignore lint/correctness/useHookAtTopLevel: WebGL useProgram binds a shader program, not a React hook.
					ctx.useProgram(program);
				},
				dispose() {
					ctx.deleteProgram(program);
				},
			};
			programs.push(made);
			return made;
		},
		target(width, height, { repeat = false, data } = {}) {
			const texture = ctx.createTexture();
			const framebuffer = ctx.createFramebuffer();
			if (!texture || !framebuffer) throw new Error("Target allocation failed");
			ctx.bindTexture(ctx.TEXTURE_2D, texture);
			if (data) ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, data);
			else ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, width, height, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, null);
			ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);
			ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
			const wrap = repeat ? ctx.REPEAT : ctx.CLAMP_TO_EDGE;
			ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, wrap);
			ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, wrap);
			ctx.bindFramebuffer(ctx.FRAMEBUFFER, framebuffer);
			ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.TEXTURE_2D, texture, 0);
			ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
			const made: Target = {
				texture,
				framebuffer,
				width,
				height,
				dispose() {
					ctx.deleteTexture(texture);
					ctx.deleteFramebuffer(framebuffer);
				},
			};
			targets.push(made);
			return made;
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
			// Lower quality after sustained missed frames, never after one hitch, and never back up.
			const lower = slow / frames > 0.1 && quality > 0.4;
			duration = frames = slow = 0;
			if (!lower) return false;
			quality = Math.max(0.4, quality * 0.8);
			applySize();
			return true;
		},
		draw(target) {
			if (target) {
				ctx.bindFramebuffer(ctx.FRAMEBUFFER, target.framebuffer);
				ctx.viewport(0, 0, target.width, target.height);
			} else {
				ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
				ctx.viewport(0, 0, canvas.width, canvas.height);
			}
			ctx.bindVertexArray(vao);
			ctx.drawArrays(ctx.TRIANGLES, 0, 3);
		},
		dispose() {
			for (const program of programs) program.dispose();
			for (const target of targets) target.dispose();
			ctx.deleteBuffer(buffer);
			ctx.deleteVertexArray(vao);
		},
	};
}
