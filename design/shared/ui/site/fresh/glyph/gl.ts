/**
 * One full-viewport fragment shader on a canvas: compile, size, draw, dispose.
 * Forked from the film take's field. The caller owns the loop, its uniforms and
 * any textures; this owns the context and the resolution budget.
 */
const vertex = `attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

export type Surface = {
	gl: WebGLRenderingContext;
	/** "software" means no GPU: draw at a low resolution and skip ambient motion. */
	backend: "webgl" | "software";
	uniform(name: string): WebGLUniformLocation | null;
	/** Size in CSS pixels. */
	resize(width: number, height: number): void;
	/** Device pixels per CSS pixel the canvas is drawn at right now. */
	ratio(): number;
	/** Feed frame intervals; returns true once sustained slow frames lower the resolution. */
	sample(interval: number): boolean;
	/** Make this surface's program current again after another pass drew. */
	use(): void;
	/** Draw into the canvas at its own size. */
	draw(): void;
	dispose(): void;
};

export type SurfaceOptions = {
	/** Highest device pixel ratio to draw at. */
	maxRatio?: number;
	/** Fraction of that ratio to draw at, for fields soft enough to upscale. */
	scale?: number;
	/** Never draw below this many device pixels per CSS pixel, for fields with small detail. */
	minRatio?: number;
};

function context(canvas: HTMLCanvasElement, caveat: boolean) {
	return canvas.getContext("webgl", {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		premultipliedAlpha: false,
		powerPreference: "low-power",
		failIfMajorPerformanceCaveat: caveat,
	});
}

export function createSurface(canvas: HTMLCanvasElement, fragment: string, options: SurfaceOptions = {}): Surface | null {
	const maxRatio = options.maxRatio ?? 1.5;
	const scale = options.scale ?? 1;
	const minRatio = options.minRatio ?? 0;
	let backend: Surface["backend"] = "webgl";
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
		if (!program || !buffer) throw new Error("Glyph surface allocation failed");
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertex],
			[gl.FRAGMENT_SHADER, fragment],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Glyph shader allocation failed");
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				throw new Error(gl.getShaderInfoLog(shader) ?? "Glyph shader compile failed");
			}
			gl.attachShader(program, shader);
		}
		gl.bindAttribLocation(program, 0, "a_position");
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(gl.getProgramInfoLog(program) ?? "Glyph shader link failed");
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
		console.warn("Glyph surface unavailable:", error);
		return null;
	}

	const cache = new Map<string, WebGLUniformLocation | null>();
	// Lower quality after sustained missed frames, never after one hitch, and never back up.
	let quality = backend === "software" ? 0.5 : 1;
	let duration = 0,
		frames = 0,
		slow = 0;
	let cssWidth = 1,
		cssHeight = 1,
		current = 1;
	const applySize = () => {
		const dpr = window.devicePixelRatio || 1;
		current = Math.max(
			Math.min(dpr, minRatio),
			Math.min(dpr, maxRatio, 2600 / Math.max(cssWidth, cssHeight)) * scale * quality,
		);
		const width = Math.max(1, Math.round(cssWidth * current));
		const height = Math.max(1, Math.round(cssHeight * current));
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
		ratio: () => current,
		sample(interval) {
			if (interval <= 0 || interval >= 250) {
				duration = frames = slow = 0;
				return false;
			}
			duration += interval;
			frames++;
			if (interval > 20) slow++;
			if (duration < 2000) return false;
			const lower = slow / frames > 0.1 && quality > 0.5;
			duration = frames = slow = 0;
			if (!lower) return false;
			quality = Math.max(0.5, quality * 0.8);
			applySize();
			return true;
		},
		use() {
			// biome-ignore lint/correctness/useHookAtTopLevel: WebGL useProgram binds a shader program, not a React hook.
			gl.useProgram(program);
		},
		draw() {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, canvas.width, canvas.height);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		},
		dispose,
	};
}

export type Pass = {
	uniform(name: string): WebGLUniformLocation | null;
	/** Render the pass into its texture at `width` by `height` texels, leaving its program current. */
	render(width: number, height: number, setUniforms: () => void): void;
	texture: WebGLTexture | null;
	dispose(): void;
};

/**
 * A second fullscreen program that draws into a small texture instead of the
 * canvas, for work that only needs doing once per cell rather than per pixel.
 * It shares the surface's triangle, so it must be created after the surface.
 */
export function createPass(gl: WebGLRenderingContext, fragment: string, unit: number): Pass | null {
	const program = gl.createProgram();
	const shaders: WebGLShader[] = [];
	const texture = createTexture(gl, unit, gl.NEAREST);
	const framebuffer = gl.createFramebuffer();
	const dispose = () => {
		gl.deleteProgram(program);
		for (const shader of shaders) gl.deleteShader(shader);
		gl.deleteTexture(texture);
		gl.deleteFramebuffer(framebuffer);
	};
	try {
		if (!program || !framebuffer) throw new Error("Glyph pass allocation failed");
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertex],
			[gl.FRAGMENT_SHADER, fragment],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Glyph pass shader allocation failed");
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				throw new Error(gl.getShaderInfoLog(shader) ?? "Glyph pass compile failed");
			}
			gl.attachShader(program, shader);
		}
		gl.bindAttribLocation(program, 0, "a_position");
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(gl.getProgramInfoLog(program) ?? "Glyph pass link failed");
		}
	} catch (error) {
		dispose();
		console.warn("Glyph pass unavailable:", error);
		return null;
	}
	const cache = new Map<string, WebGLUniformLocation | null>();
	let size = "";
	return {
		texture,
		uniform(name) {
			if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
			return cache.get(name) ?? null;
		},
		render(width, height, setUniforms) {
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			if (size !== `${width}x${height}`) {
				size = `${width}x${height}`;
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
				gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
				gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			}
			// The texture can't be sampled while it is the target, so unbind it from its unit first.
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.viewport(0, 0, width, height);
			// biome-ignore lint/correctness/useHookAtTopLevel: WebGL useProgram binds a shader program, not a React hook.
			gl.useProgram(program);
			setUniforms();
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.bindTexture(gl.TEXTURE_2D, texture);
		},
		dispose,
	};
}

/** A texture sampled as-is: no mipmaps, clamped, so any size works in WebGL 1. */
export function createTexture(gl: WebGLRenderingContext, unit: number, filter: number) {
	const texture = gl.createTexture();
	gl.activeTexture(gl.TEXTURE0 + unit);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	return texture;
}
