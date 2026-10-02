import { containSize, halvingKey, halvingSteps, type PixelSize, Priority, SQUARE, textureFor } from "./picture-plan";

/**
 * The picture layer's loader, in a worker of its own (#81): fetch a still,
 * decode it, shrink it to the textures the layer asked for, and hand the
 * bitmaps over. The layer runs a few of these side by side
 * (`picture-loads.ts`), each still always going to the same one.
 *
 * Off the page's thread because the page's thread is busy exactly when the
 * most stills are wanted: opening a page mounts a label per frame, most of a
 * second on a thousand-frame page, and a loader living there could start no
 * decode and hand the network no next request until that was over. Here the
 * whole page is asked for at once, on-screen frames first, and the network
 * and Chrome's image threads work through the mount; the page only uploads
 * what has landed.
 *
 * **One fetch and one decode per still.** Every texture asked of a still that
 * is still waiting is made from the same decode, largest first. A frame on
 * screen whose still the layer has not seen yet sends its drawn size along
 * with the ask for its square, and the halving that size wants comes out of
 * the same pass, so it is not a second load the layer could only ask for once
 * the square had told it how large the still is.
 *
 * **Shrunk in halvings.** A bitmap shrunk by `createImageBitmap(blob, {
 * resizeQuality: "high" })` is resampled on this worker's own thread, about
 * 2.5 ms for a still of 800 x 533, and that thread was the whole cost of a
 * reload: on a page of 200 frames it was busy without a break while the
 * screen's stills waited their turn behind it. The decode itself runs on
 * Chrome's image threads and costs a fifth of that. Shrunk linearly instead,
 * a step costs a fraction of the resample, but across a large ratio a linear
 * filter skips pixels and aliases; halving at most twofold a step
 * (`halvingSteps`), each step averages every pixel it covers, the box filter
 * a mip chain is built with. The screen's 49 stills of that page, square and
 * halving each, took the loader's thread 120 to 140 ms this way against 270 to
 * 410 resampled. The bitmaps stay in this process's memory, so the page's
 * upload is a copy: a video frame shrinks faster still, but on the GPU, and
 * uploading what it gives back cost the page's thread five times as much.
 */

/** What the layer asks of the loader. */
export type LoaderAsk =
	| {
			kind: "load";
			key: string;
			/** The still's address as the layer names it, the one key every texture of it is filed under. */
			still: string;
			/** The same address made absolute: a worker resolves relative ones against its own script. */
			href: string;
			/** The square, or a halving of this size. */
			size: "square" | PixelSize;
			priority: Priority;
			generation: number;
			/** For a square: the size its frame is drawn on screen, so the halving that wants comes too. */
			drawing?: Drawing;
	  }
	| { kind: "priority"; key: string; priority: Priority; drawing?: Drawing }
	/** Take back a load not started yet, answered `dropped`; one already started lands as usual. */
	| { kind: "cancel"; key: string }
	/** Whether anything but what the screen wants may load now (`picture-loads.ts`'s `setBooting`). */
	| { kind: "background"; open: boolean }
	/** Forget every asked-for load: the context they were for is gone. */
	| { kind: "reset" };

/** A frame on screen in device pixels, and the largest texture the GPU takes. */
export interface Drawing {
	w: number;
	h: number;
	maxSide: number;
}

/**
 * What the loader hands back, one per load it was asked for, and one for a
 * halving it made unasked from a square's drawing (`size` set, keyed by
 * `halvingKey`).
 */
export type LoaderReply =
	| {
			key: string;
			generation: number;
			bitmap: ImageBitmap;
			natural: PixelSize;
			/** When the bytes arrived, as epoch milliseconds so the page can put it on its own clock. */
			fetchedAt: number;
			/** The size of a halving nobody asked for by its key. */
			size?: PixelSize;
	  }
	| { key: string; generation: number; failed: true }
	| { key: string; generation: number; dropped: true };

/**
 * Stills fetched at once, and fetched or decoded at once, per loader. The
 * browser opens six connections to one host whatever the loaders ask, and
 * decodes beyond the cores only queue.
 */
const FETCHES = 6;
const LOADS = 12;

/**
 * Stills at once for frames off screen (`Priority.page`), per loader, and only
 * when nothing the screen wants is loading here and the layer lets them load
 * at all (`open`). Those squares are for later, so they trickle in behind
 * what the screen is waiting for: the network, the daemon serving the
 * frames' own documents and the cores are shared with everything the page
 * does next. Let run beside the screen's stills, a reload of a 200-frame page
 * decoded 45 squares off screen before the last one on it.
 */
const BACKGROUND = 1;
let open = true;

type Load = Extract<LoaderAsk, { kind: "load" }>;

const queue = new Map<string, Load>();
let fetching = 0;
let decoding = 0;
let background = 0;
let urgent = 0;

const post = (reply: LoaderReply, transfer: Transferable[] = []) => self.postMessage(reply, { transfer });

// Asks come in batches, everything one draw asked: applied together, so the
// queue knows which squares are on screen before it starts any.
self.onmessage = (event: MessageEvent<LoaderAsk[]>) => {
	for (const ask of event.data) {
		if (ask.kind === "load") queue.set(ask.key, ask);
		else if (ask.kind === "priority") {
			const queued = queue.get(ask.key);
			if (queued !== undefined) {
				queued.priority = ask.priority;
				if (ask.drawing !== undefined) queued.drawing = ask.drawing;
			}
		} else if (ask.kind === "cancel") {
			const queued = queue.get(ask.key);
			if (queued !== undefined) {
				queue.delete(ask.key);
				post({ key: ask.key, generation: queued.generation, dropped: true });
			}
		} else if (ask.kind === "background") open = ask.open;
		else queue.clear();
	}
	pump();
};

function pump(): void {
	while (fetching < FETCHES && fetching + decoding < LOADS && queue.size > 0) {
		let best: Load | null = null;
		for (const load of queue.values()) if (best === null || load.priority < best.priority) best = load;
		if (best === null) return;
		const later = best.priority >= Priority.page;
		if (later && (!open || urgent > 0 || background >= BACKGROUND)) return;
		// everything else asked of the same still rides along on its decode
		const group: Load[] = [];
		for (const load of queue.values()) if (load.still === best.still) group.push(load);
		for (const load of group) queue.delete(load.key);
		void run(group, later);
	}
}

async function run(group: Load[], later: boolean): Promise<void> {
	if (later) background += 1;
	else urgent += 1;
	try {
		await fetchAndDecode(group);
	} finally {
		if (later) background -= 1;
		else urgent -= 1;
		pump();
	}
}

const fail = (group: readonly Load[]) => {
	for (const load of group) post({ key: load.key, generation: load.generation, failed: true });
};

async function fetchAndDecode(group: Load[]): Promise<void> {
	const first = group[0];
	if (first === undefined) return;
	fetching += 1;
	let blob: Blob;
	try {
		const wanted = group.some((load) => load.priority < Priority.page);
		const response = await fetch(first.href, { priority: wanted ? "high" : "low" });
		if (!response.ok) throw new Error(`still ${response.status}`);
		blob = await response.blob();
	} catch {
		fail(group);
		return;
	} finally {
		fetching -= 1;
		pump();
	}
	const fetchedAt = performance.timeOrigin + performance.now();
	decoding += 1;
	try {
		const made = await shrink(blob, group);
		for (const { output, bitmap, natural } of made) {
			post(
				{
					key: output.key,
					generation: first.generation,
					bitmap,
					natural,
					fetchedAt,
					...(output.derived ? { size: output.size } : {}),
				},
				[bitmap],
			);
		}
	} catch {
		fail(group);
	} finally {
		decoding -= 1;
		pump();
	}
}

interface Output {
	key: string;
	size: PixelSize;
	/** Made from a square's drawing rather than asked for by key. */
	derived: boolean;
}

/**
 * The bitmaps to make of one still, largest first: every load in the group,
 * and the halving a square's drawing wants when no load asked for it.
 */
function plan(group: readonly Load[], natural: PixelSize): Output[] {
	const outputs: Output[] = group.map((load) => ({
		key: load.key,
		size: load.size === "square" ? SQUARE : load.size,
		derived: false,
	}));
	for (const load of group) {
		if (load.drawing === undefined) continue;
		const wanted = textureFor(containSize(load.drawing.w, load.drawing.h, natural), natural, load.drawing.maxSide);
		if (wanted.kind !== "halving") continue;
		const key = halvingKey(load.still, wanted.width);
		if (outputs.some((output) => output.key === key)) continue;
		outputs.push({ key, size: { width: wanted.width, height: wanted.height }, derived: true });
	}
	return outputs.sort((a, b) => b.size.width * b.size.height - a.size.width * a.size.height);
}

interface Made {
	output: Output;
	bitmap: ImageBitmap;
	natural: PixelSize;
}

/**
 * Every output of one still from one decode, largest first. Each starts from
 * the smallest bitmap already made that covers it on both sides, so a square
 * squeezed from a wide still never grows back out of a halving shrunk for its
 * width, and is walked down from there in halvings.
 */
async function shrink(blob: Blob, group: readonly Load[]): Promise<Made[]> {
	const decoded = await createImageBitmap(blob, { premultiplyAlpha: "premultiply" });
	const natural = { width: decoded.width, height: decoded.height };
	const made: Made[] = [];
	const chain = [decoded];
	try {
		for (const output of plan(group, natural)) {
			const { size } = output;
			let current = decoded;
			for (const bitmap of chain) {
				const covers = bitmap.width >= size.width && bitmap.height >= size.height;
				if (covers && bitmap.width * bitmap.height < current.width * current.height) current = bitmap;
			}
			for (const step of halvingSteps(current, size)) {
				current = await createImageBitmap(current, {
					resizeWidth: step.width,
					resizeHeight: step.height,
					resizeQuality: "low",
				});
				chain.push(current);
			}
			// a bitmap handed over is gone from here, so one wanted twice is copied
			const bitmap = made.some((each) => each.bitmap === current) ? await createImageBitmap(current) : current;
			made.push({ output, bitmap, natural });
		}
	} catch (error) {
		for (const { bitmap } of made) bitmap.close();
		throw error;
	} finally {
		for (const bitmap of chain) if (!made.some((each) => each.bitmap === bitmap)) bitmap.close();
	}
	return made;
}
