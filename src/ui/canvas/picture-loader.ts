import { containSize, halvings, type PixelSize, RESIDENT_PX, sharpKey, textureFor } from "./picture-plan";

/**
 * The picture layer's loader, in a worker of its own (#81): fetch a cover,
 * decode it, shrink it to the sizes the layer asked for, and hand the bitmaps
 * over. The layer runs a few of these side by side (`picture-layer.ts`), each
 * cover always going to the same one.
 *
 * Off the page's thread because the page's thread is busy exactly when the
 * most covers are wanted: opening a page mounts a label per frame, most of a
 * second on a thousand-frame page, and a loader living there could start no
 * decode and hand the network no next request until that was over. Here the
 * whole page is asked for at once, on-screen frames first, and the network
 * and Chrome's image threads work through the mount; the page only uploads
 * what has landed.
 *
 * **One fetch and one decode per cover.** Every size asked of a cover that is
 * still waiting is made from the same decode, largest first. A frame on
 * screen whose cover the layer has not seen yet sends its box along with the
 * ask for its square, and the sharper copy that box wants comes out of the
 * same pass, so it is not a second load the layer could only ask for once the
 * square had told it the cover's size.
 *
 * **Shrunk in halvings.** A bitmap shrunk by `createImageBitmap(blob, {
 * resizeQuality: "high" })` is resampled on this worker's own thread, about
 * 2.5 ms for a cover of 800 x 533, and that thread was the whole cost of a
 * reload: on a page of 200 frames it was busy without a break while the
 * screen's covers waited their turn behind it. The decode itself runs on
 * Chrome's image threads and costs a fifth of that. Shrunk linearly instead,
 * a step costs a fraction of the resample, but across a large ratio a linear
 * filter skips pixels and aliases; halving at most twofold a step
 * (`halvings`), each step averages every pixel it covers, the box filter a
 * mip chain is built with. The screen's 49 covers of that page, both sizes
 * each, took the loader's thread 120 to 140 ms this way against 270 to 410
 * resampled. The bitmaps stay in this process's memory, so the page's upload
 * is a copy: a video frame shrinks faster still, but on the GPU, and
 * uploading what it gives back cost the page's thread five times as much.
 */

/** What the layer asks of the loader. */
export type LoaderAsk =
	| {
			kind: "load";
			key: string;
			/** An absolute address: a worker resolves relative ones against its own script. */
			url: string;
			/** The resident square, the cover at its own size (`null`), or a resize to this. */
			size: "resident" | PixelSize | null;
			/** Lower first: 0 what a frame drawn on screen wants, 1 what a shell's frame would, 2 the rest. */
			priority: number;
			generation: number;
			/** For a square: the frame on screen it is for, so the sharper copy it wants comes too. */
			box?: Box;
	  }
	| { kind: "priority"; key: string; priority: number; box?: Box }
	| { kind: "cancel"; key: string }
	/** Forget every asked-for load: the context they were for is gone. */
	| { kind: "reset" };

/** A frame on screen in device pixels, and the largest texture the GPU takes. */
export interface Box {
	w: number;
	h: number;
	maxSide: number;
}

/**
 * What the loader hands back, one per load it was asked for, and one for a
 * sharper copy it made unasked from a square's box (`size` set, keyed by
 * `sharpKey`).
 */
export type LoaderReply =
	| {
			key: string;
			generation: number;
			bitmap: ImageBitmap;
			natural: PixelSize;
			/** When the bytes arrived, as epoch milliseconds so the page can put it on its own clock. */
			fetchedAt: number;
			/** The size of a sharper copy nobody asked for by its key. */
			size?: PixelSize;
	  }
	| { key: string; generation: number; failed: true };

/**
 * Covers fetched at once, and fetched or decoded at once, per loader. The
 * browser opens six connections to one host whatever the loaders ask, and
 * decodes beyond the cores only queue.
 */
const FETCHES = 6;
const LOADS = 12;

/**
 * Covers at once for frames off screen (priority 2), per loader. Those squares
 * are for later, so they trickle in behind what the screen is waiting for: the
 * daemon serving the frames' own documents and the cores are shared with
 * everything the page does next.
 */
const BACKGROUND = 1;

type Load = Extract<LoaderAsk, { kind: "load" }>;

const queue = new Map<string, Load>();
let fetching = 0;
let decoding = 0;
let background = 0;

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
				if (ask.box !== undefined) queued.box = ask.box;
			}
		} else if (ask.kind === "cancel") queue.delete(ask.key);
		else queue.clear();
	}
	pump();
};

function pump(): void {
	while (fetching < FETCHES && fetching + decoding < LOADS && queue.size > 0) {
		let best: Load | null = null;
		for (const load of queue.values()) if (best === null || load.priority < best.priority) best = load;
		if (best === null || (best.priority >= 2 && background >= BACKGROUND)) return;
		// everything else asked of the same cover rides along on its decode
		const group: Load[] = [];
		for (const load of queue.values()) if (load.url === best.url) group.push(load);
		for (const load of group) queue.delete(load.key);
		void run(group, best.priority >= 2);
	}
}

async function run(group: Load[], later: boolean): Promise<void> {
	if (later) background += 1;
	try {
		await fetchAndDecode(group);
	} finally {
		if (later) background -= 1;
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
		const urgent = group.some((load) => load.priority < 2);
		const response = await fetch(first.url, { priority: urgent ? "high" : "low" });
		if (!response.ok) throw new Error(`cover ${response.status}`);
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
	/** Made from a square's box rather than asked for by key. */
	derived: boolean;
}

/**
 * The bitmaps to make of one cover, largest first: every load in the group,
 * and the sharper copy a square's box wants when no load asked for it.
 */
function plan(group: readonly Load[], natural: PixelSize): Output[] {
	const outputs: Output[] = group.map((load) => ({
		key: load.key,
		size: load.size === "resident" ? { width: RESIDENT_PX, height: RESIDENT_PX } : (load.size ?? natural),
		derived: false,
	}));
	for (const load of group) {
		if (load.box === undefined) continue;
		const wanted = textureFor(containSize(load.box.w, load.box.h, natural), natural, load.box.maxSide);
		if (wanted.kind !== "sharp") continue;
		const key = sharpKey(load.url, wanted.width);
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
 * Every output of one cover from one decode, largest first. Each starts from
 * the smallest bitmap already made that covers it on both sides, so a square
 * squeezed from a wide cover never grows back out of a copy shrunk for its
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
			for (const step of halvings(current, size)) {
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
