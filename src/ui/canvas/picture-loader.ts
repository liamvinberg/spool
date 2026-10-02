import { coverSize, type PixelSize } from "./cover-size";
import { RESIDENT_PX } from "./picture-plan";

/**
 * The picture layer's loader, in a worker of its own (#81): fetch a cover,
 * read its size from its header, decode it at the size the layer asked for,
 * and hand the bitmap over.
 *
 * Off the page's thread because the page's thread is busy exactly when the
 * most covers are wanted: opening a page mounts a label per frame, most of a
 * second on a thousand-frame page, and a loader living there could start no
 * decode and hand the network no next request until that was over. Here the
 * whole page is asked for at once, on-screen frames first, and the network
 * and Chrome's image threads work through the mount; the page only uploads
 * what has landed.
 */

/** What the layer asks of the loader. */
export type LoaderAsk =
	| {
			kind: "load";
			key: string;
			/** An absolute address: a worker resolves relative ones against its own script. */
			url: string;
			/** The resident square, the cover at its own size (`null`), or a resize to this. */
			size: "resident" | { width: number; height: number } | null;
			/** Lower first: 0 a sharper copy on screen, 1 a square on screen, 2 the rest. */
			priority: number;
			generation: number;
	  }
	| { kind: "priority"; key: string; priority: number }
	| { kind: "cancel"; key: string }
	/** Forget every asked-for load: the context they were for is gone. */
	| { kind: "reset" };

/** What the loader hands back, one per load it started. */
export type LoaderReply =
	| {
			key: string;
			generation: number;
			bitmap: ImageBitmap;
			natural: PixelSize;
			/** When the bytes arrived, as epoch milliseconds so the page can put it on its own clock. */
			fetchedAt: number;
	  }
	| { key: string; generation: number; failed: true };

/**
 * Fetches at once, and fetches and decodes together. Six connections is all
 * the browser opens to one host, and decodes beyond the cores only queue.
 */
const FETCHES = 8;
const LOADS = 24;

type Load = Extract<LoaderAsk, { kind: "load" }>;

const queue = new Map<string, Load>();
let fetching = 0;
let decoding = 0;

const post = (reply: LoaderReply, transfer: Transferable[] = []) => self.postMessage(reply, { transfer });

self.onmessage = (event: MessageEvent<LoaderAsk>) => {
	const ask = event.data;
	if (ask.kind === "load") queue.set(ask.key, ask);
	else if (ask.kind === "priority") {
		const queued = queue.get(ask.key);
		if (queued !== undefined) queued.priority = ask.priority;
	} else if (ask.kind === "cancel") queue.delete(ask.key);
	else queue.clear();
	pump();
};

function pump(): void {
	while (fetching < FETCHES && fetching + decoding < LOADS && queue.size > 0) {
		let best: Load | null = null;
		for (const load of queue.values()) if (best === null || load.priority < best.priority) best = load;
		if (best === null) return;
		queue.delete(best.key);
		void run(best);
	}
}

async function run(load: Load): Promise<void> {
	fetching += 1;
	let bytes: Uint8Array<ArrayBuffer>;
	let type: string;
	try {
		const response = await fetch(load.url, { priority: load.priority < 2 ? "high" : "low" });
		if (!response.ok) throw new Error(`cover ${response.status}`);
		bytes = new Uint8Array(await response.arrayBuffer());
		type = response.headers.get("content-type") ?? "";
	} catch {
		post({ key: load.key, generation: load.generation, failed: true });
		return;
	} finally {
		fetching -= 1;
		pump();
	}
	const fetchedAt = performance.timeOrigin + performance.now();
	decoding += 1;
	try {
		const blob = new Blob([bytes], { type });
		const natural = coverSize(bytes) ?? (await decodedSize(blob));
		const size = load.size === "resident" ? { width: RESIDENT_PX, height: RESIDENT_PX } : load.size;
		const resize =
			size === null || (size.width === natural.width && size.height === natural.height)
				? {}
				: { resizeWidth: size.width, resizeHeight: size.height };
		const bitmap = await createImageBitmap(blob, {
			...resize,
			resizeQuality: "high",
			premultiplyAlpha: "premultiply",
		});
		post({ key: load.key, generation: load.generation, bitmap, natural, fetchedAt }, [bitmap]);
	} catch {
		post({ key: load.key, generation: load.generation, failed: true });
	} finally {
		decoding -= 1;
		pump();
	}
}

/** A cover's size by decoding it, for the file whose header said nothing. */
async function decodedSize(blob: Blob): Promise<PixelSize> {
	const bitmap = await createImageBitmap(blob);
	const size = { width: bitmap.width, height: bitmap.height };
	bitmap.close();
	return size;
}
