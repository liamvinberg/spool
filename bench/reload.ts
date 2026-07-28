import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, type BrowserContext, type CDPSession, chromium, type Frame, type Page } from "playwright-core";
import {
	copyProject,
	DEFAULT_ZOOM,
	densestPage,
	type FrameBox,
	freePort,
	ms,
	planCamera,
	quantile,
	startDaemon,
	VIEWPORT,
	writeCamera,
} from "./harness.ts";

/**
 * Reload to canvas looking complete (#98). The map's reload row has never been
 * measured; this run gives it a number.
 *
 * **Why `settle` could not.** `bench/canvas.ts` defines settled as the iframe
 * count holding still for a second, so its `reloadMs` was by construction when
 * the wake queue finished draining — a constant it was told rather than
 * anything it found. #112 deleted that queue, and with it the whole idea that a
 * reload ends when the canvas has finished mounting: a settled canvas mounts
 * nothing at all now. The bar is *reload to canvas looking complete*, and what
 * a person sees on reload is a wall of stored covers. Nobody had timed the
 * covers.
 *
 * **The completion condition.** `settle` had to guess when things had stopped
 * because it did not know what it was waiting for. This one knows the target:
 * every frame on the page that *has* a stored cover holds a decoded picture.
 * The timestamp is the page's own `performance.now()` at the last cover's
 * decode, which on a reload is measured from that document's navigation start,
 * so there is no stability window to subtract and no arbitrary constant.
 *
 * **Two instruments, because neither alone is enough.**
 *
 *   - The page's own marks and Resource Timing give the completion moment and
 *     the cover responses in one timebase, exactly. Covers are same-origin, so
 *     their timing is fully visible without Timing-Allow-Origin.
 *   - CDP Network gives the census across every origin — status codes, disk
 *     cache hits and transferred bytes — which Resource Timing cannot, because
 *     a frame document is cross-origin and reports zero bytes to the page.
 *
 * **Where the cover actually is.** #98 cites the stand-in thumbnail the shell
 * keeps decoded beside a live document; a reloaded canvas is inside nothing, so
 * that element does not exist. The cover a reloaded frame shows is the
 * `<Thumbnail>` inside the `plan.cover` block, and that is what this waits for.
 * Both carry `alt={name}`, so the watcher keys on the frame name and takes the
 * first load per name — and since #111 both name the same addresses, so the two
 * elements are one request rather than two.
 *
 * **A frame with no stored cover never gets a picture.** On matmannen's densest
 * page that is one frame of 41: it renders the placeholder, not an `<img>`.
 * Waiting for it would hang forever and counting it complete would be a lie, so
 * the expected set is read from disk and the bare frames are reported by name.
 *
 *   pnpm build && node bench/reload.ts --project ~/projects/matmannen-fc63dba
 *   node bench/reload.ts --project <path> --repeats 5 --out reload.json
 *
 * Run it with node's own type stripping, not tsx: the watcher below is
 * serialized into the page by playwright, and esbuild's keep-names transform
 * wraps every function in a `__name` helper that does not exist there.
 */

interface Options {
	project: string;
	repeats: number;
	headed: boolean;
	zoom: number;
	out: string | undefined;
}

/**
 * The arms. `stock` is the canvas as shipped; `flows blocked` is the null
 * control that names the cause, aborting exactly one request and changing
 * nothing else. The canvas tolerates it by design — `canvas.tsx:546` returns
 * early when the fetch gives back nothing, so the arrows are missing and every
 * other thing on screen is identical.
 *
 * Read the warm row of `stock` only. Routing a request disables the page's HTTP
 * cache in Chromium, so `flows blocked` fetches every cover on both of its
 * passes and its "warm" row is a cold measurement wearing the wrong label. The
 * null control is there to name a cause in the cold numbers, which it still
 * does; caching is the other arm's to report.
 */
const ARMS = [
	{ label: "stock", blockFlows: false },
	{ label: "flows blocked", blockFlows: true },
] as const;

type ArmLabel = (typeof ARMS)[number]["label"];

function parseArgs(argv: string[]): Options {
	let project = "";
	let repeats = 3;
	// headed by default: this map's standing note, and covers are decoded on the
	// canvas UI's own main thread, which headless shell does not model faithfully
	let headed = true;
	let zoom = DEFAULT_ZOOM;
	let out: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--project" && next !== undefined) {
			project = resolve(next);
			i++;
		} else if (arg === "--repeats" && next !== undefined) {
			repeats = Number(next);
			i++;
		} else if (arg === "--zoom" && next !== undefined) {
			zoom = Number(next);
			i++;
		} else if (arg === "--out" && next !== undefined) {
			out = resolve(next);
			i++;
		} else if (arg === "--headed") {
			headed = true;
		} else if (arg === "--headless") {
			headed = false;
		} else {
			throw new Error(`unknown argument ${arg}`);
		}
	}
	if (project === "") throw new Error("--project <path to a spool project> is required");
	if (!Number.isFinite(repeats) || repeats < 1) throw new Error("--repeats must be a positive integer");
	return { project, repeats, headed, zoom, out };
}

/**
 * The frames that can show a picture at all, read from disk rather than from the
 * canvas. A frame is covered when its cover folder holds one hashed image, or
 * when a terminal has a serialized screen beside it. A bare `<frame>.jpg`
 * from the pre-image store is not a cover and never shows.
 */
function splitByCover(root: string, frames: FrameBox[]): { covered: string[]; bare: string[] } {
	const thumbs = join(root, "design", ".spool", "thumbs");
	const screens = join(root, "design", ".spool", "term");
	const image = /^[0-9a-f]{32}\.(?:jpg|png)$/;
	const covered: string[] = [];
	const bare: string[] = [];
	for (const frame of frames) {
		let files: string[] = [];
		try {
			files = readdirSync(join(thumbs, frame.name));
		} catch {
			files = [];
		}
		const has = files.some((file) => image.test(file)) || existsSync(join(screens, `${frame.name}.screen`));
		(has ? covered : bare).push(frame.name);
	}
	return { covered, bare };
}

interface CoverMark {
	load: number;
	decode?: number;
}

interface CoverWatch {
	marks: Record<string, CoverMark>;
}

/**
 * Installed before any page script and re-installed on every navigation. Cover
 * images do not exist at document start — a frame's shell mounts one only once
 * the projection has told it the cover's address — so this observes the document
 * rather than querying it once.
 *
 * `load` says the bytes arrived; `decode()` says the bitmap is ready to paint.
 * The bar is what a person sees, so completion is the decode, and both are kept
 * because the difference between them is the decode cost the map cares about.
 */
function watchCovers(): void {
	const marks: Record<string, CoverMark> = {};
	const seen = new WeakSet<Element>();
	const note = (node: Element): void => {
		if (node.tagName !== "IMG" || seen.has(node)) return;
		seen.add(node);
		const img = node as HTMLImageElement;
		const alt = img.alt;
		if (alt === "") return;
		const onLoad = (): void => {
			// first load per frame wins: a mounted frame renders a second
			// thumbnail of its own, and that one is not the reload's cover
			if (marks[alt] === undefined) marks[alt] = { load: performance.now() };
			img.decode()
				.then(() => {
					const mark = marks[alt];
					if (mark !== undefined && mark.decode === undefined) mark.decode = performance.now();
				})
				.catch(() => {
					// removed from the document before it could decode
				});
		};
		if (img.complete && img.naturalWidth > 0) onLoad();
		else img.addEventListener("load", onLoad, { once: true });
	};
	const scan = (node: Node): void => {
		if (node.nodeType !== 1) return;
		const element = node as Element;
		note(element);
		for (const img of element.querySelectorAll("img")) note(img);
	};
	new MutationObserver((records) => {
		for (const record of records) for (const added of record.addedNodes) scan(added);
	}).observe(document, { childList: true, subtree: true });
	(globalThis as unknown as { __covers: CoverWatch }).__covers = { marks };
}

const readMarks = (page: Page): Promise<Record<string, CoverMark>> =>
	page.evaluate(() => (globalThis as unknown as { __covers: CoverWatch }).__covers.marks);

interface CoverResponse {
	frame: string;
	responseEnd: number;
	transferSize: number;
	encodedBodySize: number;
}

/**
 * The cover fetches as the page timed them. Same-origin, so `responseEnd` is
 * real and sits in the same `performance.now()` timebase as the marks above —
 * which is what makes "network, then decode" a subtraction rather than a guess.
 * The `<img>` fetches its own image, so the network entry *is* the image and
 * its address is /covers/<project>/<frame>/<hash>.
 */
const readCoverResponses = (page: Page): Promise<CoverResponse[]> =>
	page.evaluate(() =>
		performance
			.getEntriesByType("resource")
			.filter((entry) => entry.name.includes("/covers/"))
			.map((entry) => {
				const timing = entry as PerformanceResourceTiming;
				const parts = (timing.name.split("?")[0] ?? "").split("/");
				return {
					// .../covers/<project>/<frame>/<hash>
					frame: decodeURIComponent(parts[parts.length - 2] ?? ""),
					responseEnd: timing.responseEnd,
					transferSize: timing.transferSize,
					encodedBodySize: timing.encodedBodySize,
				};
			}),
	);

interface WireRequest {
	url: string;
	method: string;
	status?: number | undefined;
	fromDiskCache?: boolean | undefined;
	bytes?: number | undefined;
	/** Waiting for one of the origin's connections: the pool's queue. */
	queuedMs?: number | undefined;
	/** Request written to first response byte: the daemon thinking. */
	waitMs?: number | undefined;
	connectionId?: number | undefined;
	/** Whether the request offered the stored validator, and the response gave one. */
	sentIfNoneMatch?: boolean | undefined;
	gotEtag?: boolean | undefined;
	cacheControl?: string | undefined;
}

/** Header lookup that does not care how the wire cased the name. */
function header(headers: Record<string, string> | undefined, name: string): string | undefined {
	if (headers === undefined) return undefined;
	for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === name) return value;
	return undefined;
}

interface CdpTiming {
	requestTime: number;
	sendStart: number;
	sendEnd: number;
	receiveHeadersEnd: number;
}

interface CdpWatch {
	wire: Map<string, WireRequest>;
	reset: () => void;
}

/**
 * Both halves of the traffic, exactly as `bench/arrival.ts` takes it: the page
 * target for the covers and the frame documents, a session per frame document
 * for what a frame asks for once it is running. Without the second half the
 * "other" column reads as empty on a project whose own import map reaches for a
 * CDN, which is most of the requests a reload actually makes.
 */
async function watchNetwork(context: BrowserContext, page: Page): Promise<CdpWatch> {
	const wire = new Map<string, WireRequest>();
	const attach = async (session: CDPSession): Promise<void> => {
		session.on(
			"Network.requestWillBeSent",
			(payload: {
				requestId: string;
				request: { url: string; method: string; headers?: Record<string, string> };
			}) => {
				if (wire.has(payload.requestId)) return;
				wire.set(payload.requestId, {
					url: payload.request.url,
					method: payload.request.method,
					sentIfNoneMatch: header(payload.request.headers, "if-none-match") !== undefined,
				});
			},
		);
		session.on(
			"Network.responseReceived",
			(payload: {
				requestId: string;
				response: {
					status: number;
					fromDiskCache?: boolean;
					connectionId?: number;
					timing?: CdpTiming;
					headers?: Record<string, string>;
				};
			}) => {
				const entry = wire.get(payload.requestId);
				if (entry === undefined) return;
				const { status, fromDiskCache, connectionId, timing, headers } = payload.response;
				entry.status = status;
				entry.fromDiskCache = fromDiskCache;
				entry.connectionId = connectionId;
				entry.gotEtag = header(headers, "etag") !== undefined;
				entry.cacheControl = header(headers, "cache-control");
				if (timing !== undefined) {
					entry.queuedMs = timing.sendStart;
					entry.waitMs = timing.receiveHeadersEnd - timing.sendEnd;
				}
			},
		);
		session.on("Network.loadingFinished", (payload: { requestId: string; encodedDataLength: number }) => {
			const entry = wire.get(payload.requestId);
			if (entry === undefined) return;
			entry.bytes = payload.encodedDataLength;
		});
		await session.send("Network.enable");
	};

	await attach(await context.newCDPSession(page));

	const FRAME_SESSIONS = 48;
	const watched = new Set<string>();
	const watch = (frame: Frame): void => {
		const url = frame.url();
		if (watched.size >= FRAME_SESSIONS || !/\/p\/[^/]+\/frames\//.test(url) || watched.has(url)) return;
		watched.add(url);
		void context
			.newCDPSession(frame)
			.then(attach)
			.catch(() => {
				watched.delete(url);
			});
	};
	page.on("frameattached", watch);
	page.on("framenavigated", watch);
	return { wire, reset: () => wire.clear() };
}

type Bucket = "cover" | "frame document" | "canvas app" | "other";

function bucketOf(url: string): Bucket {
	if (url.includes("/covers/")) return "cover";
	if (/\/p\/[^/]+\/frames\//.test(url)) return "frame document";
	if (url.includes("/api/") || /\/assets\/|\.js$|\.css$/.test(url)) return "canvas app";
	return "other";
}

interface Census {
	bucket: Bucket;
	requests: number;
	bytes: number;
	notModified: number;
	fromCache: number;
	other: number;
	/** Waiting for a connection, p50 and worst: the pool's queue. */
	queuedP50: number;
	queuedWorst: number;
	/** The daemon thinking, p50 and worst. */
	waitP50: number;
	waitWorst: number;
	connections: number;
}

function census(wire: Map<string, WireRequest>): Census[] {
	const groups = new Map<Bucket, WireRequest[]>();
	for (const entry of wire.values()) {
		const bucket = bucketOf(entry.url);
		const found = groups.get(bucket);
		if (found === undefined) groups.set(bucket, [entry]);
		else found.push(entry);
	}
	const order: Bucket[] = ["cover", "frame document", "canvas app", "other"];
	return order
		.filter((bucket) => groups.has(bucket))
		.map((bucket) => {
			const entries = groups.get(bucket) ?? [];
			const queued = entries.map((entry) => entry.queuedMs ?? 0).sort((a, b) => a - b);
			const wait = entries.map((entry) => entry.waitMs ?? 0).sort((a, b) => a - b);
			return {
				bucket,
				requests: entries.length,
				bytes: entries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
				notModified: entries.filter((entry) => entry.status === 304).length,
				fromCache: entries.filter((entry) => entry.fromDiskCache === true).length,
				other: entries.filter((entry) => entry.status !== undefined && entry.status !== 304 && entry.status !== 200)
					.length,
				queuedP50: quantile(queued, 0.5),
				queuedWorst: queued.at(-1) ?? Number.NaN,
				waitP50: quantile(wait, 0.5),
				waitWorst: wait.at(-1) ?? Number.NaN,
				connections: new Set(entries.map((entry) => entry.connectionId).filter((id) => id !== undefined)).size,
			};
		});
}

interface Sample {
	/** Page time at the last cover's `load` — bytes in hand for every frame. */
	loadCompleteMs: number;
	/** Page time at the last cover's `decode` — the bar: every frame holds a picture. */
	decodeCompleteMs: number;
	/** Page time at the last cover response — everything after this is not network. */
	lastResponseEndMs: number;
	coversLoaded: number;
	census: Census[];
	/** How long polling took to notice, so the census's scope is honest. */
	noticedAfterMs: number;
	/**
	 * Every cover's decode time, sorted. The shape is the whole argument: covers
	 * landing evenly across the window are a queue draining, covers landing
	 * together at the end are something releasing them all at once.
	 */
	decodeTimeline: number[];
	/** Every request, so a surprising total can be read back without re-running. */
	wire: WireRequest[];
}

const POLL_MS = 40;

/**
 * Hold until every covered frame holds a decoded picture, then report the
 * page's own timestamp of the last one. Fails loudly rather than timing out
 * into a plausible number: a run that measures nothing reports it as fast, and
 * this map has been bitten by that twice.
 */
async function waitComplete(page: Page, expected: string[], timeoutMs: number): Promise<Record<string, CoverMark>> {
	const deadline = Date.now() + timeoutMs;
	let marks: Record<string, CoverMark> = {};
	while (Date.now() < deadline) {
		marks = await readMarks(page);
		if (expected.every((name) => marks[name]?.decode !== undefined)) return marks;
		await page.waitForTimeout(POLL_MS);
	}
	const noLoad = expected.filter((name) => marks[name] === undefined);
	const noDecode = expected.filter((name) => marks[name] !== undefined && marks[name]?.decode === undefined);
	throw new Error(
		`the canvas never completed: ${noLoad.length} of ${expected.length} covers never loaded` +
			`${noLoad.length > 0 ? ` (${noLoad.slice(0, 6).join(", ")}${noLoad.length > 6 ? ", …" : ""})` : ""}` +
			`, ${noDecode.length} loaded but never decoded` +
			`${noDecode.length > 0 ? ` (${noDecode.slice(0, 6).join(", ")}${noDecode.length > 6 ? ", …" : ""})` : ""}`,
	);
}

async function sample(page: Page, watch: CdpWatch, expected: string[]): Promise<Sample> {
	watch.reset();
	const started = Date.now();
	await page.reload({ waitUntil: "commit" });
	const marks = await waitComplete(page, expected, 60_000);
	const noticedAt = Date.now();
	// snapshot immediately: everything the frames fetch after completion is real
	// traffic but it is not what the reload bar is about
	const snapshot = new Map(watch.wire);
	const taken = census(snapshot);
	const responses = await readCoverResponses(page);
	const loads = expected.map((name) => marks[name]?.load ?? Number.NaN);
	const decodes = expected.map((name) => marks[name]?.decode ?? Number.NaN);
	const wanted = new Set(expected);
	const ends = responses.filter((entry) => wanted.has(entry.frame)).map((entry) => entry.responseEnd);
	return {
		loadCompleteMs: Math.max(...loads),
		decodeCompleteMs: Math.max(...decodes),
		lastResponseEndMs: ends.length > 0 ? Math.max(...ends) : Number.NaN,
		coversLoaded: expected.filter((name) => marks[name] !== undefined).length,
		census: taken,
		noticedAfterMs: noticedAt - started,
		decodeTimeline: [...decodes].sort((a, b) => a - b),
		wire: [...snapshot.values()],
	};
}

const kb = (bytes: number): string => (bytes === 0 ? "0" : `${(bytes / 1024).toFixed(0)} KB`);

interface Run {
	arm: ArmLabel;
	cache: "cold" | "warm";
	samples: Sample[];
}

/** The flows request, which the null control below removes. */
const flowsOf = (sample: Sample): WireRequest | undefined =>
	sample.wire.find((entry) => /\/flows$/.test(entry.url.split("?")[0] ?? ""));

function report(runs: Run[], expected: string[], bare: string[], page: string): string {
	const lines: string[] = [];
	const column = (rows: Sample[], pick: (row: Sample) => number): number[] => rows.map(pick).sort((a, b) => a - b);
	const p50 = (rows: Sample[], pick: (row: Sample) => number): number => quantile(column(rows, pick), 0.5);
	lines.push(
		`page "${page === "" ? "root" : page}" — ${expected.length} frames with a stored cover` +
			`${bare.length > 0 ? `, ${bare.length} with none (${bare.join(", ")})` : ""}`,
	);
	lines.push("");
	lines.push("### reload to canvas looking complete");
	lines.push("");
	lines.push(`| arm | cache | last cover decoded (p50) | worst | last cover loaded (p50) | bar (2 s) |`);
	lines.push(`|---|---|---|---|---|---|`);
	for (const run of runs) {
		if (run.samples.length === 0) continue;
		const decode = column(run.samples, (row) => row.decodeCompleteMs);
		const median = quantile(decode, 0.5);
		lines.push(
			`| ${run.arm} | ${run.cache} | **${ms(median)}** | ${ms(decode.at(-1) ?? Number.NaN)} | ${ms(p50(run.samples, (row) => row.loadCompleteMs))} | ${median < 2000 ? "**pass**" : "**miss**"} |`,
		);
	}
	lines.push("");
	lines.push("### what the covers were waiting for");
	lines.push("");
	lines.push(`| arm | cache | covers queued p50 | daemon per cover p50 | \`/flows\` daemon time | complete |`);
	lines.push(`|---|---|---|---|---|---|`);
	for (const run of runs) {
		if (run.samples.length === 0) continue;
		const covers = run.samples.map((row) => row.census.find((group) => group.bucket === "cover"));
		const queued = covers.map((group) => group?.queuedP50 ?? Number.NaN).sort((a, b) => a - b);
		const wait = covers.map((group) => group?.waitP50 ?? Number.NaN).sort((a, b) => a - b);
		const flows = run.samples.map((row) => flowsOf(row)?.waitMs ?? Number.NaN).sort((a, b) => a - b);
		lines.push(
			`| ${run.arm} | ${run.cache} | ${ms(quantile(queued, 0.5))} | ${ms(quantile(wait, 0.5))} | ${run.arm === "flows blocked" ? "— (blocked)" : ms(quantile(flows, 0.5))} | ${ms(p50(run.samples, (row) => row.decodeCompleteMs))} |`,
		);
	}
	lines.push("");
	lines.push("### where the time went");
	lines.push("");
	lines.push(`| arm | cache | last cover response end | last cover decoded | gap: decode, paint, commit |`);
	lines.push(`|---|---|---|---|---|`);
	for (const run of runs) {
		if (run.samples.length === 0) continue;
		const end = p50(run.samples, (row) => row.lastResponseEndMs);
		const decode = p50(run.samples, (row) => row.decodeCompleteMs);
		lines.push(`| ${run.arm} | ${run.cache} | ${ms(end)} | ${ms(decode)} | ${ms(decode - end)} |`);
	}
	lines.push("");
	lines.push("### how the covers arrived");
	lines.push("");
	lines.push(`| arm | cache | first | p50 | last | window | shape |`);
	lines.push(`|---|---|---|---|---|---|---|`);
	for (const run of runs) {
		const last = run.samples.at(-1);
		if (last === undefined) continue;
		const line = last.decodeTimeline;
		const first = line[0] ?? Number.NaN;
		const end = line.at(-1) ?? Number.NaN;
		const median = quantile(line, 0.5);
		const position = (median - first) / Math.max(1, end - first);
		lines.push(
			`| ${run.arm} | ${run.cache} | ${ms(first)} | ${ms(median)} | ${ms(end)} | ${ms(end - first)} | ${position > 0.35 && position < 0.65 ? "even — a queue draining" : position >= 0.65 ? "back-loaded" : "front-loaded"} |`,
		);
	}
	lines.push("");
	lines.push("### what it fetched, up to completion");
	lines.push("");
	lines.push(
		`| arm | cache | what | requests | transferred | 304 | from cache | conns | queued p50/worst | daemon p50/worst |`,
	);
	lines.push(`|---|---|---|---|---|---|---|---|---|---|`);
	for (const run of runs) {
		const last = run.samples.at(-1);
		if (last === undefined) continue;
		for (const group of last.census) {
			lines.push(
				`| ${run.arm} | ${run.cache} | ${group.bucket} | ${group.requests} | ${kb(group.bytes)} | ${group.notModified} | ${group.fromCache} | ${group.connections} | ${ms(group.queuedP50)} / ${ms(group.queuedWorst)} | ${ms(group.waitP50)} / ${ms(group.waitWorst)} |`,
			);
		}
	}
	lines.push("");
	lines.push("### do covers revalidate");
	lines.push("");
	lines.push(`| arm | cache | cover requests | sent if-none-match | answered with an etag | 304 | cache-control |`);
	lines.push(`|---|---|---|---|---|---|---|`);
	for (const run of runs) {
		const last = run.samples.at(-1);
		if (last === undefined) continue;
		const covers = last.wire.filter((entry) => entry.url.includes("/covers/"));
		const directives = new Set(covers.map((entry) => entry.cacheControl).filter((value) => value !== undefined));
		lines.push(
			`| ${run.arm} | ${run.cache} | ${covers.length} | ${covers.filter((entry) => entry.sentIfNoneMatch === true).length} | ${covers.filter((entry) => entry.gotEtag === true).length} | ${covers.filter((entry) => entry.status === 304).length} | ${directives.size === 0 ? "—" : [...directives].join(", ")} |`,
		);
	}
	lines.push("");
	const lag = runs
		.flatMap((run) => run.samples)
		.map((row) => row.noticedAfterMs)
		.sort((a, b) => a - b);
	lines.push(
		`Completion times are the page's own \`performance.now()\`, measured from that document's navigation start. ` +
			`The census is snapshotted when polling noticed, ${ms(quantile(lag, 0.5))} of wall clock after the reload was ` +
			`issued, so it is a ceiling on what the reload fetched rather than an exact cut.`,
	);
	return lines.join("\n");
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const { root, name, spoolDir } = copyProject(options.project);
	const { page: canvasPage, frames: boxes } = densestPage(root);
	if (boxes.length === 0) throw new Error(`${options.project} has no frames to measure`);
	const { covered, bare } = splitByCover(root, boxes);
	// every bar below would report a pass over a canvas that shows nothing
	if (covered.length === 0) {
		throw new Error(`no frame on page "${canvasPage}" has a stored cover — this run would measure an empty canvas`);
	}
	const camera = planCamera(boxes, VIEWPORT.width, VIEWPORT.height, options.zoom);
	writeCamera(root, camera, canvasPage);
	const port = await freePort();
	const daemon = await startDaemon(spoolDir, root, port);
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	process.stderr.write(
		`bench: ${url} (copy of ${options.project}, page "${canvasPage === "" ? "root" : canvasPage}", ` +
			`${boxes.length} frames, ${covered.length} covered, ${bare.length} bare)\n`,
	);

	let browser: Browser | undefined;
	try {
		browser = await chromium.launch({
			channel: options.headed ? "chromium" : "chromium-headless-shell",
			headless: !options.headed,
		});
		const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
		const page = await context.newPage();
		await page.addInitScript(watchCovers);
		const watch = await watchNetwork(context, page);

		// One discarded pass first, and it is not the cold measurement. A fresh
		// daemon compiles every frame document it is asked for, so a first-ever
		// load prices the toolchain. A reload on a machine somebody is working on
		// meets a daemon that has been up for hours, so the honest cold case is a
		// cold *browser* cache against a warm daemon, which is what clearing the
		// cache below gives.
		process.stderr.write("bench: warming the daemon\n");
		await page.goto(url, { waitUntil: "commit" });
		await waitComplete(page, covered, 90_000);

		const session = await context.newCDPSession(page);
		const runs: Run[] = [];
		for (const arm of ARMS) {
			if (arm.blockFlows) {
				// exactly one request removed, nothing else touched
				await page.route(/\/api\/p\/[^/]+\/flows$/, (route) => void route.abort());
			}
			for (const cache of ["cold", "warm"] as const) {
				const samples: Sample[] = [];
				for (let i = 0; i < options.repeats; i++) {
					if (cache === "cold") await session.send("Network.clearBrowserCache");
					const taken = await sample(page, watch, covered);
					process.stderr.write(
						`bench: ${arm.label} / ${cache} ${i + 1}/${options.repeats} — ${ms(taken.decodeCompleteMs)} ms\n`,
					);
					samples.push(taken);
				}
				runs.push({ arm: arm.label, cache, samples });
			}
			if (arm.blockFlows) await page.unroute(/\/api\/p\/[^/]+\/flows$/);
		}

		const text = report(runs, covered, bare, canvasPage);
		process.stdout.write(`${text}\n`);
		if (options.out !== undefined) {
			writeFileSync(options.out, `${JSON.stringify({ page: canvasPage, covered, bare, runs }, null, "\t")}\n`);
			process.stderr.write(`bench: wrote ${options.out}\n`);
		}
	} finally {
		await browser?.close();
		daemon.stop();
	}
}

await main();
