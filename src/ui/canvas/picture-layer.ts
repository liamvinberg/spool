import type { Camera } from "../api";
import { shellRadiusOnScreen } from "./camera";
import type { PixelSize } from "./cover-size";
import type { LoaderAsk, LoaderReply } from "./picture-loader";
import { bindUnits, containSize, evictions, RESIDENT_PX, SHARP_UNITS, textureBytes, textureFor } from "./picture-plan";

/**
 * The picture layer (#81, #107): every frame standing as its picture, drawn by
 * the GPU in one WebGL2 canvas behind the DOM.
 *
 * A page of a thousand pictures as DOM is a thousand transformed, rounded,
 * clipped boxes, and Chrome re-decides its layers for all of them and
 * re-rasterizes the visible ones on every frame of a pan or zoom: stalls of a
 * quarter to most of a second on the overview, where nothing can be culled
 * because everything is on screen. Here the same pictures are one instanced
 * draw, flat in frame count. Documents stay DOM, over this canvas, because a
 * GPU layer under the DOM cannot draw over an iframe; so does every frame
 * with no cover, which keeps its placeholder shell.
 *
 * It draws only when told, with the camera it is told: the camera store's own
 * callback, the one that moves the DOM field, hands it each camera
 * (`picture-canvas.tsx`), so the pictures and everything over them land in the
 * same frame and can never be one apart. A one-off redraw happens only when a
 * texture lands while the camera is still, and it draws the camera last
 * delivered, which is the one the DOM is showing.
 *
 * Textures, by what a frame needs at the size it is drawn (`picture-plan.ts`):
 *
 *   resident: every frame's cover as a 64 px square in one texture array,
 *             mipmapped on the GPU, its true shape restored when drawn;
 *   sharper:  for a frame drawn wider than that, the cover halved to the
 *             smallest size at least as wide as the drawing, or the cover
 *             itself, streamed while it is on screen, kept within a budget of
 *             a few screens and dropped least recently drawn first.
 *
 * Covers are immutable and content-addressed, so a changed cover is a new
 * address and a new texture; the old one is drawn until the new one lands and
 * then let go.
 */

/** One frame as the layer sees it: a world box, and the address of its picture. */
export interface PictureFrame {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** The cover's address, absent for a frame with none: its DOM placeholder draws it. */
	url: string | undefined;
}

/** What the layer drew for one frame, read back by tests and benches (`report`). */
export interface DrawnPicture {
	name: string;
	url: string;
	/** The frame on screen, in CSS pixels from the canvas's top left. */
	box: { x: number; y: number; w: number; h: number };
	/** The picture inside it in CSS pixels, contained at the top left; null before its size is known. */
	picture: { w: number; h: number } | null;
	/** The cover's own pixel size, from its header. */
	natural: PixelSize | null;
	/** What was sampled: the resident square, a sharper copy, or nothing yet (the surface alone). */
	texture:
		| { kind: "resident"; width: number; height: number }
		| { kind: "sharp"; width: number; height: number }
		| null;
	/** What a frame drawn this size wants. */
	wanted:
		| { kind: "resident"; width: number; height: number }
		| { kind: "sharp"; width: number; height: number }
		| null;
}

export interface PictureReport {
	/** The camera the last draw used: the one the DOM field was showing. */
	camera: Camera | null;
	/** Device pixels per CSS pixel of the canvas. */
	scale: number;
	drawn: DrawnPicture[];
	/** Frames whose DOM shell has taken over drawing them. */
	claimed: string[];
	/** Every frame on screen drawn with the texture its size wants. */
	complete: boolean;
	/** The context is lost and nothing is being drawn until it comes back. */
	lost: boolean;
	/** How many times the layer has drawn, which a test can wait on. */
	draws: number;
	/** GPU bytes held by the resident array and by sharper copies. */
	bytes: { resident: number; sharp: number };
	/** Covers still on their way: with the loader, or decoded and waiting to upload. */
	pending: { asked: number; landed: number };
	/**
	 * Every frame on the page with a cover, on screen or not: when its cover's
	 * bytes arrived and when its square reached the GPU, on the page's clock.
	 * The picture layer's answer to "has every frame got its picture yet".
	 */
	covers: { name: string; fetched: number | null; uploaded: number | null }[];
}

/**
 * Upload limits per drawn frame. A texture upload is a copy the GPU process
 * makes, but its call and the mip chain after it are paid in the frame they
 * are made in; past these, the rest waits for the next frame, so a zoom that
 * suddenly wants a screenful of sharper copies never pays for it in one. A
 * camera at rest has no frame to protect, and fills the page faster.
 */
const UPLOAD_MS = { moving: 2, still: 6 };
const UPLOAD_BYTES = { moving: 8 * 1024 * 1024, still: 32 * 1024 * 1024 };

/**
 * The memory sharper copies may keep: two screens of device pixels, mips
 * included, and never less than 32 MB. What is on screen is always drawn as
 * sharp as it wants (a halving of the cover at least as wide as its drawing,
 * so at most four screens of pixels and usually much less); past that, copies
 * whose frames have left the screen go, least recently drawn first. Bounded by
 * the screen, not the page: a frame long off screen holds only its square.
 */
function sharpBudget(width: number, height: number): number {
	return Math.max(32 * 1024 * 1024, 2 * textureBytes(width, height, true));
}

interface Resident {
	/** The layer of the texture array holding it, once uploaded. */
	slot: number | null;
	natural: PixelSize | null;
	state: "waiting" | "ready" | "failed";
	/** When its bytes arrived and when its square reached the GPU, on the page's clock. */
	fetched?: number;
	uploaded?: number;
}

interface Sharp {
	url: string;
	width: number;
	height: number;
	texture: WebGLTexture | null;
	state: "waiting" | "ready" | "failed";
	bytes: number;
	/** The draw that last sampled it, for least-recently-drawn eviction. */
	used: number;
}

interface Job {
	key: string;
	url: string;
	sharp: { width: number; height: number } | null;
	/** Lower loads first: 0 a sharper copy on screen, 1 a resident square on screen, 2 the rest. */
	priority: number;
}

interface Landed {
	job: Job;
	bitmap: ImageBitmap;
	natural: PixelSize;
}

interface Gpu {
	gl: WebGL2RenderingContext;
	program: WebGLProgram;
	vao: WebGLVertexArrayObject;
	instances: WebGLBuffer;
	view: WebGLUniformLocation | null;
	radius: WebGLUniformLocation | null;
	surface: WebGLUniformLocation | null;
	resident: WebGLTexture;
	capacity: number;
	maxLayers: number;
	maxSide: number;
	units: number;
	anisotropy: number;
	blank: WebGLTexture;
	copy: WebGLFramebuffer;
}

const FLOATS = 8;
const RESIDENT_LEVELS = Math.log2(RESIDENT_PX) + 1;

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
	const cases = Array.from({ length: units }, (_, i) => `\t\tcase ${i + 1}: return drawn(u_sharp[${i}], st);`).join(
		"\n",
	);
	return `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray u_resident;
uniform sampler2D u_sharp[${units}];
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
// A sharper copy drawn the way the image element drew the cover: shrunk, from
// the mip level at least as large as the drawing, filtered linearly; grown,
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
vec4 sharp(vec2 st) {
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
	float cover = clamp(0.5 - edge(v_local, v_size, radius), 0.0, 1.0);
	vec4 color = u_surface;
	if (v_unit >= 0 && v_picture.x > 0.0) {
		vec2 clamped = clamp(st, 0.0, 1.0);
		vec4 texel = v_unit == 0
			? textureGrad(u_resident, vec3(clamped, v_layer), dx, dy)
			: sharp(clamped);
		float inside = clamp(0.5 - edge(v_local, v_picture, 0.0), 0.0, 1.0);
		color = mix(u_surface, texel + u_surface * (1.0 - texel.a), inside);
	}
	o_color = color * cover;
}`;
}

export class PictureLayer {
	private gpu: Gpu | null = null;
	private lost = false;
	private frames: readonly PictureFrame[] = [];
	/** The picture each frame showed before its cover changed, drawn until the new one lands. */
	private previous = new Map<string, string>();
	private readonly claimed = new Set<string>();
	private readonly residents = new Map<string, Resident>();
	/** Which cover each layer of the resident array holds. */
	private slots: (string | null)[] = [];
	private readonly sharps = new Map<string, Sharp>();
	/** Loads handed to the loader and not back yet (`picture-loader.ts`). */
	private readonly asked = new Map<string, Job>();
	private loader: Worker | null = null;
	private landed: Landed[] = [];
	/** Bumped when the context goes, so a decode begun before it lands nowhere. */
	private generation = 0;
	private camera: Camera | null = null;
	private width = 0;
	private height = 0;
	private scale = 1;
	private surface: readonly [number, number, number, number] = [0, 0, 0, 1];
	private stamp = 0;
	/** Whether the camera last drawn was moving, which decides how much uploads may spend. */
	private moving = false;
	private draws = 0;
	private instances = new Float32Array(0);
	private redraw = false;
	private settle = false;
	private disposed = false;

	constructor(private readonly canvas: HTMLCanvasElement) {
		canvas.addEventListener("webglcontextlost", this.onLost);
		canvas.addEventListener("webglcontextrestored", this.onRestored);
		this.gpu = this.open();
		// no GPU, nothing to load for: a canvas without WebGL draws no pictures
		if (this.gpu !== null) {
			this.loader = new Worker(new URL("./picture-loader.ts", import.meta.url), { type: "module" });
			this.loader.addEventListener("message", this.onLoaded);
		}
	}

	/** The frames on this page, in drawing order: a later frame draws over an earlier one. */
	setFrames(frames: readonly PictureFrame[]): void {
		const was = new Map(this.frames.map((frame) => [frame.name, frame.url]));
		const previous = new Map<string, string>();
		for (const frame of frames) {
			const before = was.get(frame.name) ?? undefined;
			const held = this.previous.get(frame.name);
			// a changed cover draws the picture it replaces until its own lands
			const standIn = before !== undefined && before !== frame.url ? before : held;
			if (standIn !== undefined && standIn !== frame.url && frame.url !== undefined)
				previous.set(frame.name, standIn);
		}
		this.frames = frames;
		this.previous = previous;
		this.forget();
		for (const frame of frames) if (frame.url !== undefined) this.want(frame.url, null, 2);
		this.sizeArray();
		this.invalidate();
	}

	/**
	 * A frame's DOM shell has taken over drawing it, or let go (`picture-canvas.tsx`).
	 * The redraw lands before the next paint, in the same frame as the shell's
	 * own change, so the two never show the frame twice or not at all.
	 */
	claim(name: string, claimed: boolean): void {
		if (claimed === this.claimed.has(name)) return;
		if (claimed) this.claimed.add(name);
		else this.claimed.delete(name);
		this.invalidate();
	}

	/** The surface a frame stands on before and around its picture, as the shell's `bg-surface`. */
	setSurface(rgba: readonly [number, number, number, number]): void {
		if (rgba.every((value, i) => value === this.surface[i])) return;
		this.surface = rgba;
		this.invalidate();
	}

	/** The canvas's size in CSS pixels and in device pixels; drawn again at once, before the paint it changes. */
	resize(cssWidth: number, deviceWidth: number, deviceHeight: number): void {
		this.scale = cssWidth > 0 ? deviceWidth / cssWidth : 1;
		if (deviceWidth !== this.width || deviceHeight !== this.height) {
			this.width = deviceWidth;
			this.height = deviceHeight;
			this.canvas.width = deviceWidth;
			this.canvas.height = deviceHeight;
		}
		this.render();
	}

	/**
	 * Draw this camera, now: called from the camera store's frame, with the
	 * camera it is drawing and whether it is still moving.
	 */
	draw(camera: Camera | null, moving = false): void {
		this.moving = moving;
		// the store says so once more when a camera comes to rest, and that
		// camera is already on screen: everything else that changes the picture
		// asks for its own draw
		if (camera === this.camera && this.draws > 0) return;
		this.camera = camera;
		this.render();
	}

	dispose(): void {
		this.disposed = true;
		this.canvas.removeEventListener("webglcontextlost", this.onLost);
		this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
		this.release();
		this.loader?.terminate();
		this.loader = null;
	}

	/** What the last draw put on screen, worked out again from the state it drew. */
	report(): PictureReport {
		const drawn: DrawnPicture[] = [];
		const camera = this.camera;
		let complete = true;
		if (camera !== null) {
			this.walk(camera, (frame, box, look) => {
				const css = (value: number) => value / this.scale;
				const picture = look.picture === null ? null : { w: css(look.picture.w), h: css(look.picture.h) };
				const texture =
					look.sharp !== null
						? { kind: "sharp" as const, width: look.sharp.width, height: look.sharp.height }
						: look.resident
							? { kind: "resident" as const, width: RESIDENT_PX, height: RESIDENT_PX }
							: null;
				const wanted =
					look.wanted === null
						? null
						: look.wanted.kind === "resident"
							? { kind: "resident" as const, width: RESIDENT_PX, height: RESIDENT_PX }
							: look.wanted;
				if (
					texture === null ||
					wanted === null ||
					texture.kind !== wanted.kind ||
					texture.width !== wanted.width ||
					look.url !== frame.url
				) {
					complete = false;
				}
				drawn.push({
					name: frame.name,
					url: look.url,
					box: { x: css(box.x), y: css(box.y), w: css(box.w), h: css(box.h) },
					picture,
					natural: look.natural,
					texture,
					wanted,
				});
			});
		}
		let sharp = 0;
		for (const entry of this.sharps.values()) if (entry.texture !== null) sharp += entry.bytes;
		return {
			camera,
			scale: this.scale,
			drawn,
			claimed: [...this.claimed],
			complete: complete && !this.lost && this.gpu !== null,
			lost: this.lost || this.gpu === null,
			draws: this.draws,
			bytes: {
				resident: this.gpu === null ? 0 : this.gpu.capacity * textureBytes(RESIDENT_PX, RESIDENT_PX, true),
				sharp,
			},
			pending: { asked: this.asked.size, landed: this.landed.length },
			covers: this.frames.flatMap((frame) => {
				if (frame.url === undefined) return [];
				const entry = this.residents.get(frame.url);
				return [{ name: frame.name, fetched: entry?.fetched ?? null, uploaded: entry?.uploaded ?? null }];
			}),
		};
	}

	// --- drawing ---------------------------------------------------------------

	/**
	 * Every frame on screen and not claimed by its shell, in drawing order, with
	 * what it would be drawn from. Shared by the draw and the report, so what a
	 * test reads back is what the GPU was given.
	 */
	private walk(
		camera: Camera,
		visit: (
			frame: PictureFrame & { url: string },
			box: { x: number; y: number; w: number; h: number },
			look: Look,
		) => void,
		claimed?: (frame: PictureFrame & { url: string }, look: Look) => void,
	): void {
		const { k } = camera;
		const s = this.scale;
		for (const frame of this.frames) {
			if (frame.url === undefined) continue;
			const box = {
				x: (frame.x * k + camera.x) * s,
				y: (frame.y * k + camera.y) * s,
				w: frame.w * k * s,
				h: frame.h * k * s,
			};
			if (box.x > this.width + 1 || box.y > this.height + 1 || box.x + box.w < -1 || box.y + box.h < -1) continue;
			const look = this.look(frame as PictureFrame & { url: string }, box);
			if (this.claimed.has(frame.name)) claimed?.(frame as PictureFrame & { url: string }, look);
			else visit(frame as PictureFrame & { url: string }, box, look);
		}
	}

	/**
	 * What one frame on screen is drawn from, and what it would want. A frame
	 * whose cover just changed keeps drawing the picture it replaced for as long
	 * as that one is the better of the two at this size, so a new cover never
	 * shows as a blur or a blank on its way in.
	 */
	private look(frame: PictureFrame & { url: string }, box: { w: number; h: number }): Look {
		const own = this.lookAt(frame.url, box);
		const stand = this.previous.get(frame.name);
		if (stand === undefined) return own;
		const old = this.lookAt(stand, box);
		return rank(old) > rank(own) ? { ...old, own } : { ...own, own, done: rank(own) === Number.POSITIVE_INFINITY };
	}

	private lookAt(url: string, box: { w: number; h: number }): Look {
		const resident = this.residents.get(url);
		const natural = resident?.natural ?? null;
		if (natural === null) return { url, natural, picture: null, wanted: null, resident: false, sharp: null };
		const picture = containSize(box.w, box.h, natural);
		const wanted = textureFor(picture, natural, this.gpu?.maxSide ?? 4096);
		const ready = resident?.state === "ready" && resident.slot !== null;
		let sharp: Sharp | null = null;
		if (wanted.kind === "sharp") {
			const exact = this.sharps.get(sharpKey(url, wanted.width));
			if (exact?.texture != null) sharp = exact;
		}
		// the next best thing on hand: any sharper copy beats the square once it
		// is wanted, and a square that is not there yet loses to anything. An
		// overview has every square it wants, so this walk is for close-ups only.
		if (sharp === null && (wanted.kind === "sharp" || !ready)) {
			for (const entry of this.sharps.values()) {
				if (entry.url !== url || entry.texture === null) continue;
				if (sharp === null || entry.width > sharp.width) sharp = entry;
			}
		}
		return { url, natural, picture, wanted, resident: ready, sharp };
	}

	private render(): void {
		this.redraw = false;
		const gpu = this.gpu;
		if (gpu === null || this.lost || this.disposed || this.width === 0 || this.height === 0) return;
		const { gl } = gpu;
		this.upload(gpu);
		this.stamp += 1;
		this.draws += 1;
		gl.viewport(0, 0, this.width, this.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		const camera = this.camera;
		if (camera === null) return;

		const textures: (WebGLTexture | null)[] = [];
		const none: boolean[] = [];
		const wants: { job: Job; area: number }[] = [];
		const note = (frame: PictureFrame & { url: string }, look: Look) => {
			if (look.sharp !== null) look.sharp.used = this.stamp;
			if (look.done === true) {
				const stand = this.previous.get(frame.name);
				this.previous.delete(frame.name);
				if (stand !== undefined) this.forget(stand);
			}
			// what to load is the frame's own cover's business, whatever stands in for it
			const own = look.own ?? look;
			const wanted = own.wanted;
			if (wanted?.kind === "sharp" && (own.sharp === null || own.sharp.width !== wanted.width)) {
				wants.push({
					job: { key: sharpKey(own.url, wanted.width), url: own.url, sharp: wanted, priority: 0 },
					area: wanted.width * wanted.height,
				});
			}
			// a square on screen jumps the queue of the page's other squares
			const resident = this.asked.get(own.url);
			if (resident !== undefined && resident.priority > 1) {
				resident.priority = 1;
				this.loader?.postMessage({ kind: "priority", key: resident.key, priority: 1 } satisfies LoaderAsk);
			}
		};
		let count = 0;
		this.walk(
			camera,
			(frame, box, look) => {
				note(frame, look);
				if (this.instances.length < (count + 1) * FLOATS) {
					const grown = new Float32Array(Math.max(64, (count + 1) * 2) * FLOATS);
					grown.set(this.instances);
					this.instances = grown;
				}
				const at = count * FLOATS;
				const data = this.instances;
				data[at] = box.x;
				data[at + 1] = box.y;
				data[at + 2] = box.w;
				data[at + 3] = box.h;
				data[at + 4] = look.picture?.w ?? 0;
				data[at + 5] = look.picture?.h ?? 0;
				data[at + 6] = look.resident ? (this.residents.get(look.url)?.slot ?? 0) : 0;
				textures.push(look.sharp?.texture ?? null);
				none.push(look.sharp === null && !look.resident);
				count += 1;
			},
			// a frame its shell is drawing still keeps its sharper copy warm, so
			// the moment it hands back its picture is already as sharp as it was
			note,
		);
		this.request(wants);

		if (count > 0) {
			const { unit, draws } = bindUnits(textures, gpu.units);
			for (let i = 0; i < count; i++) this.instances[i * FLOATS + 7] = none[i] ? -1 : (unit[i] ?? 0);
			// biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
			gl.useProgram(gpu.program);
			gl.uniform2f(gpu.view, this.width, this.height);
			gl.uniform1f(gpu.radius, shellRadiusOnScreen(camera.k) * this.scale);
			const [r, g, b, a] = this.surface;
			gl.uniform4f(gpu.surface, r * a, g * a, b * a, a);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.bindVertexArray(gpu.vao);
			gl.bindBuffer(gl.ARRAY_BUFFER, gpu.instances);
			gl.bufferData(gl.ARRAY_BUFFER, this.instances.subarray(0, count * FLOATS), gl.STREAM_DRAW);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, gpu.resident);
			for (const draw of draws) {
				if (draw.end <= draw.start) continue;
				for (let unitAt = 0; unitAt < gpu.units; unitAt++) {
					gl.activeTexture(gl.TEXTURE1 + unitAt);
					gl.bindTexture(gl.TEXTURE_2D, draw.bound[unitAt] ?? gpu.blank);
				}
				const offset = draw.start * FLOATS * 4;
				gl.vertexAttribPointer(1, 4, gl.FLOAT, false, FLOATS * 4, offset);
				gl.vertexAttribPointer(2, 4, gl.FLOAT, false, FLOATS * 4, offset + 16);
				gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, draw.end - draw.start);
			}
			gl.bindVertexArray(null);
		}
		this.evict(gpu);
		if (this.landed.length > 0) this.wake();
	}

	/** Draw again before the next paint: what a shell's claim or a new frame list changes. */
	private invalidate(): void {
		if (this.settle) return;
		this.settle = true;
		queueMicrotask(() => {
			this.settle = false;
			this.render();
		});
	}

	/** Draw once more at the next frame: a texture landed while the camera is still. */
	private wake(): void {
		if (this.redraw || this.disposed) return;
		this.redraw = true;
		requestAnimationFrame(() => {
			if (this.redraw) this.render();
		});
	}

	// --- textures --------------------------------------------------------------

	/** Ask the loader for a cover at the size a tier keeps it, unless that is already on its way or held. */
	private want(url: string, sharp: { width: number; height: number } | null, priority: number): void {
		if (sharp === null) {
			if (this.residents.has(url)) return;
			this.residents.set(url, { slot: null, natural: null, state: "waiting" });
			this.ask({ key: url, url, sharp: null, priority });
			return;
		}
		const key = sharpKey(url, sharp.width);
		if (this.sharps.has(key)) return;
		this.sharps.set(key, {
			url,
			width: sharp.width,
			height: sharp.height,
			texture: null,
			state: "waiting",
			bytes: textureBytes(sharp.width, sharp.height, true),
			used: this.stamp,
		});
		this.ask({ key, url, sharp, priority });
	}

	/** Hand a load to the loader. Nothing loads without a context to upload to; a restored one asks again. */
	private ask(job: Job): void {
		if (this.loader === null || this.gpu === null || this.lost) return;
		this.asked.set(job.key, job);
		this.loader.postMessage({
			kind: "load",
			key: job.key,
			url: new URL(job.url, location.href).href,
			size: job.sharp ?? "resident",
			priority: job.priority,
			generation: this.generation,
		} satisfies LoaderAsk);
	}

	/** Take back a load nobody wants any more, if the loader has not started it. */
	private cancel(key: string): void {
		if (!this.asked.delete(key)) return;
		this.loader?.postMessage({ kind: "cancel", key } satisfies LoaderAsk);
	}

	/**
	 * The sharper copies this draw asked for, largest on screen first. Every
	 * one is asked for: what the screen shows is bounded by the screen (a
	 * halving at least as wide as its drawing holds at most four times its
	 * pixels), and drawing a frame on screen softer than the image element did
	 * to save memory would be a change anybody can see. The budget is for the
	 * copies kept once their frames leave the screen (`evict`).
	 */
	private request(wants: { job: Job; area: number }[]): void {
		// copies asked for earlier and no longer wanted give their place back
		const wanted = new Set(wants.map((want) => want.job.key));
		for (const [key, job] of this.asked) {
			if (job.sharp !== null && !wanted.has(key)) {
				this.cancel(key);
				if (this.sharps.get(key)?.texture === null) this.sharps.delete(key);
			}
		}
		for (const { job } of wants.sort((a, b) => b.area - a.area)) this.want(job.url, job.sharp, 0);
	}

	/**
	 * A load came back. A decode for a context that has since gone, or for a
	 * copy nobody wants any more, is let go; everything else waits for the
	 * next draw to upload it.
	 */
	private readonly onLoaded = (event: MessageEvent<LoaderReply>): void => {
		const reply = event.data;
		const job = this.asked.get(reply.key);
		const current = reply.generation === this.generation && job !== undefined;
		if (current) this.asked.delete(reply.key);
		if ("failed" in reply) {
			if (!current) return;
			const entry = job.sharp === null ? this.residents.get(job.url) : this.sharps.get(job.key);
			if (entry !== undefined) entry.state = "failed";
			return;
		}
		if (!current) {
			reply.bitmap.close();
			return;
		}
		if (job.sharp === null) {
			const entry = this.residents.get(job.url);
			if (entry !== undefined) entry.fetched = reply.fetchedAt - performance.timeOrigin;
		}
		this.landed.push({ job, bitmap: reply.bitmap, natural: reply.natural });
		this.wake();
	};

	/** Hand landed decodes to the GPU, within this frame's share of upload time and bytes. */
	private upload(gpu: Gpu): void {
		const { gl } = gpu;
		const start = performance.now();
		const budget = this.moving
			? { ms: UPLOAD_MS.moving, bytes: UPLOAD_BYTES.moving }
			: { ms: UPLOAD_MS.still, bytes: UPLOAD_BYTES.still };
		let bytes = 0;
		let squares = false;
		while (this.landed.length > 0) {
			if (bytes > 0 && (bytes >= budget.bytes || performance.now() - start >= budget.ms)) break;
			const item = this.landed.shift();
			if (item === undefined) break;
			const { job, bitmap, natural } = item;
			if (job.sharp === null) {
				const entry = this.residents.get(job.url);
				const slot = entry === undefined ? null : this.slot(gpu, job.url);
				if (entry !== undefined && slot !== null) {
					gl.bindTexture(gl.TEXTURE_2D_ARRAY, gpu.resident);
					gl.texSubImage3D(
						gl.TEXTURE_2D_ARRAY,
						0,
						0,
						0,
						slot,
						RESIDENT_PX,
						RESIDENT_PX,
						1,
						gl.RGBA,
						gl.UNSIGNED_BYTE,
						bitmap,
					);
					entry.slot = slot;
					entry.natural = natural;
					entry.state = "ready";
					entry.uploaded ??= performance.now();
					squares = true;
					bytes += RESIDENT_PX * RESIDENT_PX * 4;
				}
			} else {
				const entry = this.sharps.get(job.key);
				if (entry !== undefined && entry.texture === null) {
					const texture = gl.createTexture();
					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.texStorage2D(
						gl.TEXTURE_2D,
						levels(bitmap.width, bitmap.height),
						gl.RGBA8,
						bitmap.width,
						bitmap.height,
					);
					gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
					gl.generateMipmap(gl.TEXTURE_2D);
					filter(gl, gl.TEXTURE_2D, gpu.anisotropy);
					entry.texture = texture;
					entry.width = bitmap.width;
					entry.height = bitmap.height;
					entry.bytes = textureBytes(bitmap.width, bitmap.height, true);
					entry.state = "ready";
					bytes += bitmap.width * bitmap.height * 4;
					const resident = this.residents.get(job.url);
					if (resident !== undefined && resident.natural === null) resident.natural = natural;
				}
			}
			bitmap.close();
		}
		if (squares) {
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, gpu.resident);
			gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
		}
	}

	/**
	 * A layer of the resident array for this cover, growing the array when it
	 * is full. A page with more covers than the GPU allows layers (2048 on
	 * most) draws the rest as their surface until they come close enough to
	 * stream a sharper copy.
	 */
	private slot(gpu: Gpu, url: string): number | null {
		const held = this.residents.get(url)?.slot;
		if (held != null) return held;
		let free = this.slots.indexOf(null);
		if (free === -1 && gpu.capacity < gpu.maxLayers) {
			this.grow(gpu, Math.min(gpu.maxLayers, Math.max(16, Math.ceil(gpu.capacity * 1.5))));
			free = this.slots.indexOf(null);
		}
		if (free === -1) return null;
		this.slots[free] = url;
		return free;
	}

	/** Size the resident array to the page: room for every cover on it, with some to spare. */
	private sizeArray(): void {
		const gpu = this.gpu;
		if (gpu === null || this.lost) return;
		const wanted = new Set<string>();
		for (const frame of this.frames) if (frame.url !== undefined) wanted.add(frame.url);
		for (const stand of this.previous.values()) wanted.add(stand);
		const need = Math.min(gpu.maxLayers, roundUp(wanted.size + 8, 16));
		// grow to the page at once, rather than in steps as its covers land; and
		// give memory back when a page switch leaves most of the array empty
		if (need > gpu.capacity || (gpu.capacity > 64 && need * 4 < gpu.capacity)) this.grow(gpu, need);
	}

	/**
	 * A new resident array of `capacity` layers, the squares already uploaded
	 * copied across on the GPU and packed from the first layer.
	 */
	private grow(gpu: Gpu, capacity: number): void {
		const { gl } = gpu;
		const next = residentArray(gl, capacity, gpu.anisotropy);
		const keep = [...this.residents].filter(([, entry]) => entry.slot !== null);
		this.slots = new Array<string | null>(capacity).fill(null);
		if (keep.length > 0) {
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, gpu.copy);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, next);
			keep.forEach(([url, entry], index) => {
				if (entry.slot === null || index >= capacity) {
					entry.slot = null;
					entry.state = "waiting";
					return;
				}
				gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gpu.resident, 0, entry.slot);
				gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, index, 0, 0, RESIDENT_PX, RESIDENT_PX);
				entry.slot = index;
				this.slots[index] = url;
			});
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
			gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
		}
		gl.deleteTexture(gpu.resident);
		gpu.resident = next;
		gpu.capacity = capacity;
		// squares the smaller array could not keep load again
		for (const [url, entry] of this.residents) {
			if (entry.state === "waiting" && entry.slot === null && !this.asked.has(url)) {
				this.ask({ key: url, url, sharp: null, priority: 2 });
			}
		}
	}

	/**
	 * Let go of every picture no frame names any more, or only `url` when one
	 * is given: its square's layer goes back to the array, its sharper copies
	 * are deleted, and a load still queued for it is dropped.
	 */
	private forget(url?: string): void {
		const named = new Set<string>();
		for (const frame of this.frames) if (frame.url !== undefined) named.add(frame.url);
		for (const stand of this.previous.values()) named.add(stand);
		const gl = this.gpu?.gl;
		for (const [key, entry] of this.residents) {
			if (named.has(key) || (url !== undefined && key !== url)) continue;
			if (entry.slot !== null && this.slots[entry.slot] === key) this.slots[entry.slot] = null;
			this.residents.delete(key);
			this.cancel(key);
		}
		for (const [key, entry] of this.sharps) {
			if (named.has(entry.url) || (url !== undefined && entry.url !== url)) continue;
			if (entry.texture !== null) gl?.deleteTexture(entry.texture);
			this.sharps.delete(key);
			this.cancel(key);
		}
	}

	/** Sharper copies past the budget, least recently drawn first. */
	private evict(gpu: Gpu): void {
		const loaded: { key: string; bytes: number; used: number }[] = [];
		for (const [key, entry] of this.sharps)
			if (entry.texture !== null) loaded.push({ key, bytes: entry.bytes, used: entry.used });
		for (const key of evictions(loaded, sharpBudget(this.width, this.height), this.stamp)) {
			const entry = this.sharps.get(key);
			if (entry?.texture != null) gpu.gl.deleteTexture(entry.texture);
			this.sharps.delete(key);
		}
	}

	// --- the context -------------------------------------------------------------

	private open(): Gpu | null {
		const gl = this.canvas.getContext("webgl2", {
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
		if (gl === null || gl.isContextLost()) return null;
		const units = Math.min(SHARP_UNITS, (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number) - 1);
		const program = link(gl, VERTEX, fragment(units));
		const extension = gl.getExtension("EXT_texture_filter_anisotropic");
		const anisotropy =
			extension === null ? 1 : Math.min(8, gl.getParameter(extension.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number);
		// biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
		gl.useProgram(program);
		gl.uniform1i(gl.getUniformLocation(program, "u_resident"), 0);
		gl.uniform1iv(
			gl.getUniformLocation(program, "u_sharp"),
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
		this.slots = new Array<string | null>(16).fill(null);
		return {
			gl,
			program,
			vao,
			instances,
			view: gl.getUniformLocation(program, "u_view"),
			radius: gl.getUniformLocation(program, "u_radius"),
			surface: gl.getUniformLocation(program, "u_surface"),
			resident: residentArray(gl, 16, anisotropy),
			capacity: 16,
			maxLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) as number,
			maxSide: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
			units,
			anisotropy,
			blank,
			copy: gl.createFramebuffer(),
		};
	}

	/** Drop every texture and every decode in flight: they belong to a context that is gone. */
	private release(): void {
		this.generation += 1;
		this.asked.clear();
		this.loader?.postMessage({ kind: "reset" } satisfies LoaderAsk);
		for (const item of this.landed) item.bitmap.close();
		this.landed = [];
		const gl = this.lost ? null : (this.gpu?.gl ?? null);
		for (const entry of this.sharps.values()) if (entry.texture !== null) gl?.deleteTexture(entry.texture);
		if (gl !== null && this.gpu !== null) {
			gl.deleteTexture(this.gpu.resident);
			gl.deleteTexture(this.gpu.blank);
			gl.deleteProgram(this.gpu.program);
		}
		this.sharps.clear();
		this.residents.clear();
		this.slots = [];
		this.gpu = null;
	}

	/**
	 * The GPU took the context (a driver reset, a lid closed on a laptop
	 * switching GPUs). Nothing is drawn until it comes back, and nothing else
	 * notices: clicks land on frames by world position, never by what this
	 * canvas shows. Default prevented, or the browser never offers it back.
	 */
	private readonly onLost = (event: Event): void => {
		event.preventDefault();
		this.lost = true;
		this.release();
	};

	/** Back: every program and texture is made again, and every cover loads again from the HTTP cache. */
	private readonly onRestored = (): void => {
		this.lost = false;
		this.gpu = this.open();
		// whatever the page asked for while the context was gone was never loaded
		this.residents.clear();
		this.sharps.clear();
		this.setFrames(this.frames);
	};
}

interface Look {
	/** The cover drawn: the frame's own, or the one it replaced while its own loads. */
	url: string;
	natural: PixelSize | null;
	/** The picture's drawn size in device pixels. */
	picture: { w: number; h: number } | null;
	wanted: ReturnType<typeof textureFor> | null;
	/** Whether its resident square is uploaded. */
	resident: boolean;
	sharp: Sharp | null;
	/** The frame's own cover, when a stand-in is what is drawn or was just let go. */
	own?: Look;
	/** The frame's own cover is drawn as sharp as it wants, so its stand-in can go. */
	done?: boolean;
}

/** How well a look draws its frame: as wanted beats anything, then the sharper the better. */
function rank(look: Look): number {
	const { wanted, sharp, resident } = look;
	if (wanted !== null) {
		if (wanted.kind === "resident" ? resident : sharp !== null && sharp.width === wanted.width) {
			return Number.POSITIVE_INFINITY;
		}
	}
	if (sharp !== null) return 2 + sharp.width;
	return resident ? 1 : 0;
}

const sharpKey = (url: string, width: number): string => `${url}#${width}`;

const roundUp = (value: number, step: number): number => Math.max(step, Math.ceil(value / step) * step);

const levels = (width: number, height: number): number => Math.floor(Math.log2(Math.max(width, height))) + 1;

/** Trilinear, and anisotropic where the GPU offers it: a square drawn at its cover's shape is sampled unevenly. */
function filter(gl: WebGL2RenderingContext, target: number, anisotropy: number): void {
	gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
	gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	if (anisotropy > 1) gl.texParameterf(target, 0x84fe /* TEXTURE_MAX_ANISOTROPY_EXT */, anisotropy);
}

/**
 * A resident array of `capacity` layers, every level of every layer written
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
function residentArray(gl: WebGL2RenderingContext, capacity: number, anisotropy: number): WebGLTexture {
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
	gl.texStorage3D(gl.TEXTURE_2D_ARRAY, RESIDENT_LEVELS, gl.RGBA8, RESIDENT_PX, RESIDENT_PX, capacity);
	const zeros = gl.createBuffer();
	gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, zeros);
	gl.bufferData(gl.PIXEL_UNPACK_BUFFER, RESIDENT_PX * RESIDENT_PX * 4 * capacity, gl.STATIC_DRAW);
	// a buffer source refuses the page-side unpack conversions
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
	for (let level = 0, side = RESIDENT_PX; level < RESIDENT_LEVELS; level++, side = Math.max(1, side >> 1)) {
		gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, level, 0, 0, 0, side, side, capacity, gl.RGBA, gl.UNSIGNED_BYTE, 0);
	}
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
	gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
	gl.deleteBuffer(zeros);
	filter(gl, gl.TEXTURE_2D_ARRAY, anisotropy);
	return texture;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragmentSource: string): WebGLProgram {
	const program = gl.createProgram();
	for (const [type, source] of [
		[gl.VERTEX_SHADER, vertex],
		[gl.FRAGMENT_SHADER, fragmentSource],
	] as const) {
		const shader = gl.createShader(type);
		if (shader === null) throw new Error("could not create a shader");
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		gl.attachShader(program, shader);
	}
	gl.linkProgram(program);
	if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true && !gl.isContextLost()) {
		throw new Error(`picture layer: ${gl.getProgramInfoLog(program) ?? "the program did not link"}`);
	}
	return program;
}
