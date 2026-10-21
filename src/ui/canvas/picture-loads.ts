import { bucketOf } from "./bucket";
import { type Drawing, type LoaderAsk, type LoaderPort, type LoaderReply, serveLoader } from "./picture-loader";
import { type PixelSize, Priority } from "./picture-plan";

/**
 * The page's side of the picture layer's loaders (`picture-loader.ts`): which
 * loads are out, the asks waiting to be sent, and what has come back and waits
 * for a frame to upload it (#81). The layer decides what to load; this owns
 * how a load travels.
 *
 * Asks are batched: everything one draw asked goes out at its end (`send`), so
 * a loader sees a page's squares and which of them are on screen in one
 * message, and starts none before it knows. A load stays out until it comes
 * back, even once taken back: a loader drops it if it had not started and
 * says so, and one already started lands like any other, rather than being
 * thrown away only to be asked for again when the camera rests.
 */

/**
 * Loaders working side by side, each a worker of its own. A still always goes
 * to the same one, so every texture asked of it can share one decode there.
 * Two, because the work a loader cannot hand to Chrome's own image threads
 * runs on the loader's thread, one still after another, and the screen's
 * stills waited on that line; more would take cores the frames' documents
 * boot on.
 */
const LOADERS = 2;

/**
 * How long the rest of the page waits on a document that never says it has
 * loaded (`setBooting`): a broken frame must not keep the page from drawing.
 */
const BOOT_WAIT_MS = 2000;

/** One texture of one still, on its way. */
export interface Job {
	/** The still's own address for its square, `halvingKey` for a halving. */
	key: string;
	still: string;
	/** The halving's size, or null for the square. */
	halving: PixelSize | null;
	priority: Priority;
	/** Taken back, and waiting to hear whether its loader had started it. */
	cancelled?: boolean;
	/** Its frame's drawn size has gone with it, so a square brings the halving that size wants. */
	sized?: boolean;
	/** Which ask of its key it went out as (`StillLoads.ask`). */
	ask?: number;
}

/** A load back from its loader, decoded and waiting for a frame to upload it. */
export interface Landed {
	job: Job;
	bitmap: ImageBitmap;
	natural: PixelSize;
	/** When its bytes arrived, on the page's clock. */
	fetched: number;
	/** A halving the loader made unasked, beside a square, for the size its frame was drawn. */
	derived: boolean;
}

export interface LoadHooks {
	/** Something landed: a frame should come to upload it. */
	landed: () => void;
	/** A load failed, or was dropped before it started, and is no longer out. */
	gone: (job: Job, failed: boolean) => void;
}

/** Makes one loader: a worker of `picture-loader.ts`, or a stand-in for one in a test. */
export type LoaderFactory = () => Pick<Worker, "postMessage" | "addEventListener" | "terminate">;
type Loader = ReturnType<LoaderFactory>;

/**
 * A loader on the page's own thread, for a page that may make no worker: the
 * same loader as a worker runs, its messages passed a microtask apart as a
 * worker's are a task apart. Fetching and decoding still run off the page's
 * thread, in the network stack and Chrome's image threads; only the shrinking
 * steps run here.
 */
export const inPageLoader: LoaderFactory = () => {
	const listeners = new Set<EventListener>();
	let alive = true;
	const port: LoaderPort = {
		onmessage: null,
		postMessage: (reply) =>
			queueMicrotask(() => {
				if (!alive) {
					if ("bitmap" in reply) reply.bitmap.close();
					return;
				}
				const event = new MessageEvent("message", { data: reply });
				for (const listener of listeners) listener(event);
			}),
	};
	serveLoader(port);
	const loader = {
		postMessage: (asks: LoaderAsk[]) =>
			queueMicrotask(() => {
				if (alive) port.onmessage?.(new MessageEvent("message", { data: asks }));
			}),
		addEventListener: (type: string, listener: EventListener) => {
			if (type === "message") listeners.add(listener);
		},
		terminate: () => {
			alive = false;
		},
	};
	return loader as unknown as Loader;
};

/**
 * A worker of `picture-loader.ts` where the page may make one, and the loader
 * on the page where it may not. A worker is made only of a script on the
 * page's own origin, and a link share's host runs spool.page's script
 * (`viewer-page.ts` in spool-cloud), so there it is the page's loader from the
 * start. A worker whose script never runs (refused by the page's policy, say)
 * says so with an error before it ever answers: everything asked of it is
 * asked again of a loader on the page.
 */
const worker: LoaderFactory = () => {
	if (new URL(import.meta.url).origin !== location.origin) return inPageLoader();
	let made: Worker;
	try {
		made = new Worker(new URL("./picture-loader-worker.ts", import.meta.url), { type: "module" });
	} catch {
		return inPageLoader();
	}
	let current: Loader = made;
	const listeners: EventListener[] = [];
	/** What it was asked before it first answered, to ask again of the page's loader if it never does. */
	let unanswered: LoaderAsk[][] | null = [];
	made.addEventListener("message", () => {
		unanswered = null;
	});
	made.addEventListener("error", () => {
		if (unanswered === null) return;
		const asked = unanswered;
		unanswered = null;
		made.terminate();
		current = inPageLoader();
		for (const listener of listeners) current.addEventListener("message", listener);
		for (const asks of asked) current.postMessage(asks);
	});
	const loader = {
		postMessage: (asks: LoaderAsk[]) => {
			unanswered?.push(asks);
			current.postMessage(asks);
		},
		addEventListener: (type: string, listener: EventListener) => {
			if (type !== "message") return;
			listeners.push(listener);
			current.addEventListener("message", listener);
		},
		terminate: () => current.terminate(),
	};
	return loader as unknown as Loader;
};

export class StillLoads {
	private loaders: Loader[] = [];
	private readonly outbox = new Map<Loader, LoaderAsk[]>();
	private readonly out = new Map<string, Job>();
	private landed: Landed[] = [];
	/** Bumped when the context goes, so a decode begun before it lands nowhere. */
	private generation = 0;
	private booting = false;
	private bootWait: ReturnType<typeof setTimeout> | undefined;
	/**
	 * Asks numbered as they go. A key can go out again while an older ask of
	 * it is still out, released and wanted again before its loader answered;
	 * the number tells that older ask's answer apart, so it never settles the
	 * newer one.
	 */
	private asks = 0;

	constructor(
		private readonly hooks: LoadHooks,
		private readonly make: LoaderFactory = worker,
	) {}

	/** Make the loaders. Only once there is a context to load for, or one that will come back. */
	start(): void {
		if (this.loaders.length > 0) return;
		for (let i = 0; i < LOADERS; i++) {
			const loader = this.make();
			loader.addEventListener("message", this.onReply as EventListener);
			this.loaders.push(loader);
		}
	}

	get started(): boolean {
		return this.loaders.length > 0;
	}

	/** Loads out, loads landed and waiting to upload, and every ask ever sent. */
	get pending(): { out: number; landed: number; asked: number } {
		return { out: this.out.size, landed: this.landed.length, asked: this.asks };
	}

	/** The load out under this key, if any. */
	job(key: string): Job | undefined {
		return this.out.get(key);
	}

	/** Send a load. The still's address is made absolute here, for the worker to fetch. */
	ask(job: Job): void {
		const loader = this.loaderOf(job.still);
		if (loader === undefined) return;
		this.asks += 1;
		job.ask = this.asks;
		this.out.set(job.key, job);
		this.tell(loader, {
			kind: "load",
			key: job.key,
			still: job.still,
			href: new URL(job.still, location.href).href,
			size: job.halving ?? "square",
			priority: job.priority,
			generation: this.generation,
			ask: job.ask,
		});
	}

	/**
	 * Move a load that has not started up the queue, and tell it its frame's
	 * drawn size once, whenever that first comes: a square raised while the
	 * camera moved, without one, still brings its halving at rest.
	 */
	raise(job: Job, priority: Priority, drawing?: Drawing): void {
		const telling = drawing !== undefined && job.sized !== true;
		if (job.priority <= priority && !telling) return;
		job.priority = Math.min(job.priority, priority) as Priority;
		if (telling) job.sized = true;
		this.tell(this.loaderOf(job.still), {
			kind: "priority",
			key: job.key,
			priority,
			...(drawing === undefined ? {} : { drawing }),
		});
	}

	/** Take a load back. It stays out until its loader says whether it had started. */
	cancel(key: string): void {
		const job = this.out.get(key);
		if (job === undefined || job.cancelled === true) return;
		job.cancelled = true;
		this.tell(this.loaderOf(job.still), { kind: "cancel", key });
	}

	/** The oldest load landed, for a frame to upload. */
	take(): Landed | undefined {
		return this.landed.shift();
	}

	/**
	 * Whether a frame's document is booting: mounted, and not yet reported
	 * loaded (`canvas.tsx`). Everything but what the screen wants waits while
	 * one is, because what a document needs to arrive, the daemon answering it
	 * and the cores running it, is what the rest of the page's stills would
	 * take: decoding a thousand-frame page's squares beside the screen's
	 * documents made those documents take twice as long to report loaded.
	 */
	setBooting(booting: boolean): void {
		if (booting === this.booting) return;
		this.booting = booting;
		clearTimeout(this.bootWait);
		if (booting) this.bootWait = setTimeout(() => this.background(true), BOOT_WAIT_MS);
		this.background(!booting);
	}

	/** Everything asked since the last send, one message per loader. */
	send(): void {
		for (const [loader, asks] of this.outbox) loader.postMessage(asks);
		this.outbox.clear();
	}

	/** Forget every load: the context they were for is gone. */
	reset(): void {
		this.generation += 1;
		this.out.clear();
		for (const loader of this.loaders) this.tell(loader, { kind: "reset" });
		this.send();
		for (const item of this.landed) item.bitmap.close();
		this.landed = [];
	}

	dispose(): void {
		clearTimeout(this.bootWait);
		this.reset();
		for (const loader of this.loaders) loader.terminate();
		this.loaders = [];
		this.outbox.clear();
	}

	private background(open: boolean): void {
		for (const loader of this.loaders) this.tell(loader, { kind: "background", open });
		this.send();
	}

	private tell(loader: Loader | undefined, ask: LoaderAsk): void {
		if (loader === undefined) return;
		const waiting = this.outbox.get(loader);
		if (waiting === undefined) this.outbox.set(loader, [ask]);
		else waiting.push(ask);
	}

	private loaderOf(still: string): Loader | undefined {
		return this.loaders[bucketOf(still, this.loaders.length)];
	}

	/**
	 * A load came back. A decode for a context that has since gone is let go;
	 * everything else is the layer's to judge, at upload.
	 */
	private readonly onReply = (event: MessageEvent<LoaderReply>): void => {
		const reply = event.data;
		if (reply.generation !== this.generation) {
			if ("bitmap" in reply) reply.bitmap.close();
			return;
		}
		if ("bitmap" in reply && reply.size !== undefined) {
			const still = reply.key.slice(0, reply.key.lastIndexOf("#"));
			const job: Job = { key: reply.key, still, halving: reply.size, priority: Priority.drawn };
			this.land(job, reply, true);
			return;
		}
		const job = this.out.get(reply.key);
		if (job === undefined || job.ask !== reply.ask) {
			if ("bitmap" in reply) reply.bitmap.close();
			return;
		}
		this.out.delete(reply.key);
		if ("bitmap" in reply) this.land(job, reply, false);
		else this.hooks.gone(job, "failed" in reply);
	};

	private land(job: Job, reply: Extract<LoaderReply, { bitmap: ImageBitmap }>, derived: boolean): void {
		this.landed.push({
			job,
			bitmap: reply.bitmap,
			natural: reply.natural,
			fetched: reply.fetchedAt - performance.timeOrigin,
			derived,
		});
		this.hooks.landed();
	}
}
