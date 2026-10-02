import { HALVING_UNITS, SQUARE_PX } from "./picture-plan";

/**
 * The picture layer's GPU side (#81): the context, the program, the buffers,
 * the square array, a halving's texture, and the draw. Which still is drawn
 * where, and from which texture, is the layer's (`picture-layer.ts`).
 */

/** Floats per drawn picture: its box, its picture's size, its square's layer, its sampler unit. */
export const FLOATS = 8;

const SQUARE_LEVELS = Math.log2(SQUARE_PX) + 1;

export interface Gpu {
	gl: WebGL2RenderingContext;
	program: WebGLProgram;
	vao: WebGLVertexArrayObject;
	corners: WebGLBuffer;
	instances: WebGLBuffer;
	view: WebGLUniformLocation | null;
	radius: WebGLUniformLocation | null;
	surface: WebGLUniformLocation | null;
	/** Every still's square, one layer each. */
	squares: WebGLTexture;
	capacity: number;
	maxLayers: number;
	maxSide: number;
	units: number;
	anisotropy: number;
	/** What an unused sampler unit binds. */
	blank: WebGLTexture;
	/** Reads a square layer out when the array is copied into a larger one. */
	copy: WebGLFramebuffer;
}

/** The canvas's WebGL2 context, or null on a browser without one. */
export function contextOf(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
	return canvas.getContext("webgl2", {
		alpha: true,
		premultipliedAlpha: true,
		antialias: false,
		depth: false,
		stencil: false,
		preserveDrawingBuffer: false,
		// drawn in the same frame as the DOM, never ahead of it (#81's lockstep)
		desynchronized: false,
		powerPreference: "default",
	});
}

const VERTEX = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_box;
layout(location = 2) in vec4 a_picture;
uniform vec2 u_view;
out vec2 v_local;
flat out vec2 v_size;
flat out vec2 v_picture;
flat out float v_layer;
flat out int v_unit;
void main() {
	// a device pixel of slack on every side, for the antialiased edge
	vec2 local = a_corner * (a_box.zw + 2.0) - 1.0;
	vec2 device = a_box.xy + local;
	gl_Position = vec4(device / u_view * 2.0 - 1.0, 0.0, 1.0);
	gl_Position.y = -gl_Position.y;
	v_local = local;
	v_size = a_box.zw;
	v_picture = a_picture.xy;
	v_layer = a_picture.z;
	v_unit = int(a_picture.w);
}`;

/**
 * The frame's surface, its picture contained at the top left over it, and the
 * shell's rounded corner, all antialiased the way the DOM rounds a clip: a
 * half-pixel ramp either side of the edge, from a signed distance.
 */
function fragment(units: number): string {
	const cases = Array.from({ length: units }, (_, i) => `\t\tcase ${i + 1}: return drawn(u_halvings[${i}], st);`).join(
		"\n",
	);
	return `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray u_squares;
uniform sampler2D u_halvings[${units}];
uniform float u_radius;
uniform vec4 u_surface;
in vec2 v_local;
flat in vec2 v_size;
flat in vec2 v_picture;
flat in float v_layer;
flat in int v_unit;
out vec4 o_color;
float edge(vec2 p, vec2 size, float r) {
	vec2 half_size = size * 0.5;
	vec2 q = abs(p - half_size) - half_size + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// Mitchell-Netravali, B = C = 1/3: the cubic Chrome draws a grown image with
float mitchell(float x) {
	x = abs(x);
	if (x < 1.0) return (7.0 * x * x * x - 12.0 * x * x + 16.0 / 3.0) / 6.0;
	if (x < 2.0) return (-7.0 / 3.0 * x * x * x + 12.0 * x * x - 20.0 * x + 32.0 / 3.0) / 6.0;
	return 0.0;
}
// A halving drawn the way the image element drew the still: shrunk, from the
// mip level at least as large as the drawing, filtered linearly; grown,
// through the cubic over the sixteen texels around the sample.
vec4 drawn(sampler2D tex, vec2 st) {
	vec2 size = vec2(textureSize(tex, 0));
	vec2 rho = size / max(v_picture, vec2(1e-6));
	float shrink = max(rho.x, rho.y);
	if (shrink >= 1.0) return textureLod(tex, st, floor(log2(shrink)));
	vec2 p = st * size - 0.5;
	vec2 corner = floor(p);
	vec2 f = p - corner;
	vec4 sum = vec4(0.0);
	for (int j = -1; j <= 2; j++) {
		float wy = mitchell(float(j) - f.y);
		for (int i = -1; i <= 2; i++) {
			ivec2 at = ivec2(clamp(corner + vec2(i, j), vec2(0.0), size - 1.0));
			sum += texelFetch(tex, at, 0) * mitchell(float(i) - f.x) * wy;
		}
	}
	return clamp(sum, 0.0, 1.0);
}
vec4 halving(vec2 st) {
	switch (v_unit) {
${cases}
	}
	return vec4(0.0);
}
void main() {
	vec2 st = v_local / max(v_picture, vec2(1e-6));
	// derivatives before any branch: a quad that diverges has none to give
	vec2 dx = dFdx(st);
	vec2 dy = dFdy(st);
	float radius = min(u_radius, 0.5 * min(v_size.x, v_size.y));
	float coverage = clamp(0.5 - edge(v_local, v_size, radius), 0.0, 1.0);
	vec4 color = u_surface;
	if (v_unit >= 0 && v_picture.x > 0.0) {
		vec2 clamped = clamp(st, 0.0, 1.0);
		vec4 texel = v_unit == 0
			? textureGrad(u_squares, vec3(clamped, v_layer), dx, dy)
			: halving(clamped);
		float inside = clamp(0.5 - edge(v_local, v_picture, 0.0), 0.0, 1.0);
		color = mix(u_surface, texel + u_surface * (1.0 - texel.a), inside);
	}
	o_color = color * coverage;
}`;
}

/** Everything the layer draws with, made on a live context. */
export function openGpu(gl: WebGL2RenderingContext): Gpu {
	const units = Math.min(HALVING_UNITS, (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number) - 1);
	const program = link(gl, VERTEX, fragment(units));
	const extension = gl.getExtension("EXT_texture_filter_anisotropic");
	const anisotropy =
		extension === null ? 1 : Math.min(8, gl.getParameter(extension.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number);
	// biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
	gl.useProgram(program);
	gl.uniform1i(gl.getUniformLocation(program, "u_squares"), 0);
	gl.uniform1iv(
		gl.getUniformLocation(program, "u_halvings"),
		Array.from({ length: units }, (_, i) => i + 1),
	);
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);
	const corners = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, corners);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	const instances = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, instances);
	for (const location of [1, 2]) {
		gl.enableVertexAttribArray(location);
		gl.vertexAttribPointer(location, 4, gl.FLOAT, false, FLOATS * 4, (location - 1) * 16);
		gl.vertexAttribDivisor(location, 1);
	}
	gl.bindVertexArray(null);
	const blank = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, blank);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
	return {
		gl,
		program,
		vao,
		corners,
		instances,
		view: gl.getUniformLocation(program, "u_view"),
		radius: gl.getUniformLocation(program, "u_radius"),
		surface: gl.getUniformLocation(program, "u_surface"),
		squares: squareArray(gl, 16, anisotropy),
		capacity: 16,
		maxLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number,
		maxSide: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
		units,
		anisotropy,
		blank,
		copy: gl.createFramebuffer(),
	};
}

/** Delete everything `openGpu` made. Nothing to do on a lost context: its objects went with it. */
export function closeGpu(gpu: Gpu): void {
	const { gl } = gpu;
	if (gl.isContextLost()) return;
	gl.deleteProgram(gpu.program);
	gl.deleteVertexArray(gpu.vao);
	gl.deleteBuffer(gpu.corners);
	gl.deleteBuffer(gpu.instances);
	gl.deleteTexture(gpu.squares);
	gl.deleteTexture(gpu.blank);
	gl.deleteFramebuffer(gpu.copy);
}

/** One drawn frame of pictures: the instances in drawing order, cut into draws by sampler unit (`bindUnits`). */
export function drawPictures(
	gpu: Gpu,
	view: { width: number; height: number; radius: number; surface: readonly [number, number, number, number] },
	instances: Float32Array,
	draws: readonly { start: number; end: number; bound: readonly WebGLTexture[] }[],
): void {
	const { gl } = gpu;
	// biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
	gl.useProgram(gpu.program);
	gl.uniform2f(gpu.view, view.width, view.height);
	gl.uniform1f(gpu.radius, view.radius);
	const [r, g, b, a] = view.surface;
	gl.uniform4f(gpu.surface, r * a, g * a, b * a, a);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
	gl.bindVertexArray(gpu.vao);
	gl.bindBuffer(gl.ARRAY_BUFFER, gpu.instances);
	gl.bufferData(gl.ARRAY_BUFFER, instances, gl.STREAM_DRAW);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D_ARRAY, gpu.squares);
	for (const draw of draws) {
		if (draw.end <= draw.start) continue;
		for (let unit = 0; unit < gpu.units; unit++) {
			gl.activeTexture(gl.TEXTURE1 + unit);
			gl.bindTexture(gl.TEXTURE_2D, draw.bound[unit] ?? gpu.blank);
		}
		const offset = draw.start * FLOATS * 4;
		gl.vertexAttribPointer(1, 4, gl.FLOAT, false, FLOATS * 4, offset);
		gl.vertexAttribPointer(2, 4, gl.FLOAT, false, FLOATS * 4, offset + 16);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, draw.end - draw.start);
	}
	gl.bindVertexArray(null);
}

/** Put a square in its layer; the array's mips are made again once a frame's squares are all in (`mipSquares`). */
export function uploadSquare(gpu: Gpu, layer: number, bitmap: ImageBitmap): void {
	const { gl } = gpu;
	gl.bindTexture(gl.TEXTURE_2D_ARRAY, gpu.squares);
	gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, SQUARE_PX, SQUARE_PX, 1, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
}

export function mipSquares(gpu: Gpu): void {
	gpu.gl.bindTexture(gpu.gl.TEXTURE_2D_ARRAY, gpu.squares);
	gpu.gl.generateMipmap(gpu.gl.TEXTURE_2D_ARRAY);
}

/** A halving's texture, its mip chain made on the GPU. */
export function halvingTexture(gpu: Gpu, bitmap: ImageBitmap): WebGLTexture {
	const { gl } = gpu;
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texStorage2D(gl.TEXTURE_2D, levels(bitmap.width, bitmap.height), gl.RGBA8, bitmap.width, bitmap.height);
	gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
	gl.generateMipmap(gl.TEXTURE_2D);
	filter(gl, gl.TEXTURE_2D, gpu.anisotropy);
	return texture;
}

/**
 * A new square array of `capacity` layers holding the given layers of the old
 * one, in that order from the first layer, copied across on the GPU. The old
 * array is deleted.
 */
export function regrowSquares(gpu: Gpu, capacity: number, keep: readonly number[]): void {
	const { gl } = gpu;
	const next = squareArray(gl, capacity, gpu.anisotropy);
	if (keep.length > 0) {
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, gpu.copy);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, next);
		keep.forEach((from, to) => {
			gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gpu.squares, 0, from);
			gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, to, 0, 0, SQUARE_PX, SQUARE_PX);
		});
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
		gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
	}
	gl.deleteTexture(gpu.squares);
	gpu.squares = next;
	gpu.capacity = capacity;
}

const levels = (width: number, height: number): number => Math.floor(Math.log2(Math.max(width, height))) + 1;

/** Trilinear, and anisotropic where the GPU offers it: a square drawn at its still's shape is sampled unevenly. */
function filter(gl: WebGL2RenderingContext, target: number, anisotropy: number): void {
	gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
	gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	if (anisotropy > 1) gl.texParameterf(target, 0x84fe /* TEXTURE_MAX_ANISOTROPY_EXT */, anisotropy);
}

/**
 * A square array of `capacity` layers, every level of every layer written
 * before anything samples it.
 *
 * WebGL promises a texture reads as zeros until written, and Chrome keeps the
 * promise by clearing whatever is unwritten the first time a draw samples it:
 * one clear per layer and level, on the GPU process's main thread. For an
 * array sized to a thousand-frame page that was a 200 ms stall in the first
 * draw after the page opened, and every renderer's raster waited behind it,
 * the documents of readable frames included. Written here from a pixel buffer
 * the GPU process fills with zeros itself, it is one copy per level and
 * nothing crosses from the page.
 */
function squareArray(gl: WebGL2RenderingContext, capacity: number, anisotropy: number): WebGLTexture {
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
	gl.texStorage3D(gl.TEXTURE_2D_ARRAY, SQUARE_LEVELS, gl.RGBA8, SQUARE_PX, SQUARE_PX, capacity);
	const zeros = gl.createBuffer();
	gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, zeros);
	gl.bufferData(gl.PIXEL_UNPACK_BUFFER, SQUARE_PX * SQUARE_PX * 4 * capacity, gl.STATIC_DRAW);
	// a buffer source refuses the page-side unpack conversions
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
	for (let level = 0, side = SQUARE_PX; level < SQUARE_LEVELS; level++, side = Math.max(1, side >> 1)) {
		gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, level, 0, 0, 0, side, side, capacity, gl.RGBA, gl.UNSIGNED_BYTE, 0);
	}
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
	gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
	gl.deleteBuffer(zeros);
	filter(gl, gl.TEXTURE_2D_ARRAY, anisotropy);
	return texture;
}

/** The program, its shaders deleted once linked: the program keeps what it needs of them. */
function link(gl: WebGL2RenderingContext, vertex: string, fragmentSource: string): WebGLProgram {
	const program = gl.createProgram();
	const shaders: WebGLShader[] = [];
	for (const [type, source] of [
		[gl.VERTEX_SHADER, vertex],
		[gl.FRAGMENT_SHADER, fragmentSource],
	] as const) {
		const shader = gl.createShader(type);
		if (shader === null) throw new Error("could not create a shader");
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		gl.attachShader(program, shader);
		shaders.push(shader);
	}
	gl.linkProgram(program);
	const failed = gl.getProgramParameter(program, gl.LINK_STATUS) !== true && !gl.isContextLost();
	const log = failed ? gl.getProgramInfoLog(program) : null;
	for (const shader of shaders) {
		gl.detachShader(program, shader);
		gl.deleteShader(shader);
	}
	if (failed) throw new Error(`picture layer: ${log ?? "the program did not link"}`);
	return program;
}
