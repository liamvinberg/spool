import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type BrowserContext, type CDPSession, chromium, type Frame, type Page } from "playwright-core";
import {
	type BuildRun,
	buildsHeader,
	type Camera,
	type Page as CanvasPage,
	clearCopiedCovers,
	DEFAULT_ZOOM,
	type FrameBox,
	interleave,
	median,
	ms,
	oneMinuteLoad,
	planCamera,
	prepareCurrentCovers,
	quantile,
	ROOT_PAGE,
	type Subject,
	startSubjects,
	stopSubjects,
	takeBuildOptions,
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
 * anything it found. #112 deleted that queue, and #128 later made readable,
 * nearby frames live. Neither document count says when the canvas looks
 * complete. A person sees stored covers until readable documents arrive, and
 * nobody had timed those covers.
 *
 * **The completion condition.** `settle` had to guess when things had stopped
 * because it did not know what it was waiting for. This one knows the target:
 * every frame the planned camera puts in the window holds a decoded picture.
 * A page larger than the window has covers nobody is looking at, and the
 * browser is free to refuse decoding those: on a warm n1000 reload Chromium
 * refused the first `decode()` of 534 to 744 off-screen covers with
 * "EncodingError: The source image cannot be decoded", so waiting on all of
 * them never finished and measured something no person sees.
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
 * **Covers are timed, then the reload is.** The canonical subject has no
 * app-owned state. Each round first deletes the copy's covers and times the
 * canvas at picture zoom from opening to one current cover for every measured
 * frame, failing if that coverage does not complete, then opens a fresh context
 * for the reload path. One untimed preparation before the rounds warms the
 * daemon's compile cache, so every timed one starts from the same place.
 *
 * `--builds` compares spool builds the way `bench/canvas.ts` does: each build
 * on its own copy and daemon, `--rounds` interleaved, the commit of each
 * printed with its numbers, and every figure reported as the median of the
 * rounds beside the worst round.
 *
 *   pnpm build && node bench/reload.ts --project <spool-bench>
 *   node bench/reload.ts --project <path> --page n200 --repeats 5 --out reload.json
 *   node bench/reload.ts --project <path> --page n200 --builds base=<checkout>,cand=<checkout> --rounds 2
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
	/** Which page to measure; the densest one when unnamed. */
	page: string | undefined;
}

/**
 * The arms. `stock` is the canvas as shipped; `flows blocked` is the null
 * control for the link graph, aborting its request. The canvas tolerates it by
 * design — the arrows are missing and every other thing on screen is identical.
 *
 * The control is not free. Playwright intercepts every request once any route
 * is set, matching the pattern on its own side, so the blocked arm also pays a
 * driver round trip per cover and loses the page's HTTP cache: its "warm" row
 * is a cold measurement wearing the wrong label. Read the warm row of `stock`
 * only, and read the arms' cold rows against each other knowing that.
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
	let page: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--project" && next !== undefined) {
			project = resolve(next);
			i++;
		} else if (arg === "--page" && next !== undefined) {
			page = next;
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
	return { project, repeats, headed, zoom, out, page };
}

interface CoverMark {
	load: number;
	decode?: number;
	/** Set when `decode()` was refused twice: the cover will never be measured as decoded. */
	refused?: string;
}

interface CoverWatch {
	marks: Record<string, CoverMark>;
	/** Every refused `decode()`, retries included, with the browser's own reason. */
	refusals: { frame: string; retry: boolean; reason: string }[];
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
 *
 * A refused `decode()` is not a cover still on its way. An element replaced by a
 * newer one is no refusal, since its successor decodes the same address; any
 * other is retried once, and a second refusal marks the cover as one that will
 * never decode, so the wait can end and the report can say so.
 */
function watchCovers(): void {
	const marks: Record<string, CoverMark> = {};
	const refusals: CoverWatch["refusals"] = [];
	const seen = new WeakSet<Element>();
	const decode = (img: HTMLImageElement, alt: string, retry: boolean): void => {
		img.decode()
			.then(() => {
				const mark = marks[alt];
				if (mark !== undefined && mark.decode === undefined) mark.decode = performance.now();
			})
			.catch((error: unknown) => {
				if (!img.isConnected) return;
				const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
				refusals.push({ frame: alt, retry, reason });
				const mark = marks[alt];
				if (!retry) setTimeout(() => decode(img, alt, true), 100);
				else if (mark !== undefined && mark.decode === undefined) mark.refused = reason;
			});
	};
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
			decode(img, alt, false);
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
	(globalThis as unknown as { __covers: CoverWatch }).__covers = { marks, refusals };
}

const readCovers = (page: Page): Promise<CoverWatch> =>
	page.evaluate(() => (globalThis as unknown as { __covers: CoverWatch }).__covers);

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
	/** Page time at the last on-screen cover's `load` — bytes in hand for every one. */
	loadCompleteMs: number;
	/** Page time at the last on-screen cover's `decode` — the bar: every one holds a picture. */
	decodeCompleteMs: number;
	/** Page time at the last on-screen cover response — everything after this is not network. */
	lastResponseEndMs: number;
	coversLoaded: number;
	census: Census[];
	/** How long polling took to notice, so the census's scope is honest. */
	noticedAfterMs: number;
	/**
	 * Every on-screen cover's decode time, sorted. The shape is the whole
	 * argument: covers landing evenly across the window are a queue draining,
	 * covers landing together at the end are something releasing them all at once.
	 */
	decodeTimeline: number[];
	/** Every request, so a surprising total can be read back without re-running. */
	wire: WireRequest[];
	/** The link graph's daemon time, read once it answered; NaN when it never did. */
	flowsMs: number;
	/** Whether the link graph was still unanswered when the last cover decoded. */
	flowsAfterComplete: boolean;
	/** Refused `decode()` calls on any cover, first tries and retries. */
	refusals: CoverWatch["refusals"];
	/** On-screen covers whose decode was refused twice, so the bar left them out. */
	undecoded: string[];
	/** The one-minute load average as this reload began. */
	load1: number;
}

const POLL_MS = 40;

/**
 * Hold until every cover on screen holds a decoded picture or has had its
 * decode refused twice, then report the page's own timestamp of the last one.
 * Fails loudly rather than timing out into a plausible number: a run that
 * measures nothing reports it as fast, and this map has been bitten by that
 * twice.
 */
async function waitComplete(page: Page, expected: string[], timeoutMs: number): Promise<CoverWatch> {
	const deadline = Date.now() + timeoutMs;
	let covers: CoverWatch = { marks: {}, refusals: [] };
	const done = (name: string): boolean =>
		covers.marks[name]?.decode !== undefined || covers.marks[name]?.refused !== undefined;
	while (Date.now() < deadline) {
		covers = await readCovers(page);
		if (expected.every(done)) return covers;
		await page.waitForTimeout(POLL_MS);
	}
	const noLoad = expected.filter((name) => covers.marks[name] === undefined);
	const noDecode = expected.filter((name) => covers.marks[name] !== undefined && !done(name));
	const sample = (names: string[]): string =>
		names.length > 0 ? ` (${names.slice(0, 6).join(", ")}${names.length > 6 ? ", …" : ""})` : "";
	throw new Error(
		`the canvas never completed: ${noLoad.length} of ${expected.length} covers on screen never loaded${sample(noLoad)}` +
			`, ${noDecode.length} loaded but never decoded${sample(noDecode)}`,
	);
}

async function sample(page: Page, watch: CdpWatch, expected: string[], blocked: boolean): Promise<Sample> {
	watch.reset();
	const load1 = oneMinuteLoad();
	const started = Date.now();
	await page.reload({ waitUntil: "commit" });
	const covers = await waitComplete(page, expected, 60_000);
	const noticedAt = Date.now();
	// snapshot immediately: everything the frames fetch after completion is real
	// traffic but it is not what the reload bar is about
	const snapshot = new Map(watch.wire);
	const taken = census(snapshot);
	// the record's entries keep filling in after this, so this is read now
	const flowsAfterComplete = flowsOf(snapshot.values())?.waitMs === undefined;
	const responses = await readCoverResponses(page);
	const decoded = expected.filter((name) => covers.marks[name]?.decode !== undefined);
	const loads = expected.map((name) => covers.marks[name]?.load ?? Number.NaN);
	const decodes = decoded.map((name) => covers.marks[name]?.decode ?? Number.NaN);
	const wanted = new Set(expected);
	const ends = responses.filter((entry) => wanted.has(entry.frame)).map((entry) => entry.responseEnd);
	// The canvas no longer waits for the link graph (#109), so its request can
	// still be unanswered when the last cover decodes, and the snapshot above
	// holds no time for it. Its daemon time is read from the live record once it
	// lands; the blocked arm aborted it, so it never will.
	let flows = flowsOf(watch.wire.values());
	const flowsDeadline = Date.now() + 15_000;
	while (!blocked && flows?.waitMs === undefined && Date.now() < flowsDeadline) {
		await page.waitForTimeout(100);
		flows = flowsOf(watch.wire.values());
	}
	return {
		loadCompleteMs: Math.max(...loads),
		decodeCompleteMs: decodes.length > 0 ? Math.max(...decodes) : Number.NaN,
		lastResponseEndMs: ends.length > 0 ? Math.max(...ends) : Number.NaN,
		coversLoaded: expected.filter((name) => covers.marks[name] !== undefined).length,
		census: taken,
		noticedAfterMs: noticedAt - started,
		decodeTimeline: [...decodes].sort((a, b) => a - b),
		wire: [...snapshot.values()],
		flowsMs: flows?.waitMs ?? Number.NaN,
		flowsAfterComplete,
		refusals: covers.refusals,
		undecoded: expected.filter((name) => covers.marks[name]?.decode === undefined),
		load1,
	};
}

const kb = (bytes: number): string => (bytes === 0 ? "0" : `${(bytes / 1024).toFixed(0)} KB`);

interface Run {
	arm: ArmLabel;
	cache: "cold" | "warm";
	samples: Sample[];
}

/** One round of one build: its timed cover preparation, then its reloads. */
interface Round {
	coverMs: number;
	coverLoad: number;
	runs: Run[];
}

/**
 * The canvas's read of the link graph, which the null control removes. A boot
 * asks for it twice, and on a cold cache the first ask is never answered, so
 * the answered one is the one timed.
 */
function flowsOf(wire: Iterable<WireRequest>): WireRequest | undefined {
	const reads = [...wire].filter((entry) => entry.method === "GET" && /\/flows$/.test(entry.url.split("?")[0] ?? ""));
	return reads.find((entry) => entry.waitMs !== undefined) ?? reads[0];
}

/** The frames a camera puts in the window: the covers a person sees after a reload. */
function onScreen(boxes: readonly FrameBox[], camera: Camera): FrameBox[] {
	return boxes.filter((box) => {
		const left = camera.x + box.x * camera.k;
		const top = camera.y + box.y * camera.k;
		return (
			left < VIEWPORT.width && top < VIEWPORT.height && left + box.w * camera.k > 0 && top + box.h * camera.k > 0
		);
	});
}

const range = (values: number[]): string => {
	const low = Math.min(...values).toFixed(1);
	const high = Math.max(...values).toFixed(1);
	return low === high ? low : `${low} to ${high}`;
};

/**
 * One build's reloads, read round by round: each figure is taken as a median
 * within its round, then reported as the median of those rounds and as the
 * worst round whole, so one slow round is visible and one fast round cannot
 * hide the rest. The single-sample tables read the last round's last reload.
 */
function report(rounds: readonly Round[], onScreenCount: number, page: CanvasPage): string {
	const lines: string[] = [];
	const series = (run: Pick<Run, "arm" | "cache">): Sample[][] =>
		rounds.map((round) => round.runs.find((each) => each.arm === run.arm && each.cache === run.cache)?.samples ?? []);
	const within = (samples: Sample[], pick: (row: Sample) => number): number => median(samples.map(pick));
	const across = (perRound: Sample[][], pick: (row: Sample) => number): number =>
		median(perRound.map((samples) => within(samples, pick)));
	const kinds = rounds[0]?.runs ?? [];
	const coverGroup = (row: Sample): Census | undefined => row.census.find((group) => group.bucket === "cover");
	lines.push(
		`page "${page.page === ROOT_PAGE ? "root" : page.page}": ${onScreenCount} covers on screen of ${page.frames.length} frames`,
	);
	lines.push("");
	lines.push("### reload to every cover on screen decoded");
	lines.push("");
	lines.push(
		`| arm | cache | rounds × reloads | median of rounds | worst round: median / worst reload | last cover loaded | bar (2 s) | load |`,
	);
	lines.push(`|---|---|---|---|---|---|---|---|`);
	for (const run of kinds) {
		const perRound = series(run);
		const decode = (row: Sample): number => row.decodeCompleteMs;
		const medians = perRound.map((samples) => within(samples, decode));
		const worst = medians.indexOf(Math.max(...medians));
		const middle = median(medians);
		const worstReload = Math.max(...(perRound[worst] ?? []).map(decode));
		lines.push(
			`| ${run.arm} | ${run.cache} | ${perRound.length} × ${perRound[0]?.length ?? 0} | **${ms(middle)}** | round ${worst + 1}: ${ms(medians[worst] ?? Number.NaN)} / ${ms(worstReload)} | ${ms(across(perRound, (row) => row.loadCompleteMs))} | ${middle < 2000 ? "**pass**" : "**miss**"} | ${range(perRound.flat().map((row) => row.load1))} |`,
		);
	}
	lines.push("");
	lines.push("### what the covers were waiting for (median of rounds)");
	lines.push("");
	lines.push(`| arm | cache | covers queued | daemon per cover | \`/flows\` daemon time | complete |`);
	lines.push(`|---|---|---|---|---|---|`);
	for (const run of kinds) {
		const perRound = series(run);
		const late = perRound.flat().filter((row) => row.flowsAfterComplete).length;
		const flowsCell =
			run.arm === "flows blocked"
				? "— (blocked)"
				: `${ms(across(perRound, (row) => row.flowsMs))}${late > 0 ? ` (${late}/${perRound.flat().length} answered after complete)` : ""}`;
		lines.push(
			`| ${run.arm} | ${run.cache} | ${ms(across(perRound, (row) => coverGroup(row)?.queuedP50 ?? Number.NaN))} | ${ms(across(perRound, (row) => coverGroup(row)?.waitP50 ?? Number.NaN))} | ${flowsCell} | ${ms(across(perRound, (row) => row.decodeCompleteMs))} |`,
		);
	}
	lines.push("");
	lines.push("### where the time went (median of rounds)");
	lines.push("");
	lines.push(`| arm | cache | last cover response end | last cover decoded | gap: decode, paint, commit |`);
	lines.push(`|---|---|---|---|---|`);
	for (const run of kinds) {
		const perRound = series(run);
		const end = across(perRound, (row) => row.lastResponseEndMs);
		const decode = across(perRound, (row) => row.decodeCompleteMs);
		lines.push(`| ${run.arm} | ${run.cache} | ${ms(end)} | ${ms(decode)} | ${ms(decode - end)} |`);
	}
	lines.push("");
	lines.push("### decodes the browser refused");
	lines.push("");
	lines.push(
		`| arm | cache | refused first time | refused again on retry | on-screen covers never decoded | reasons |`,
	);
	lines.push(`|---|---|---|---|---|---|`);
	for (const run of kinds) {
		const rows = series(run).flat();
		const refusals = rows.flatMap((row) => row.refusals);
		const reasons = [...new Set(refusals.map((refusal) => refusal.reason))];
		lines.push(
			`| ${run.arm} | ${run.cache} | ${refusals.filter((refusal) => !refusal.retry).length} | ${refusals.filter((refusal) => refusal.retry).length} | ${rows.reduce((sum, row) => sum + row.undecoded.length, 0)} | ${reasons.length === 0 ? "—" : reasons.slice(0, 3).join("; ")} |`,
		);
	}
	const last = (run: Run): Sample | undefined => series(run).at(-1)?.at(-1);
	lines.push("");
	lines.push("### how the covers arrived (last reload)");
	lines.push("");
	lines.push(`| arm | cache | first | p50 | last | window | shape |`);
	lines.push(`|---|---|---|---|---|---|---|`);
	for (const run of kinds) {
		const line = last(run)?.decodeTimeline;
		if (line === undefined) continue;
		const first = line[0] ?? Number.NaN;
		const end = line.at(-1) ?? Number.NaN;
		const middle = median(line);
		const position = (middle - first) / Math.max(1, end - first);
		lines.push(
			`| ${run.arm} | ${run.cache} | ${ms(first)} | ${ms(middle)} | ${ms(end)} | ${ms(end - first)} | ${position > 0.35 && position < 0.65 ? "even — a queue draining" : position >= 0.65 ? "back-loaded" : "front-loaded"} |`,
		);
	}
	lines.push("");
	lines.push("### what it fetched, up to completion (last reload)");
	lines.push("");
	lines.push(
		`| arm | cache | what | requests | transferred | 304 | from cache | conns | queued p50/worst | daemon p50/worst |`,
	);
	lines.push(`|---|---|---|---|---|---|---|---|---|---|`);
	for (const run of kinds) {
		for (const group of last(run)?.census ?? []) {
			lines.push(
				`| ${run.arm} | ${run.cache} | ${group.bucket} | ${group.requests} | ${kb(group.bytes)} | ${group.notModified} | ${group.fromCache} | ${group.connections} | ${ms(group.queuedP50)} / ${ms(group.queuedWorst)} | ${ms(group.waitP50)} / ${ms(group.waitWorst)} |`,
			);
		}
	}
	lines.push("");
	lines.push("### do covers revalidate (last reload)");
	lines.push("");
	lines.push(`| arm | cache | cover requests | sent if-none-match | answered with an etag | 304 | cache-control |`);
	lines.push(`|---|---|---|---|---|---|---|`);
	for (const run of kinds) {
		const covers = (last(run)?.wire ?? []).filter((entry) => entry.url.includes("/covers/"));
		const directives = new Set(covers.map((entry) => entry.cacheControl).filter((value) => value !== undefined));
		lines.push(
			`| ${run.arm} | ${run.cache} | ${covers.length} | ${covers.filter((entry) => entry.sentIfNoneMatch === true).length} | ${covers.filter((entry) => entry.gotEtag === true).length} | ${covers.filter((entry) => entry.status === 304).length} | ${directives.size === 0 ? "—" : [...directives].join(", ")} |`,
		);
	}
	lines.push("");
	const lag = median(
		rounds.flatMap((round) => round.runs.flatMap((run) => run.samples.map((row) => row.noticedAfterMs))),
	);
	lines.push(
		`Completion times are the page's own \`performance.now()\`, measured from that document's navigation start. ` +
			`The census is snapshotted when polling noticed, ${ms(lag)} of wall clock after the reload was ` +
			`issued, so it is a ceiling on what the reload fetched rather than an exact cut.`,
	);
	return lines.join("\n");
}

function coverTable(subjects: readonly Subject[], results: readonly BuildRun<Round>[], frames: number): string {
	const lines = [
		`### cover preparation, no covers to all ${frames}`,
		"",
		"| build | rounds | median | worst round | each round | load |",
		"|---|---|---|---|---|---|",
	];
	for (const { build } of subjects) {
		const mine = results.filter((result) => result.build === build.label).map((result) => result.result);
		const took = mine.map((round) => round.coverMs / 1000);
		lines.push(
			`| ${build.label} | ${took.length} | **${median(took).toFixed(1)} s** | ${Math.max(...took).toFixed(1)} s | ${took.map((value) => value.toFixed(1)).join(", ")} | ${range(mine.map((round) => round.coverLoad))} |`,
		);
	}
	return lines.join("\n");
}

async function main(): Promise<void> {
	const { builds, rounds, rest } = takeBuildOptions(process.argv.slice(2));
	const options = parseArgs(rest);
	const { subjects, page: measured } = await startSubjects(options.project, builds, options.page);
	try {
		const camera = planCamera(measured.frames, VIEWPORT.width, VIEWPORT.height, options.zoom);
		const pictures = planCamera(measured.frames, VIEWPORT.width, VIEWPORT.height, DEFAULT_ZOOM);
		// What a person sees after a reload is the covers in the window. A page
		// larger than the window has covers nobody is looking at, and the browser
		// is free to put off decoding those.
		const visible = onScreen(measured.frames, camera).map((box) => box.name);
		if (visible.length === 0) throw new Error(`the planned camera at k=${options.zoom} shows no frame`);
		const browser = await chromium.launch({
			channel: options.headed ? "chromium" : "chromium-headless-shell",
			headless: !options.headed,
		});
		let results: BuildRun<Round>[];
		try {
			// One untimed preparation per build first. A fresh daemon compiles every
			// frame document it is asked for, so a first-ever preparation prices the
			// toolchain; the timed ones below meet a daemon that has been up a while.
			for (const subject of subjects) {
				process.stderr.write(`bench: warming ${subject.build.label}\n`);
				writeCamera(subject.root, pictures, measured.page);
				await prepareCurrentCovers(browser, subject.url, subject.root, measured.frames);
			}

			results = await interleave(subjects, rounds, async (subject): Promise<Round> => {
				// the picture job from nothing: every cover gone, then the canvas opened
				clearCopiedCovers(subject.root);
				writeCamera(subject.root, pictures, measured.page);
				const coverLoad = oneMinuteLoad();
				const coverMs = await prepareCurrentCovers(browser, subject.url, subject.root, measured.frames);
				writeCamera(subject.root, camera, measured.page);

				const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
				try {
					const page = await context.newPage();
					await page.addInitScript(watchCovers);
					const watch = await watchNetwork(context, page);

					// One discarded pass first, and it is not the cold measurement. A
					// reload on a machine somebody is working on meets a daemon that has
					// been up for hours, so the honest cold case is a cold *browser* cache
					// against a warm daemon, which is what clearing the cache below gives.
					await page.goto(subject.url, { waitUntil: "commit" });
					await waitComplete(page, visible, 90_000);

					const session = await context.newCDPSession(page);
					const runs: Run[] = [];
					for (const arm of ARMS) {
						if (arm.blockFlows) await page.route(/\/api\/p\/[^/]+\/flows$/, (route) => void route.abort());
						for (const cache of ["cold", "warm"] as const) {
							const samples: Sample[] = [];
							for (let i = 0; i < options.repeats; i++) {
								if (cache === "cold") await session.send("Network.clearBrowserCache");
								const taken = await sample(page, watch, visible, arm.blockFlows);
								const refused = taken.refusals.length > 0 ? `, ${taken.refusals.length} decodes refused` : "";
								process.stderr.write(
									`bench:   ${arm.label} / ${cache} ${i + 1}/${options.repeats} — ${ms(taken.decodeCompleteMs)} ms at load ${taken.load1.toFixed(1)}${refused}\n`,
								);
								samples.push(taken);
							}
							runs.push({ arm: arm.label, cache, samples });
						}
						if (arm.blockFlows) await page.unroute(/\/api\/p\/[^/]+\/flows$/);
					}
					return { coverMs, coverLoad, runs };
				} finally {
					await context.close();
				}
			});
		} finally {
			await browser.close();
		}

		const sections = [buildsHeader(subjects, results, rounds), coverTable(subjects, results, measured.frames.length)];
		for (const { build } of subjects) {
			const mine = results.filter((result) => result.build === build.label).map((result) => result.result);
			sections.push(
				`${subjects.length > 1 ? `## build ${build.label}\n\n` : ""}${report(mine, visible.length, measured)}`,
			);
		}
		process.stdout.write(`${sections.join("\n\n")}\n`);
		if (options.out !== undefined) {
			writeFileSync(
				options.out,
				`${JSON.stringify(
					{
						page: measured.page,
						frames: measured.frames.map((box) => box.name),
						onScreen: visible,
						builds: subjects.map((subject) => subject.build),
						results,
					},
					null,
					"\t",
				)}\n`,
			);
			process.stderr.write(`bench: wrote ${options.out}\n`);
		}
	} finally {
		stopSubjects(subjects);
	}
}

await main();
