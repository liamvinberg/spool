import type { Camera } from "../api";
import { type Box, shellRadiusOnScreen } from "./camera";
import {
	closeGpu,
	contextOf,
	drawPictures,
	FLOATS,
	type Gpu,
	halvingTexture,
	mipSquares,
	openGpu,
	regrowSquares,
	uploadSquare,
} from "./picture-gl";
import type { Drawing } from "./picture-loader";
import { type Job, StillLoads } from "./picture-loads";
import {
	bindUnits,
	containSize,
	evictions,
	halvingKey,
	type PixelSize,
	Priority,
	SQUARE,
	SQUARE_PX,
	type Texture,
	textureBytes,
	textureFor,
	UPLOAD_BUDGET,
	uploadSpent,
} from "./picture-plan";

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
 * with no still, which keeps its placeholder shell.
 *
 * It draws only when told, with the camera it is told: the camera store's own
 * callback, the one that moves the DOM field, hands it each camera
 * (`picture-canvas.tsx`), so the pictures and everything over them land in the
 * same frame and can never be one apart. Between cameras it paints once more
 * only when a still lands while the camera rests, and then the camera last
 * delivered, which is the one the DOM is showing.
 *
 * Each still is kept on the GPU two ways (`picture-plan.ts`): its square,
 * which every frame on the page has, in one texture array, mipmapped there
 * and drawn back at the still's shape; and, for a frame drawn larger than the
 * square, the halving of the still its drawn size wants, streamed while it is
 * on screen and kept within a budget of a few screens once it leaves.
 *
 * Stills are immutable and content-addressed, so a changed still is a new
 * address: on screen the one it replaces is drawn until the new one lands, and
 * off screen the old one goes at once.
 */

/** One frame as the layer sees it: a world box, and the address of its still. */
export interface PictureFrame {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** The still's address, absent for a frame with none: its DOM placeholder draws it. */
	still: string | undefined;
}

/** What the layer drew for one frame, read back by tests and benches (`report`). */
export interface DrawnPicture {
	name: string;
	/** The still drawn: the frame's own, or the one it replaced while its own loads. */
	still: string;
	/** The frame on screen, in CSS pixels from the canvas's top left. */
	box: Box;
	/** The picture inside it in CSS pixels, contained at the top left; null before its still's size is known. */
	picture: { w: number; h: number } | null;
	/** The still's own pixel size. */
	natural: PixelSize | null;
	/** What was sampled, or nothing yet (the surface alone). */
	texture: Texture | null;
	/** What a frame drawn this size wants. */
	wanted: Texture | null;
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
	/** GPU bytes held by the square array and by halvings. */
	bytes: { squares: number; halvings: number };
	/** Loads still on their way: out with a loader, or decoded and waiting to upload. */
	pending: { out: number; landed: number };
	/** Every still with a texture on the GPU, its square or a halving. */
	held: string[];
	/**
	 * Every frame on the page with a still, on screen or not: its still, when
	 * the still's bytes arrived, and when the frame was first drawn with the
	 * texture its drawn size wants, on the page's clock. The picture layer's
	 * answer to "has every frame got its picture yet", on the same terms as an
	 * image element that has decoded.
	 */
	stills: { name: string; still: string; fetched: number | null; drawn: number | null }[];
}

/**
 * While the camera moves, a frame asks for a halving only once its square
 * would be stretched past fourfold, and every other frame asks when it comes
 * to rest. A zoom across an overview carries hundreds of frames just past the
 * square's size, and streaming a halving for each of them mid-gesture meant
 * creating, uploading and binding hundreds of textures while it ran: 30
 * frames over 12 ms in a thousand-frame overview zoom, against 8 with none
 * asked until rest. Past fourfold the square is too soft to show even in
 * motion, and a frame drawn that large shares the screen with few others, so
 * those halvings cost little.
 */
const MOVING_HALVING_PX = 4 * SQUARE_PX;

/**
 * The memory halvings may keep: two screens of device pixels, mips included,
 * and never less than 32 MB. What is on screen is always drawn from the
 * halving it wants (at least as wide as its drawing, so at most four screens
 * of pixels and usually much less); past that, halvings whose frames have
 * left the screen go, least recently drawn first. Bounded by the screen, not
 * the page: a frame long off screen keeps only its square.
 */
function halvingBudget(width: number, height: number): number {
	return Math.max(32 * 1024 * 1024, 2 * textureBytes(width, height, true));
}

/**
 * A still's square: out with a loader, in its layer of the array, or decoded
 * with no layer left to put it in (a page with more stills than the GPU allows
 * layers, 2048 on most), which draws its frame as the surface until the frame
 * is drawn large enough to want a halving.
 */
interface Square {
	layer: number | null;
	natural: PixelSize | null;
	state: "out" | "ready" | "spare" | "failed";
	/** When its bytes arrived, on the page's clock. */
	fetched?: number;
}

interface Halving {
	still: string;
	width: number;
	height: number;
	texture: WebGLTexture | null;
	state: "out" | "ready" | "failed";
	bytes: number;
	/** The draw that last sampled it, for least-recently-drawn eviction. */
	used: number;
}

export class PictureLayer {
	/** The canvas's context for its whole life, lost and restored in place; null without WebGL. */
	private readonly gl: WebGL2RenderingContext | null;
	private gpu: Gpu | null = null;
	private lost = false;
	private readonly loads: StillLoads;
	private frames: readonly PictureFrame[] = [];
	/** The still each changed frame drew before, drawn on screen until its new one lands. */
	private standIns = new Map<string, string>();
	/** How many frames and stand-ins name each still; a still nobody names is let go. */
	private uses = new Map<string, number>();
	private readonly claimed = new Set<string>();
	private readonly squares = new Map<string, Square>();
	/** Which still each layer of the square array holds. */
	private layers: (string | null)[] = [];
	private readonly halvings = new Map<string, Halving>();
	/** Frames the last draw had on screen, drawn or claimed. */
	private shown = new Set<string>();
	/** When each frame was first drawn with what its size wanted, and from which still. */
	private readonly done = new Map<string, { still: string; at: number }>();
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
	/** The one paint waiting for the next frame, for what landed while the camera rests (`wake`). */
	private next: number | null = null;
	private settle = false;
	private disposed = false;

	constructor(private readonly canvas: HTMLCanvasElement) {
		canvas.addEventListener("webglcontextlost", this.onLost);
		canvas.addEventListener("webglcontextrestored", this.onRestored);
		this.loads = new StillLoads({ landed: () => this.wake(), gone: (job, failed) => this.onGone(job, failed) });
		this.gl = contextOf(canvas);
		// no WebGL at all, nothing to load for: a canvas without it draws no pictures
		if (this.gl === null) return;
		this.loads.start();
		// a context already lost is one that comes back (`onRestored`)
		if (this.gl.isContextLost()) this.lost = true;
		else this.open(this.gl);
	}

	/** The frames on this page, in drawing order: a later frame draws over an earlier one. */
	setFrames(frames: readonly PictureFrame[]): void {
		const before = new Map(this.frames.map((frame) => [frame.name, frame.still]));
		const standIns = new Map<string, string>();
		for (const frame of frames) {
			if (frame.still === undefined || !this.shown.has(frame.name)) continue;
			const was = before.get(frame.name);
			const held = this.standIns.get(frame.name);
			// A changed still stands in for itself on screen until the new one
			// lands, if it got as far as a texture; of two changes in a row the
			// older stand-in stays when the one between them never did.
			const replaced = was !== undefined && was !== frame.still && this.drawable(was) ? was : held;
			if (replaced !== undefined && replaced !== frame.still && this.drawable(replaced)) {
				standIns.set(frame.name, replaced);
			}
		}
		this.frames = frames;
		this.standIns = standIns;
		const uses = new Map<string, number>();
		const name = (still: string) => uses.set(still, (uses.get(still) ?? 0) + 1);
		for (const frame of frames) if (frame.still !== undefined) name(frame.still);
		for (const still of standIns.values()) name(still);
		this.uses = uses;
		for (const still of this.squares.keys()) if (!uses.has(still)) this.release(still);
		for (const halving of this.halvings.values()) if (!uses.has(halving.still)) this.release(halving.still);
		for (const frame of frames) if (frame.still !== undefined) this.want(frame.still, null, Priority.page);
		this.sizeArray();
		this.refresh();
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

	/** Whether a frame's document is booting, which the rest of the page's stills wait out (`StillLoads`). */
	setBooting(booting: boolean): void {
		this.loads.setBooting(booting);
	}

	/** The surface a frame stands on before and around its picture, as the shell's `bg-surface`. */
	setSurface(rgba: readonly [number, number, number, number]): void {
		if (rgba.every((value, i) => value === this.surface[i])) return;
		this.surface = rgba;
		this.refresh();
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
		const stopped = this.moving && !moving;
		this.moving = moving;
		// the store says so once more when a camera comes to rest, and that
		// camera is already on screen: drawn again only to ask for the halvings
		// a moving camera held back (`MOVING_HALVING_PX`), since everything else
		// that changes the picture asks for its own draw
		if (camera === this.camera && this.draws > 0 && !stopped) return;
		this.camera = camera;
		this.render();
	}

	/**
	 * Let go of everything: the loaders, every texture and buffer, and the
	 * context itself, lost on purpose so the browser can reclaim it now rather
	 * than at some later collection. A canvas is made per project tab, and
	 * Chrome keeps only so many contexts before it loses the oldest itself.
	 */
	dispose(): void {
		this.disposed = true;
		if (this.next !== null) cancelAnimationFrame(this.next);
		this.next = null;
		this.canvas.removeEventListener("webglcontextlost", this.onLost);
		this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
		this.loads.dispose();
		this.close();
		this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
	}

	/** What the last draw put on screen, worked out again from the state it drew. */
	report(): PictureReport {
		const drawn: DrawnPicture[] = [];
		const camera = this.camera;
		let complete = true;
		if (camera !== null) {
			this.walk(camera, (frame, box, look) => {
				const css = (value: number) => value / this.scale;
				const texture = textureOf(look);
				if (texture === null || look.wanted === null || !same(texture, look.wanted) || look.still !== frame.still) {
					complete = false;
				}
				drawn.push({
					name: frame.name,
					still: look.still,
					box: { x: css(box.x), y: css(box.y), w: css(box.w), h: css(box.h) },
					picture: look.picture === null ? null : { w: css(look.picture.w), h: css(look.picture.h) },
					natural: look.natural,
					texture,
					wanted: look.wanted,
				});
			});
		}
		let halvings = 0;
		const held = new Set<string>();
		for (const halving of this.halvings.values()) {
			if (halving.texture === null) continue;
			halvings += halving.bytes;
			held.add(halving.still);
		}
		for (const [still, square] of this.squares) if (square.state === "ready") held.add(still);
		return {
			camera,
			scale: this.scale,
			drawn,
			claimed: [...this.claimed],
			complete: complete && !this.lost && this.gpu !== null,
			lost: this.lost || this.gpu === null,
			draws: this.draws,
			bytes: {
				squares: this.gpu === null ? 0 : this.gpu.capacity * textureBytes(SQUARE_PX, SQUARE_PX, true),
				halvings,
			},
			pending: this.loads.pending,
			held: [...held],
			stills: this.frames.flatMap((frame) => {
				if (frame.still === undefined) return [];
				const done = this.done.get(frame.name);
				return [
					{
						name: frame.name,
						still: frame.still,
						fetched: this.squares.get(frame.still)?.fetched ?? null,
						drawn: done?.still === frame.still ? done.at : null,
					},
				];
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
		visit: (frame: PictureFrame & { still: string }, box: Box, look: Look) => void,
		claimed?: (frame: PictureFrame & { still: string }, box: Box, look: Look) => void,
	): void {
		const { k } = camera;
		const s = this.scale;
		for (const frame of this.frames) {
			if (frame.still === undefined) continue;
			const box = {
				x: (frame.x * k + camera.x) * s,
				y: (frame.y * k + camera.y) * s,
				w: frame.w * k * s,
				h: frame.h * k * s,
			};
			if (box.x > this.width + 1 || box.y > this.height + 1 || box.x + box.w < -1 || box.y + box.h < -1) continue;
			const pictured = frame as PictureFrame & { still: string };
			const look = this.look(pictured, box);
			if (this.claimed.has(frame.name)) claimed?.(pictured, box, look);
			else visit(pictured, box, look);
		}
	}

	/**
	 * What one frame on screen is drawn from, and what it would want. A frame
	 * whose still just changed keeps drawing the one it replaced for as long as
	 * that one is the better of the two at this size, so a new still never
	 * shows as a blur or a blank on its way in.
	 */
	private look(frame: PictureFrame & { still: string }, box: Box): Look {
		const own = this.lookAt(frame.still, box);
		const stand = this.standIns.get(frame.name);
		if (stand === undefined) return own;
		const old = this.lookAt(stand, box);
		return rank(old) > rank(own) ? { ...old, own } : { ...own, own, done: rank(own) === Number.POSITIVE_INFINITY };
	}

	private lookAt(still: string, box: Box): Look {
		const square = this.squares.get(still);
		const natural = square?.natural ?? null;
		if (natural === null) return { still, natural, picture: null, wanted: null, square: false, halving: null };
		const picture = containSize(box.w, box.h, natural);
		const wanted = textureFor(picture, natural, this.gpu?.maxSide ?? 4096);
		const ready = square?.state === "ready";
		let halving: Halving | null = null;
		if (wanted.kind === "halving") {
			const exact = this.halvings.get(halvingKey(still, wanted.width));
			if (exact?.texture != null) halving = exact;
		}
		// the next best thing on hand: any halving beats the square once one is
		// wanted, and a square that is not there yet loses to anything. An
		// overview has every square it wants, so this walk is for close-ups only.
		if (halving === null && (wanted.kind === "halving" || !ready)) {
			for (const entry of this.halvings.values()) {
				if (entry.still !== still || entry.texture === null) continue;
				if (halving === null || entry.width > halving.width) halving = entry;
			}
		}
		return { still, natural, picture, wanted, square: ready, halving };
	}

	private render(): void {
		if (this.next !== null) cancelAnimationFrame(this.next);
		this.next = null;
		this.paint();
		// everything asked of the loaders since the last draw goes out together,
		// a page's squares and which of them are on screen in one message
		this.loads.send();
	}

	private paint(): void {
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
		const shown = new Set<string>();
		const note = (frame: PictureFrame & { still: string }, box: Box, look: Look, priority: Priority) => {
			shown.add(frame.name);
			if (look.halving !== null) look.halving.used = this.stamp;
			if (look.done === true) this.dropStandIn(frame.name);
			// what to load is the frame's own still's business, whatever stands in for it
			const own = look.own ?? look;
			const wanted = own.wanted;
			const asks = !this.moving || Math.max(box.w, box.h) > MOVING_HALVING_PX;
			if (asks && wanted?.kind === "halving" && own.halving?.width !== wanted.width) {
				wants.push({
					job: { key: halvingKey(own.still, wanted.width), still: own.still, halving: wanted, priority },
					area: wanted.width * wanted.height,
				});
			}
			// A square on screen jumps the queue of the page's other squares when
			// it is what the frame wants, or when its still's size is not known
			// yet: then it takes the frame's drawn size along, and the halving that
			// size wants comes out of the same decode rather than a second load
			// asked for once the square has said how large the still is.
			const square = this.loads.job(own.still);
			if (square !== undefined && (own.natural === null || wanted?.kind === "square")) {
				const drawing: Drawing | undefined =
					own.natural === null && asks ? { w: box.w, h: box.h, maxSide: gpu.maxSide } : undefined;
				this.loads.raise(square, priority, drawing);
			}
		};
		let count = 0;
		this.walk(
			camera,
			(frame, box, look) => {
				note(frame, box, look, Priority.drawn);
				if (look.still === frame.still && rank(look) === Number.POSITIVE_INFINITY) {
					if (this.done.get(frame.name)?.still !== frame.still) {
						this.done.set(frame.name, { still: frame.still, at: performance.now() });
					}
				}
				if (this.instances.length < (count + 1) * FLOATS) {
					const grown = new Float32Array(Math.max(64, (count + 1) * 2) * FLOATS);
					grown.set(this.instances);
					this.instances = grown;
				}
				const base = count * FLOATS;
				const data = this.instances;
				data[base] = box.x;
				data[base + 1] = box.y;
				data[base + 2] = box.w;
				data[base + 3] = box.h;
				data[base + 4] = look.picture?.w ?? 0;
				data[base + 5] = look.picture?.h ?? 0;
				data[base + 6] = look.square ? (this.squares.get(look.still)?.layer ?? 0) : 0;
				textures.push(look.halving?.texture ?? null);
				none.push(look.halving === null && !look.square);
				count += 1;
			},
			// a frame its shell is drawing still keeps its halving warm, so the
			// moment it hands back its picture is already as sharp as it was
			(frame, box, look) => note(frame, box, look, Priority.shell),
		);
		this.shown = shown;
		// off screen, a changed frame's old still goes at once
		for (const name of this.standIns.keys()) if (!shown.has(name)) this.dropStandIn(name);
		this.request(wants);

		if (count > 0) {
			const { unit, draws } = bindUnits(textures, gpu.units);
			for (let i = 0; i < count; i++) this.instances[i * FLOATS + 7] = none[i] ? -1 : (unit[i] ?? 0);
			drawPictures(
				gpu,
				{
					width: this.width,
					height: this.height,
					radius: shellRadiusOnScreen(camera.k) * this.scale,
					surface: this.surface,
				},
				this.instances.subarray(0, count * FLOATS),
				draws,
			);
		}
		this.evict(gpu);
		if (this.loads.pending.landed > 0) this.wake();
	}

	/**
	 * Draw again before the next paint: a shell's claim, whose own change shows
	 * in that paint, so the frame is never drawn twice or not at all.
	 */
	private invalidate(): void {
		if (this.settle) return;
		this.settle = true;
		queueMicrotask(() => {
			this.settle = false;
			this.render();
		});
	}

	/**
	 * Draw a change the next paint can carry: a new frame list, a new surface.
	 * At rest that is now. While the camera moves it is the camera's own next
	 * paint, or the one it makes coming to rest, so a frame of motion stays one
	 * paint however much changes during it.
	 */
	private refresh(): void {
		if (!this.moving) this.invalidate();
	}

	/**
	 * Paint once more at the next frame, for what landed while the camera
	 * rests: one paint waiting at most, and any paint before it makes it moot
	 * (`render`). A moving camera paints every frame it moves, and uploads as
	 * it does.
	 */
	private wake(): void {
		if (this.moving || this.next !== null || this.disposed) return;
		this.next = requestAnimationFrame(() => {
			this.next = null;
			this.render();
		});
	}

	// --- textures --------------------------------------------------------------

	/** Ask for a still's square, or one of its halvings, unless that is already out or held. */
	private want(still: string, halving: PixelSize | null, priority: Priority): void {
		if (halving === null) {
			if (this.squares.has(still)) return;
			this.squares.set(still, { layer: null, natural: null, state: "out" });
			this.ask({ key: still, still, halving: null, priority });
			return;
		}
		const key = halvingKey(still, halving.width);
		if (this.halvings.has(key)) return;
		this.halvings.set(key, {
			still,
			width: halving.width,
			height: halving.height,
			texture: null,
			state: "out",
			bytes: textureBytes(halving.width, halving.height, true),
			used: this.stamp,
		});
		this.ask({ key, still, halving, priority });
	}

	/** Nothing loads without a context to upload to; a restored one asks for everything again. */
	private ask(job: Job): void {
		if (this.gpu === null || this.lost) return;
		this.loads.ask(job);
	}

	/**
	 * The halvings this draw asked for, largest on screen first. Every one is
	 * asked for: what the screen shows is bounded by the screen (a halving at
	 * least as wide as its drawing holds at most four times its pixels), and
	 * drawing a frame on screen softer than the image element did to save
	 * memory would be a change anybody can see. The budget is for the halvings
	 * kept once their frames leave the screen (`evict`).
	 */
	private request(wants: { job: Job; area: number }[]): void {
		// halvings asked for earlier and no longer wanted give their place back;
		// one already being decoded lands all the same
		const wanted = new Set(wants.map((want) => want.job.key));
		for (const [key, halving] of this.halvings) {
			if (halving.state === "out" && !wanted.has(key)) this.loads.cancel(key);
		}
		for (const { job } of wants.sort((a, b) => a.job.priority - b.job.priority || b.area - a.area)) {
			this.want(job.still, job.halving, job.priority);
		}
	}

	/** A load failed, or was taken back before it started. */
	private onGone(job: Job, failed: boolean): void {
		if (job.halving === null) {
			const square = this.squares.get(job.still);
			if (square?.state !== "out") return;
			if (failed) square.state = "failed";
			else this.squares.delete(job.still);
			return;
		}
		const halving = this.halvings.get(job.key);
		if (halving?.state !== "out") return;
		if (failed) halving.state = "failed";
		else this.halvings.delete(job.key);
	}

	/** Hand landed decodes to the GPU, within this frame's share of upload time and bytes (`UPLOAD_BUDGET`). */
	private upload(gpu: Gpu): void {
		const budget = this.moving ? UPLOAD_BUDGET.moving : UPLOAD_BUDGET.resting;
		const start = performance.now();
		let bytes = 0;
		let squares = false;
		while (!uploadSpent({ ms: performance.now() - start, bytes }, budget)) {
			const item = this.loads.take();
			if (item === undefined) break;
			const { job, bitmap, natural } = item;
			if (job.halving === null) {
				const square = this.squares.get(job.still);
				if (square !== undefined && square.state !== "ready") {
					square.natural = natural;
					square.fetched ??= item.fetched;
					const layer = this.layerFor(gpu, job.still);
					if (layer === null) square.state = "spare";
					else {
						uploadSquare(gpu, layer, bitmap);
						square.layer = layer;
						square.state = "ready";
						squares = true;
						bytes += SQUARE_PX * SQUARE_PX * 4;
					}
				}
			} else {
				let halving = this.halvings.get(job.key);
				// a halving made beside a square, for the size its frame was drawn,
				// kept while its still is on the page
				if (halving === undefined && item.derived && this.uses.has(job.still)) {
					halving = {
						still: job.still,
						width: job.halving.width,
						height: job.halving.height,
						texture: null,
						state: "out",
						bytes: 0,
						used: this.stamp,
					};
					this.halvings.set(job.key, halving);
				}
				if (halving !== undefined && halving.texture === null) {
					halving.texture = halvingTexture(gpu, bitmap);
					halving.width = bitmap.width;
					halving.height = bitmap.height;
					halving.bytes = textureBytes(bitmap.width, bitmap.height, true);
					halving.state = "ready";
					bytes += bitmap.width * bitmap.height * 4;
					const square = this.squares.get(job.still);
					if (square !== undefined && square.natural === null) square.natural = natural;
					// a load asked for the same halving meanwhile has nothing left to do
					if (item.derived) this.loads.cancel(job.key);
				}
			}
			bitmap.close();
		}
		if (squares) mipSquares(gpu);
	}

	/** A layer of the square array for this still, growing the array when it is full and the GPU allows. */
	private layerFor(gpu: Gpu, still: string): number | null {
		const held = this.squares.get(still)?.layer;
		if (held != null) return held;
		let free = this.layers.indexOf(null);
		if (free === -1 && gpu.capacity < gpu.maxLayers) {
			this.regrow(gpu, Math.min(gpu.maxLayers, Math.max(16, Math.ceil(gpu.capacity * 1.5))));
			free = this.layers.indexOf(null);
		}
		if (free === -1) return null;
		this.layers[free] = still;
		return free;
	}

	/** Size the square array to the page: room for every still on it, with some to spare. */
	private sizeArray(): void {
		const gpu = this.gpu;
		if (gpu === null || this.lost) return;
		const need = Math.min(gpu.maxLayers, roundUp(this.uses.size + 8, 16));
		// grow to the page at once, rather than in steps as its stills land; and
		// give memory back when a page switch leaves most of the array empty
		if (need > gpu.capacity || (gpu.capacity > 64 && need * 4 < gpu.capacity)) this.regrow(gpu, need);
	}

	/**
	 * A square array of `capacity` layers, the squares already in one copied
	 * across on the GPU and packed from the first layer. A square a smaller
	 * array has no room for is asked for again.
	 */
	private regrow(gpu: Gpu, capacity: number): void {
		const keep: number[] = [];
		const layers = new Array<string | null>(capacity).fill(null);
		const lost: string[] = [];
		for (const [still, square] of this.squares) {
			if (square.layer === null) continue;
			if (keep.length < capacity) {
				layers[keep.length] = still;
				keep.push(square.layer);
				square.layer = keep.length - 1;
			} else {
				square.layer = null;
				square.state = "out";
				lost.push(still);
			}
		}
		regrowSquares(gpu, capacity, keep);
		this.layers = layers;
		for (const still of lost) this.ask({ key: still, still, halving: null, priority: Priority.page });
	}

	/** Whether a still has anything on the GPU to draw a frame with. */
	private drawable(still: string): boolean {
		if (this.squares.get(still)?.state === "ready") return true;
		for (const halving of this.halvings.values())
			if (halving.still === still && halving.texture !== null) return true;
		return false;
	}

	/** A frame's stand-in is done with: its still goes once nothing else names it. */
	private dropStandIn(name: string): void {
		const still = this.standIns.get(name);
		if (still === undefined) return;
		this.standIns.delete(name);
		const left = (this.uses.get(still) ?? 1) - 1;
		if (left > 0) this.uses.set(still, left);
		else {
			this.uses.delete(still);
			this.release(still);
		}
	}

	/** Let go of one still: its square's layer goes back to the array, its halvings are deleted, its loads taken back. */
	private release(still: string): void {
		const square = this.squares.get(still);
		if (square !== undefined) {
			if (square.layer !== null && this.layers[square.layer] === still) this.layers[square.layer] = null;
			this.squares.delete(still);
			this.loads.cancel(still);
		}
		const gl = this.gpu?.gl;
		for (const [key, halving] of this.halvings) {
			if (halving.still !== still) continue;
			if (halving.texture !== null) gl?.deleteTexture(halving.texture);
			this.halvings.delete(key);
			this.loads.cancel(key);
		}
	}

	/** Halvings past the budget, least recently drawn first. */
	private evict(gpu: Gpu): void {
		const loaded: { key: string; bytes: number; used: number }[] = [];
		for (const [key, halving] of this.halvings) {
			if (halving.texture !== null) loaded.push({ key, bytes: halving.bytes, used: halving.used });
		}
		for (const key of evictions(loaded, halvingBudget(this.width, this.height), this.stamp)) {
			const halving = this.halvings.get(key);
			if (halving?.texture != null) gpu.gl.deleteTexture(halving.texture);
			this.halvings.delete(key);
		}
	}

	// --- the context -------------------------------------------------------------

	private open(gl: WebGL2RenderingContext): void {
		this.gpu = openGpu(gl);
		this.layers = new Array<string | null>(this.gpu.capacity).fill(null);
	}

	/** Every texture and GL object let go, and every still forgotten. */
	private close(): void {
		const gpu = this.gpu;
		if (gpu !== null && !this.lost) {
			for (const halving of this.halvings.values())
				if (halving.texture !== null) gpu.gl.deleteTexture(halving.texture);
			closeGpu(gpu);
		}
		this.gpu = null;
		this.squares.clear();
		this.halvings.clear();
		this.layers = [];
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
		this.loads.reset();
		this.close();
	};

	/** Back: every program and texture is made again, and every still loads again from the HTTP cache. */
	private readonly onRestored = (): void => {
		if (this.gl === null) return;
		this.lost = false;
		this.open(this.gl);
		// what was wanted while the context was gone, from the very start
		// included, was never asked for
		this.squares.clear();
		this.halvings.clear();
		this.setFrames(this.frames);
	};
}

interface Look {
	/** The still drawn: the frame's own, or the one it replaced while its own loads. */
	still: string;
	natural: PixelSize | null;
	/** The picture's drawn size in device pixels. */
	picture: { w: number; h: number } | null;
	wanted: Texture | null;
	/** Whether its square is in the array. */
	square: boolean;
	halving: Halving | null;
	/** The frame's own still, when a stand-in is what is drawn or was just let go. */
	own?: Look;
	/** The frame's own still is drawn the way its size wants, so its stand-in can go. */
	done?: boolean;
}

/** What a look samples, in the report's terms. */
function textureOf(look: Look): Texture | null {
	if (look.halving !== null) return { kind: "halving", width: look.halving.width, height: look.halving.height };
	return look.square ? SQUARE : null;
}

const same = (a: Texture, b: Texture): boolean => a.kind === b.kind && a.width === b.width && a.height === b.height;

/** How well a look draws its frame: as wanted beats anything, then the larger halving, then the square. */
function rank(look: Look): number {
	const texture = textureOf(look);
	if (texture !== null && look.wanted !== null && same(texture, look.wanted)) return Number.POSITIVE_INFINITY;
	if (look.halving !== null) return 2 + look.halving.width;
	return look.square ? 1 : 0;
}

const roundUp = (value: number, step: number): number => Math.max(step, Math.ceil(value / step) * step);
