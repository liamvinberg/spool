import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { type Browser, type BrowserContext, type CDPSession, chromium, type Frame, type Page } from "playwright-core";
import {
	type Page as CanvasPage,
	copyProject,
	DEFAULT_ZOOM,
	densestPage,
	freePort,
	ms,
	namedPage,
	planCamera,
	quantile,
	startDaemon,
	VIEWPORT,
	writeCamera,
} from "./harness.ts";

/**
 * Where a frame's arrival goes (#90). #82 measured arrival at 2.6 s with 10
 * documents mounted and 3.4 s with 35, against a 1 s bar; #85 then mounted one
 * frame on its own and got 110 ms, cold or warm. So the missing seconds are not
 * in a frame's boot — they appear only when a canvas mounts many. This run
 * breaks one arrival into the phases between the iframe entering the DOM and
 * that frame's own `loaded` report, and prices each.
 *
 * Two instruments, because neither alone is enough:
 *
 *   - Each frame's own Performance timeline gives the phase boundaries. It is
 *     complete by construction (the entries exist whether or not anything was
 *     watching) but the daemon sends no Timing-Allow-Origin, so a frame's view
 *     of a cross-origin fetch is start, end, and nothing in between.
 *   - CDP Network fills that in: connection id and reuse, disk-cache hits,
 *     304 against 200, and the split between waiting for a connection and
 *     waiting for the daemon. It can only report what it was attached for, so
 *     it is the detail, never the boundary.
 *
 * The page's own session sees the frame documents, because an out-of-process
 * subframe's navigation is the browser's request. Everything a frame asks for
 * after that belongs to the frames' renderers, so each frame document gets a
 * session of its own; request ids come from the network service and so are
 * unique browser-wide, which makes the duplicate events free to drop.
 *
 * Three arms, two of them the default (#106): `shipped` and `inlined` both abort
 * the flows call and differ only in what a frame document carries, and `stock`
 * is #103's untouched canvas. The payload is a runtime switch on the daemon, so
 * every arm shares one daemon, one warmed spool dir and one frozen subject.
 *
 * That switch is #106's own daemon hack and is not in this repo, so `inlined`
 * aborts the run until someone re-applies it. Loudly, on purpose: an arm that
 * silently fell back to the shipped document would report the payload
 * comparison as a wash. Name the arms that exist to run today.
 *
 *   pnpm build
 *   node bench/arrival.ts --project ~/projects/matmannen-fc63dba --headed --arms stock,shipped
 *   node bench/arrival.ts --project <path> --arms stock,shipped --repeats 2
 *   node bench/arrival.ts --project <path> --zoom 0.16,0.36 --out arrival.json
 *
 * Run it with node's own type stripping, not tsx: the collector below is
 * serialized into the page by playwright, and esbuild's keep-names transform
 * wraps every function in a `__name` helper that does not exist there.
 */

interface Options {
	project: string;
	/** Use the project where it stands instead of copying it. */
	inPlace: boolean;
	/** A spool dir to reuse, so a sweep's arms share one warm webfont cache. */
	spoolDir: string | undefined;
	/** Measure this page rather than the one holding the most frames. */
	page: string | undefined;
	zooms: number[];
	headed: boolean;
	/** Which arms to take, in order. Both by default — the A/B is same-session. */
	arms: Arm[];
	/** Passes per arm per zoom, so a headline can be checked against a replicate. */
	repeats: number;
	out: string | undefined;
}

type ArmLabel = "stock" | "shipped" | "inlined";

interface Arm {
	label: ArmLabel;
	/** Abort `GET /api/p/:project/flows` — #98's null control, 6.8 s of daemon thread. */
	blockFlows: boolean;
	/** #106: serve #92's one-request document instead of the shipped seven-request one. */
	inline: boolean;
}

/**
 * The arms. `stock` is #103's untouched canvas, kept because it is the only row
 * that shows what the flows call costs; `shipped` and `inlined` are #106's pair.
 *
 * **Both of #106's arms abort `/flows`**, and that is the whole point. #103
 * measured 97% of arrival to be that one synchronous handler, so with it in
 * front the payload is invisible — #92's own A/B ran with the block inside both
 * arms and attributed its gain to round trips that were only expensive because
 * each one waited behind a held thread.
 *
 * All of them run in one process against one daemon and one warmed spool dir. A
 * second invocation would re-copy the subject and re-warm the compile cache
 * between the halves of the comparison, which is why the payload is a runtime
 * switch on the daemon rather than a build of its own.
 */
const ALL_ARMS: Arm[] = [
	{ label: "stock", blockFlows: false, inline: false },
	{ label: "shipped", blockFlows: true, inline: false },
	{ label: "inlined", blockFlows: true, inline: true },
];

/** #106's question is what the payload buys, so the two payload arms are the default. */
const DEFAULT_ARMS: Arm[] = ALL_ARMS.filter((arm) => arm.label !== "stock");

function parseArgs(argv: string[]): Options {
	let project = "";
	let inPlace = false;
	let spoolDir: string | undefined;
	let page: string | undefined;
	let zooms = [DEFAULT_ZOOM];
	let headed = true;
	let arms = DEFAULT_ARMS;
	let repeats = 1;
	let out: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--project" && next !== undefined) {
			project = resolve(next);
			i++;
		} else if (arg === "--spool-dir" && next !== undefined) {
			spoolDir = resolve(next);
			i++;
		} else if (arg === "--page" && next !== undefined) {
			page = next;
			i++;
		} else if (arg === "--zoom" && next !== undefined) {
			zooms = next.split(",").map((zoom) => Number(zoom.trim()));
			i++;
		} else if (arg === "--repeats" && next !== undefined) {
			repeats = Number(next);
			i++;
		} else if (arg === "--out" && next !== undefined) {
			out = resolve(next);
			i++;
		} else if (arg === "--arms" && next !== undefined) {
			const wanted = next.split(",").map((label) => label.trim());
			const unknown = wanted.filter((label) => !ALL_ARMS.some((arm) => arm.label === label));
			if (unknown.length > 0) {
				throw new Error(`unknown arm${unknown.length === 1 ? "" : "s"} ${unknown.join(", ")}`);
			}
			arms = wanted.map((label) => ALL_ARMS.find((arm) => arm.label === label) as Arm);
			i++;
		} else if (arg === "--in-place") {
			inPlace = true;
		} else if (arg === "--headed") {
			headed = true;
		} else if (arg === "--headless") {
			headed = false;
		} else {
			throw new Error(`unknown argument ${arg}`);
		}
	}
	if (project === "") throw new Error("--project <path to a spool project root> is required");
	if (zooms.some((zoom) => !Number.isFinite(zoom) || zoom <= 0)) throw new Error("--zoom takes positive scales");
	if (!Number.isInteger(repeats) || repeats < 1) throw new Error("--repeats takes a positive whole number");
	return { project, inPlace, spoolDir, page, zooms, headed, arms, repeats, out };
}

/**
 * The subject, and where its daemon keeps state. A sweep wants both pinned:
 * copying per arm gives each one a cold webfont cache, so the stock arm has the
 * daemon fetching Google mid-measurement while an inlined arm paid for it during
 * its warm pass. Sharing a spool dir across *copies* does not work either — each
 * copy registers the same project name and the daemon then answers 409 — so
 * sharing the cache means using one root.
 */
function subject(options: Options): { root: string; name: string; spoolDir: string } {
	if (!options.inPlace) {
		const copied = copyProject(options.project);
		return options.spoolDir === undefined ? copied : { ...copied, spoolDir: options.spoolDir };
	}
	const root = options.project;
	if (!existsSync(join(root, "design", "canvas.json"))) throw new Error(`${root} has no design/canvas.json`);
	const spoolDir = options.spoolDir ?? join(root, ".spool-bench");
	mkdirSync(spoolDir, { recursive: true });
	writeFileSync(join(spoolDir, "config.json"), `${JSON.stringify({ updateCheck: false })}\n`);
	return { root, name: basename(root), spoolDir };
}

const pageToMeasure = (root: string, name: string | undefined): CanvasPage =>
	name === undefined ? densestPage(root) : namedPage(root, name);

/**
 * Flip the daemon's frame compiler between the shipped document and #92's
 * one-request shape (#106). The switch is throwaway daemon code, and a run that
 * silently measured the wrong payload would be indistinguishable from a null
 * result, so the daemon answers with the state it ended up in and this refuses
 * to continue unless it is the one asked for.
 */
async function setInline(controlUrl: string, on: boolean): Promise<void> {
	const response = await fetch(`${controlUrl}/__bench/inline?on=${on ? "1" : "0"}`);
	if (!response.ok) {
		// #106's daemon hack is throwaway and was reverted with the ticket, so a
		// stock daemon has no switch. That is only fatal for an arm that needs it:
		// asking a stock daemon for the stock payload is a no-op, and refusing to
		// run `stock` and `shipped` on a clean tree would retire this instrument.
		if (!on) return;
		throw new Error(
			`the daemon has no /__bench/inline switch (${response.status}) — the inlined arm needs #106's daemon hack, which is reverted; run --arms stock,shipped instead`,
		);
	}
	const { inline } = (await response.json()) as { inline: boolean };
	if (inline !== on) throw new Error(`the daemon reported inline=${inline} after being asked for ${on}`);
}

// --- what the top document records -------------------------------------------

interface Stamped {
	frame: string;
	t: number;
}

interface HostState {
	origin: number;
	inserted: Stamped[];
	loaded: Stamped[];
	/** When the canvas *saw* each frame ask for its session (#105). */
	sessionAsked: Stamped[];
}

/**
 * Installed in the top document only: an init script runs in every frame, and
 * 88 copies of a MutationObserver would be measuring their own cost. This is
 * the only clock that sees a frame enter the DOM, and the only one that sees
 * its `loaded` report — arrival is the distance between them.
 */
function hostCollector(): void {
	if (window !== window.top) return;
	const state = { origin: performance.timeOrigin, inserted: [], loaded: [], sessionAsked: [] } as unknown as HostState;
	(globalThis as unknown as { __arrival: HostState }).__arrival = state;

	// Registered from an init script, so this runs before the canvas's own
	// handler: `session?` is stamped as the canvas's thread *reached* it, and
	// the reply the canvas posts a moment later is stamped in the frame. The
	// two together split #103's `evaluate + session handshake` (#105).
	window.addEventListener(
		"message",
		(event: MessageEvent) => {
			const data = event.data as { spool?: unknown; frame?: unknown } | null;
			if (data === null || typeof data !== "object") return;
			if (data.spool === "loaded" && typeof data.frame === "string") {
				state.loaded.push({ frame: data.frame, t: performance.now() });
			} else if (data.spool === "session?" && typeof data.frame === "string") {
				state.sessionAsked.push({ frame: data.frame, t: performance.now() });
			}
		},
		true,
	);

	const noteIframe = (node: Node): void => {
		if (node instanceof HTMLIFrameElement) state.inserted.push({ frame: node.title, t: performance.now() });
		else if (node instanceof HTMLElement) {
			for (const nested of node.querySelectorAll("iframe")) {
				state.inserted.push({ frame: nested.title, t: performance.now() });
			}
		}
	};
	// document, not documentElement: an init script runs before <html> exists
	new MutationObserver((records) => {
		for (const record of records) for (const node of record.addedNodes) noteIframe(node);
	}).observe(document, { childList: true, subtree: true });
}

// --- what each frame's own timeline says --------------------------------------

interface FrameProbe {
	/** When the canvas's `session` reply landed here. Undefined if it never did. */
	sessionReply: number | undefined;
}

/**
 * The frame half of the handshake probe (#105). `requestHostSession` posts
 * `session?` and waits up to 250 ms for the reply, so the reply's arrival is the
 * moment the frame's own evaluation resumes. Registered from an init script, so
 * it is ahead of the runtime's own listener; a cross-origin `parent.postMessage`
 * cannot be patched, which is why the *outgoing* half is stamped on the host.
 */
function frameCollector(): void {
	if (window === window.top) return;
	const probe = { sessionReply: undefined } as FrameProbe;
	(globalThis as unknown as { __arrivalFrame: FrameProbe }).__arrivalFrame = probe;
	window.addEventListener(
		"message",
		(event: MessageEvent) => {
			const data = event.data as { spool?: unknown } | null;
			if (data === null || typeof data !== "object") return;
			if (data.spool === "session" && probe.sessionReply === undefined) probe.sessionReply = performance.now();
		},
		true,
	);
}

interface Timed {
	name: string;
	start: number;
	end: number;
}

interface FrameTimeline {
	url: string;
	origin: number;
	/** Absent if the frame navigated again; such a frame is dropped rather than guessed at. */
	nav:
		| {
				requestStart: number;
				responseStart: number;
				responseEnd: number;
				domInteractive: number;
				domContentLoadedEventStart: number;
		  }
		| undefined;
	resources: Timed[];
	/** This frame's clock for the canvas's session reply, undefined if none came. */
	sessionReply: number | undefined;
}

/**
 * Read inside every frame after the canvas settles. Cross-origin entries carry
 * no detail without Timing-Allow-Origin, but startTime and responseEnd survive,
 * and those are the phase boundaries. The navigation entry is same-origin with
 * its own document, so that one is whole.
 */
function frameTimeline(): FrameTimeline {
	const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
	return {
		url: location.href,
		origin: performance.timeOrigin,
		nav:
			nav === undefined
				? undefined
				: {
						requestStart: nav.requestStart,
						responseStart: nav.responseStart,
						responseEnd: nav.responseEnd,
						domInteractive: nav.domInteractive,
						domContentLoadedEventStart: nav.domContentLoadedEventStart,
					},
		resources: performance.getEntriesByType("resource").map((entry) => ({
			name: entry.name,
			start: entry.startTime,
			end: (entry as PerformanceResourceTiming).responseEnd,
		})),
		sessionReply: (globalThis as unknown as { __arrivalFrame?: FrameProbe }).__arrivalFrame?.sessionReply,
	};
}

// --- what CDP saw on the wire -------------------------------------------------

interface WireRequest {
	url: string;
	method: string;
	/** Browser-clock seconds, comparable only to other CDP timestamps. */
	sent: number;
	status?: number | undefined;
	fromDiskCache?: boolean | undefined;
	connectionId?: number | undefined;
	connectionReused?: boolean | undefined;
	protocol?: string | undefined;
	/** Waiting for a connection: the pool's queue, not the daemon's. */
	queuedMs?: number | undefined;
	/** Request written to first response byte: the daemon thinking. */
	waitMs?: number | undefined;
	finishedAt?: number | undefined;
	bytes?: number | undefined;
}

interface CdpTiming {
	requestTime: number;
	sendStart: number;
	sendEnd: number;
	receiveHeadersEnd: number;
}

/** Both halves of the traffic: the page target for documents, the frames' renderers for the rest. */
async function watchNetwork(context: BrowserContext, page: Page): Promise<Map<string, WireRequest>> {
	const wire = new Map<string, WireRequest>();
	const attach = async (session: CDPSession): Promise<void> => {
		session.on(
			"Network.requestWillBeSent",
			(payload: { requestId: string; request: { url: string; method: string }; timestamp: number }) => {
				if (wire.has(payload.requestId)) return;
				wire.set(payload.requestId, {
					url: payload.request.url,
					method: payload.request.method,
					sent: payload.timestamp,
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
					connectionReused?: boolean;
					protocol?: string;
					timing?: CdpTiming;
				};
			}) => {
				const entry = wire.get(payload.requestId);
				if (entry === undefined) return;
				const { status, fromDiskCache, connectionId, connectionReused, protocol, timing } = payload.response;
				entry.status = status;
				entry.fromDiskCache = fromDiskCache;
				entry.connectionId = connectionId;
				entry.connectionReused = connectionReused;
				entry.protocol = protocol;
				if (timing !== undefined) {
					entry.queuedMs = timing.sendStart;
					entry.waitMs = timing.receiveHeadersEnd - timing.sendEnd;
				}
			},
		);
		session.on(
			"Network.loadingFinished",
			(payload: { requestId: string; timestamp: number; encodedDataLength: number }) => {
				const entry = wire.get(payload.requestId);
				if (entry === undefined) return;
				entry.finishedAt = payload.timestamp;
				entry.bytes = payload.encodedDataLength;
			},
		);
		await session.send("Network.enable");
	};

	// The page target sees the frame documents: an out-of-process subframe's
	// navigation is the browser's request, not the frame's.
	await attach(await context.newCDPSession(page));

	// Everything a frame asks for after that — its module graph, its scenario —
	// belongs to the frames' own renderer, and only a session on that target
	// reports it. Chromium splits those frames across more than one renderer and
	// does not say which, so every frame document gets a session and the ones
	// that land on a renderer already watched cost only duplicate events, which
	// are free: the network service issues request ids, so they are unique
	// browser-wide and every handler above is keyed by them. The canvas also
	// mounts a capture host, which is why only frame documents qualify.
	const FRAME_SESSIONS = 48;
	const watched = new Set<string>();
	const watch = (frame: Frame): void => {
		const url = frame.url();
		if (watched.size >= FRAME_SESSIONS || !FRAME_DOC.test(url) || watched.has(url)) return;
		watched.add(url);
		void context
			.newCDPSession(frame)
			.then(attach)
			.catch(() => {
				// same-process frame: the page session already sees its traffic
				watched.delete(url);
			});
	};
	// attached fires before the src is known for some frames and after for
	// others; navigated always carries the final url
	page.on("frameattached", watch);
	page.on("framenavigated", watch);
	return wire;
}

// --- joining the three views --------------------------------------------------

const VENDOR = /\/vendor\//;
/**
 * The import map's three pins, and only those: `/vendor/webfont/` and
 * `/vendor/fonts/` are also under /vendor/ but are fetched by the stylesheet
 * long after the module graph is resolved, so counting them as modules puts a
 * font's download inside the boot's critical path, where it never was.
 */
const MODULE_JS = /\/vendor\/(spool|react|spool-jsx)\.js(?:\?|$)/;
/** The project's own faces, re-pointed at this daemon by `webfonts.resolve` (#80). */
const WEBFONT = /\/vendor\/webfont\//;
const SCENARIO = /\/scenarios\//;
const FRAME_DOC = /\/frames\//;

function frameNameFromUrl(url: string): string | undefined {
	const match = /\/frames\/(.+?)(?:\?|$)/.exec(url);
	if (match?.[1] === undefined) return undefined;
	return decodeURIComponent(match[1]);
}

/** Every phase is a wall-clock span in the one absolute (epoch) clock all three views share. */
interface Phases {
	frame: string;
	arrival: number;
	commit: number;
	document: number;
	parse: number;
	modules: number;
	seed: number;
	/**
	 * #105 splits `seed` into the three things it could be. `graph` needs no probe;
	 * the other two are undefined on a frame the handshake probe missed an end of,
	 * so a partial join is visible rather than averaged in.
	 */
	graph: number;
	evaluate: number | undefined;
	handshake: number | undefined;
	seedTail: number | undefined;
	/** How many CDN modules this frame's own graph pulled before it was seeded. */
	cdnRequests: number;
	scenario: number;
	render: number;
	/** What the named spans do not account for — they overlap, so this is printed, never hidden. */
	residual: number;
}

function phasesFor(
	name: string,
	insertedAt: number,
	loadedAt: number,
	timeline: FrameTimeline,
	askedAt: number | undefined,
): Phases | undefined {
	const { nav, origin, resources } = timeline;
	if (nav === undefined) return undefined;
	const at = (t: number): number => origin + t;
	const modules = resources.filter((entry) => MODULE_JS.test(entry.name));
	// A frame asks for its scenario twice. Only the first is on the way to the
	// first render; taking the later one's end would charge this boot for a
	// fetch that happened after it.
	const scenario = resources
		.filter((entry) => SCENARIO.test(entry.name))
		.sort((left, right) => left.start - right.start)[0];

	const docEnd = at(nav.responseEnd);
	const moduleStart = modules.length === 0 ? docEnd : at(Math.min(...modules.map((entry) => entry.start)));
	const moduleEnd = modules.length === 0 ? docEnd : at(Math.max(...modules.map((entry) => entry.end)));
	const scenarioStart = scenario === undefined ? moduleEnd : at(scenario.start);
	const scenarioEnd = scenario === undefined ? moduleEnd : at(scenario.end);
	const replyAt = timeline.sessionReply === undefined ? undefined : at(timeline.sessionReply);

	// The frame's *own* module graph (#105). `buildDesignEntry` compiles with
	// `packages: "external"`, so a bare specifier the project pins in its
	// `shared/importmap.json` is left for the browser and fetched as a dependency
	// of the inline boot module — on any host but this document's. A module graph
	// evaluates only once every edge of it has arrived, so these sit *inside* the
	// span between the vendor pins landing and the frame being seeded, and none of
	// them is spool's payload. Entries that began after the scenario fetch are a
	// later dynamic import, not this boot.
	// http(s) only: a `data:` or `blob:` entry has no host, so a bare host
	// comparison would file every inlined asset as someone else's CDN.
	const docHost = hostOf(timeline.url);
	const cdn = resources.filter(
		(entry) =>
			entry.name.startsWith("http") &&
			!SCENARIO.test(entry.name) &&
			hostOf(entry.name) !== docHost &&
			at(entry.start) < scenarioStart,
	);
	const cdnEnd = cdn.length === 0 ? moduleEnd : Math.max(moduleEnd, ...cdn.map((entry) => at(entry.end)));

	const phases = {
		frame: name,
		arrival: loadedAt - insertedAt,
		// the element is in the DOM; the browser has yet to give it a document
		commit: origin - insertedAt,
		document: docEnd - origin,
		// inline shim and config, the import map, and reaching the module script
		parse: moduleStart - docEnd,
		modules: moduleEnd - moduleStart,
		// module evaluation up to start(), which is where the session handshake waits
		seed: scenarioStart - moduleEnd,
		// #105 splits that span into the three things it could be. `spool` carries a
		// top-level `await start()`, so the whole graph resolves and evaluates, the
		// frame asks its host for the session, and only then does the scenario fetch
		// begin — the frame's own *bundled* code evaluates after all of it, inside
		// `render`, while the modules it left external are `graph`.
		graph: cdnEnd - moduleEnd,
		evaluate: askedAt === undefined ? undefined : askedAt - cdnEnd,
		handshake: askedAt === undefined || replyAt === undefined ? undefined : replyAt - askedAt,
		seedTail: replyAt === undefined ? undefined : scenarioStart - replyAt,
		cdnRequests: cdn.length,
		scenario: scenarioEnd - scenarioStart,
		// first React render, the commit-time effect, and the loaded post
		render: loadedAt - scenarioEnd,
		residual: 0,
	};
	// These fetches overlap, so the phases are spans rather than a partition.
	// The residual is what the named spans fail to account for, printed rather
	// than absorbed: a decomposition that does not add up should say so.
	phases.residual =
		phases.arrival -
		(phases.commit + phases.document + phases.parse + phases.modules + phases.seed + phases.scenario + phases.render);
	return phases;
}

/** The required spans: every decomposed row has all of these. */
type SolidPhase = keyof Omit<
	Phases,
	"frame" | "arrival" | "graph" | "evaluate" | "handshake" | "seedTail" | "cdnRequests"
>;
/** #105's split of `seed`. All but `graph` need the handshake probe to have caught both ends. */
type SplitPhase = "graph" | "evaluate" | "handshake" | "seedTail";

const PHASE_LABELS: { key: SolidPhase; label: string }[] = [
	{ key: "commit", label: "insert → document exists" },
	{ key: "document", label: "document request" },
	{ key: "parse", label: "parse + inline shim" },
	{ key: "modules", label: "module graph (vendor)" },
	{ key: "seed", label: "evaluate + session handshake" },
	{ key: "scenario", label: "scenario fetch" },
	{ key: "render", label: "first render → loaded" },
	{ key: "residual", label: "unaccounted (spans overlap)" },
];

const SPLIT_LABELS: { key: SplitPhase; label: string }[] = [
	{ key: "graph", label: "└ the project's own module graph still arriving (CDN)" },
	{ key: "evaluate", label: "└ the graph evaluates (→ frame asks for its session)" },
	{ key: "handshake", label: "└ handshake (canvas saw the ask → frame has the reply)" },
	{ key: "seedTail", label: "└ reply → scenario fetch begins" },
];

const sortedColumn = (rows: Phases[], pick: (row: Phases) => number): number[] => rows.map(pick).sort((a, b) => a - b);

function phaseTable(rows: Phases[]): string {
	const arrival = sortedColumn(rows, (row) => row.arrival);
	const total = arrival.reduce((sum, value) => sum + value, 0) / Math.max(1, arrival.length);
	const lines = [`| phase | p50 | p95 | worst | share of p50 arrival |`, `|---|---|---|---|---|`];
	const arrivalP50 = quantile(arrival, 0.5);
	const row = (label: string, sorted: number[]): void => {
		const p50 = quantile(sorted, 0.5);
		const share = arrivalP50 > 0 ? `${((p50 / arrivalP50) * 100).toFixed(0)}%` : "—";
		lines.push(
			`| ${label} | ${ms(p50)} | ${ms(quantile(sorted, 0.95))} | ${ms(sorted.at(-1) ?? Number.NaN)} | ${share} |`,
		);
	};
	for (const { key, label } of PHASE_LABELS) {
		row(
			label,
			sortedColumn(rows, (entry) => entry[key]),
		);
		// the split rides directly under the span it decomposes, over the subset of
		// rows the probe caught — a partial join shows its own n rather than being
		// averaged into the whole
		if (key !== "seed") continue;
		for (const split of SPLIT_LABELS) {
			const covered = rows.filter((entry) => entry[split.key] !== undefined);
			if (covered.length === 0) {
				lines.push(`| ${split.label} | — | — | — | not probed |`);
				continue;
			}
			row(
				`${split.label} (n=${covered.length})`,
				sortedColumn(covered, (entry) => entry[split.key] ?? Number.NaN),
			);
		}
	}
	lines.push(
		`| **arrival (insert → loaded)** | **${ms(arrivalP50)}** | **${ms(quantile(arrival, 0.95))}** | **${ms(arrival.at(-1) ?? Number.NaN)}** | mean ${ms(total)} |`,
	);
	return lines.join("\n");
}

interface WireGroup {
	label: string;
	count: number;
	cached: number;
	notModified: number;
	reused: number;
	connections: number;
	queuedP50: number;
	waitP50: number;
	waitWorst: number;
	bytes: number;
}

function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return "(unparseable)";
	}
}

function groupWire(wire: Map<string, WireRequest>): WireGroup[] {
	const groups = new Map<string, WireRequest[]>();
	for (const entry of wire.values()) {
		if (entry.status === undefined) continue;
		// A preflight is its own round trip on its own queue slot; folding it into
		// the request it precedes would halve the apparent request count and hide
		// that project data costs two trips, not one.
		const preflight = entry.method === "OPTIONS" ? " (preflight)" : "";
		// Everything spool did not serve, bucketed by host. Dropping it silently
		// made this table read as the whole of a frame's network, and it is not:
		// a project's own import map can put a CDN on the critical path, and then
		// most of a frame's requests belong to neither spool nor the browser.
		// every face is content-addressed under one path, so the last segment is a
		// hash: keying on it turned the render origin's whole font population into
		// ~74 one-request rows, which is exactly the number #102 has to read
		const label = WEBFONT.test(entry.url)
			? `vendor webfont (faces)${preflight}`
			: VENDOR.test(entry.url)
				? `vendor ${entry.url.slice(entry.url.lastIndexOf("/") + 1)}${preflight}`
				: SCENARIO.test(entry.url)
					? `scenario${preflight}`
					: FRAME_DOC.test(entry.url)
						? `frame document${preflight}`
						: `↳ ${hostOf(entry.url)}${preflight}`;
		const bucket = groups.get(label);
		if (bucket === undefined) groups.set(label, [entry]);
		else bucket.push(entry);
	}
	return [...groups]
		.map(([label, entries]) => {
			const queued = entries.map((entry) => entry.queuedMs ?? 0).sort((a, b) => a - b);
			const wait = entries.map((entry) => entry.waitMs ?? 0).sort((a, b) => a - b);
			return {
				label,
				count: entries.length,
				cached: entries.filter((entry) => entry.fromDiskCache === true).length,
				notModified: entries.filter((entry) => entry.status === 304).length,
				reused: entries.filter((entry) => entry.connectionReused === true).length,
				connections: new Set(entries.map((entry) => entry.connectionId).filter((id) => id !== undefined)).size,
				queuedP50: quantile(queued, 0.5),
				waitP50: quantile(wait, 0.5),
				waitWorst: wait.at(-1) ?? Number.NaN,
				bytes: entries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
			};
		})
		.sort((a, b) => b.count - a.count);
}

function wireTable(groups: WireGroup[]): string {
	const lines = [
		`| request | n | 304 | from cache | conn reused | distinct conns | queued p50 | daemon p50 / worst | KB |`,
		`|---|---|---|---|---|---|---|---|---|`,
	];
	for (const group of groups) {
		lines.push(
			`| ${group.label} | ${group.count} | ${group.notModified} | ${group.cached} | ${group.reused} | ${group.connections} | ${ms(group.queuedP50)} | ${ms(group.waitP50)} / ${ms(group.waitWorst)} | ${(group.bytes / 1024).toFixed(0)} |`,
		);
	}
	return lines.join("\n");
}

/**
 * How many requests the origin had open at once. The daemon is one HTTP/1.1
 * host, so this is the ceiling that turns a burst of mounts into a queue.
 */
function peakInFlight(wire: Map<string, WireRequest>): number {
	const edges: { t: number; delta: number }[] = [];
	for (const entry of wire.values()) {
		if (entry.finishedAt === undefined) continue;
		// the render host only: thumbnails and the ui bundle are the canvas's own
		// origin and queue somewhere else entirely
		if (!VENDOR.test(entry.url) && !SCENARIO.test(entry.url) && !FRAME_DOC.test(entry.url)) continue;
		edges.push({ t: entry.sent, delta: 1 }, { t: entry.finishedAt, delta: -1 });
	}
	edges.sort((a, b) => a.t - b.t || a.delta - b.delta);
	let open = 0;
	let peak = 0;
	for (const edge of edges) {
		open += edge.delta;
		if (open > peak) peak = open;
	}
	return peak;
}

// --- one run ------------------------------------------------------------------

interface RunResult {
	arm: ArmLabel;
	/** Which pass of this arm, so a headline can be read against its replicate. */
	repeat: number;
	zoom: number;
	mounted: number;
	measured: number;
	/** Why any frame fell out of the join, counted by reason. */
	dropped: Record<string, number>;
	/** A few of the dropped frames, with the numbers that disqualified them. */
	droppedSamples: string[];
	phases: Phases[];
	wire: WireGroup[];
	peakInFlight: number;
	wireSeen: number;
}

async function measure(
	context: BrowserContext,
	page: Page,
	url: string,
	zoom: number,
	arm: Arm,
	repeat: number,
): Promise<RunResult> {
	const { blockFlows } = arm;
	const wire = await watchNetwork(context, page);
	// #98's null control. `GET /api/p/:project/flows` is synchronous and
	// unmemoized and holds the daemon's only thread for 6.8 s on the 145-frame
	// subject; frame documents queue 5.5 s behind it, so every arrival number
	// taken without this carries that block inside it.
	if (blockFlows) await page.route(/\/api\/p\/[^/]+\/flows$/, (route) => void route.abort());
	await page.goto(url, { waitUntil: "domcontentloaded" });

	// Hold until the canvas stops mounting *and* every mounted frame has arrived.
	// Watching the iframe count alone stops 2.5 s after the final insert, which
	// is inside a slow frame's arrival: mounting quiesces in about three seconds
	// while a frame pulling a CDN module graph takes far longer, so every frame
	// is still booting when the count goes quiet, all of them drop for having no
	// loaded report, and the run prints an empty table over a working canvas.
	// Arrival is exactly the distance the wait must cover, so the wait ends on
	// the loaded reports, not on the elements.
	let mounted = 0;
	let loadedSeen = 0;
	let since = Date.now();
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		await page.waitForTimeout(150);
		const next = await page.evaluate(() => ({
			frames: document.querySelectorAll("iframe").length,
			loaded: (globalThis as unknown as { __arrival: HostState }).__arrival.loaded.length,
		}));
		if (next.frames !== mounted || next.loaded !== loadedSeen) {
			mounted = next.frames;
			loadedSeen = next.loaded;
			since = Date.now();
			continue;
		}
		const quiet = Date.now() - since;
		// every frame in: a short settle is enough. Otherwise keep waiting for the
		// stragglers, and give up only once the canvas has gone properly silent —
		// a frame that never reports is a drop the join will name.
		if (quiet >= 2500 && loadedSeen >= mounted) break;
		if (quiet >= 20_000) break;
	}

	const host = await page.evaluate(() => (globalThis as unknown as { __arrival: HostState }).__arrival);
	const firstInsert = new Map<string, number>();
	for (const entry of host.inserted) if (!firstInsert.has(entry.frame)) firstInsert.set(entry.frame, entry.t);
	const firstLoaded = new Map<string, number>();
	for (const entry of host.loaded) if (!firstLoaded.has(entry.frame)) firstLoaded.set(entry.frame, entry.t);
	const firstAsked = new Map<string, number>();
	for (const entry of host.sessionAsked) if (!firstAsked.has(entry.frame)) firstAsked.set(entry.frame, entry.t);

	// A silent join is the failure mode this whole run is exposed to: every
	// reason a frame drops out is counted, so an empty table says which step
	// lost it rather than just showing nothing.
	const dropped: Record<string, number> = {};
	const samples: string[] = [];
	const drop = (reason: string): undefined => {
		dropped[reason] = (dropped[reason] ?? 0) + 1;
		return undefined;
	};

	const phases: Phases[] = [];
	for (const frame of page.frames()) {
		if (frame === page.mainFrame()) continue;
		const name = frameNameFromUrl(frame.url());
		if (name === undefined) {
			drop("not a frame document");
			continue;
		}
		const inserted = firstInsert.get(name);
		const loaded = firstLoaded.get(name);
		if (inserted === undefined) {
			drop("no insert seen");
			continue;
		}
		if (loaded === undefined) {
			drop("no loaded report");
			continue;
		}
		let timeline: FrameTimeline;
		try {
			timeline = await frame.evaluate(frameTimeline);
		} catch {
			drop("frame unreadable");
			continue; // the frame went away while being read
		}
		const asked = firstAsked.get(name);
		const row = phasesFor(
			name,
			host.origin + inserted,
			host.origin + loaded,
			timeline,
			asked === undefined ? undefined : host.origin + asked,
		);
		if (row === undefined) {
			drop("no navigation entry");
			continue;
		}
		// a frame the canvas remounted has two inserts and one timeline; its
		// phases would not add up to its arrival, so it is dropped rather than
		// quietly averaged in
		// A MutationObserver reports an insertion a task after it happened, while
		// the navigation it triggers starts at the insertion itself, so `commit`
		// lands a millisecond or two negative on a frame the browser began
		// immediately. That is the observer's own latency, not a broken row —
		// only a frame the canvas genuinely remounted is off by enough to matter.
		if (row.arrival <= 0 || row.commit < -50) {
			if (samples.length < 5)
				samples.push(`${name} arrival ${row.arrival.toFixed(0)} commit ${row.commit.toFixed(0)}`);
			drop(row.arrival <= 0 ? "loaded before insert" : "remounted (document much older than its iframe)");
			continue;
		}
		row.commit = Math.max(0, row.commit);
		phases.push(row);
	}

	return {
		arm: arm.label,
		repeat,
		zoom,
		mounted,
		measured: phases.length,
		dropped,
		droppedSamples: samples,
		phases,
		wire: groupWire(wire),
		peakInFlight: peakInFlight(wire),
		wireSeen: wire.size,
	};
}

/**
 * #103's answer in one table: what arrival is with the flows call in front of it
 * and what it is with that one request aborted, per pass, against the 1 s bar.
 * Every pass is printed rather than averaged — #98's headline replicated across
 * two runs and that is the check worth keeping, not a mean that hides a split.
 */
function headline(results: RunResult[]): string {
	const lines = [
		`\n## Arrival, by arm (bar: 1 s)\n`,
		`| zoom | arm | pass | mounted | decomposed | reqs/frame | doc KB | arrival p50 | p95 | worst | bar |`,
		`|---|---|---|---|---|---|---|---|---|---|---|`,
	];
	for (const run of results) {
		const arrival = run.phases.map((row) => row.arrival).sort((a, b) => a - b);
		const p50 = quantile(arrival, 0.5);
		// What the arm actually served, read back off the wire rather than assumed:
		// an arm that quietly served the other payload would otherwise report as a
		// null result. Requests per frame counts the render origin only, which is
		// the population the payload controls.
		const render = run.wire.filter((group) => RENDER_GROUP.test(group.label));
		const docs = run.wire.find((group) => group.label === "frame document");
		const perFrame = docs === undefined || docs.count === 0 ? Number.NaN : sum(render, (g) => g.count) / docs.count;
		const docKb = docs === undefined || docs.count === 0 ? Number.NaN : docs.bytes / docs.count / 1024;
		lines.push(
			`| ${run.zoom} | ${run.arm} | ${run.repeat + 1} | ${run.mounted} | ${run.measured} | ${perFrame.toFixed(1)} | ${docKb.toFixed(0)} | **${ms(p50)}** | ${ms(quantile(arrival, 0.95))} | ${ms(arrival.at(-1) ?? Number.NaN)} | ${p50 < 1000 ? "**pass**" : "**miss**"} |`,
		);
	}
	return lines.join("\n");
}

/** The render origin's own groups — the frame document, the vendor pins, the scenario, the faces. */
const RENDER_GROUP = /^(frame document|vendor |scenario)/;

const sum = <T>(items: T[], pick: (item: T) => number): number => items.reduce((total, item) => total + pick(item), 0);

/**
 * #105's sweep in one table: the same page at descending zoom mounts fewer
 * frames at once, so a per-frame cost holds still down the column while a
 * contention cost falls with it. `mounted` is what the canvas actually opened,
 * never what the zoom was expected to give.
 *
 * Two limits this sweep has, both found by running it. **Do not sweep above
 * about k = 0.6**: `planCamera` takes its y from a real frame's centre but its x
 * from the mean of every centre, so once the viewport is narrow in world space
 * it aims between the frames and mounts nothing — at k = 1.0 on `skrivbord` it
 * mounted zero, and only the guard in `main` stopped that being reported as a
 * very fast canvas. And zoom is not a clean handle on the count: it changes how
 * large each frame renders and what else the canvas is asking the daemon for, so
 * a row far down the column differs from the top one in more than simultaneity.
 */
function seedSweep(results: RunResult[]): string {
	const lines = [
		`\n## The seed span against how many frames arrive at once\n`,
		`| zoom | mounted | pass | seed p50 | CDN graph p50 | evaluate p50 | handshake p50 | tail p50 | evaluate worst | CDN reqs p50 | arrival p50 |`,
		`|---|---|---|---|---|---|---|---|---|---|---|`,
	];
	for (const run of results) {
		const at = (key: SplitPhase, q: number): string => {
			const covered = run.phases.filter((row) => row[key] !== undefined);
			if (covered.length === 0) return "—";
			const sorted = sortedColumn(covered, (row) => row[key] ?? Number.NaN);
			return ms(q === 1 ? (sorted.at(-1) ?? Number.NaN) : quantile(sorted, q));
		};
		const seed = sortedColumn(run.phases, (row) => row.seed);
		const arrival = sortedColumn(run.phases, (row) => row.arrival);
		const cdn = sortedColumn(run.phases, (row) => row.cdnRequests);
		lines.push(
			`| ${run.zoom} | ${run.mounted} | ${run.repeat + 1} | ${ms(quantile(seed, 0.5))} | **${at("graph", 0.5)}** | **${at("evaluate", 0.5)}** | ${at("handshake", 0.5)} | ${at("seedTail", 0.5)} | ${at("evaluate", 1)} | ${quantile(cdn, 0.5).toFixed(0)} | ${ms(quantile(arrival, 0.5))} |`,
		);
	}
	return lines.join("\n");
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const { root, name, spoolDir } = subject(options);
	const { page: canvasPage, frames: boxes } = pageToMeasure(root, options.page);
	if (boxes.length === 0) throw new Error(`${options.project} has no frames to measure`);
	const port = await freePort();
	const daemon = await startDaemon(spoolDir, root, port);
	const url = `${daemon.url}/p/${encodeURIComponent(name)}`;
	process.stderr.write(
		`bench: ${url} (${options.inPlace ? "in place" : "copy"} of ${options.project}, page "${canvasPage === "" ? "root" : canvasPage}", ${boxes.length} frames, arms: ${options.arms.map((arm) => arm.label).join(" / ")}, ${options.repeats} pass${options.repeats === 1 ? "" : "es"} each)\n`,
	);

	let browser: Browser | undefined;
	const results: RunResult[] = [];
	try {
		browser = await chromium.launch({
			channel: options.headed ? "chromium" : "chromium-headless-shell",
			headless: !options.headed,
		});
		// One discarded pass per payload shape. A fresh daemon compiles every frame
		// it is asked for, and a first-ever boot measures the toolchain rather than
		// the canvas — and the two shapes are separately cached (the arm rides in
		// the compiler's cache key), so warming one leaves the other cold. An
		// unwarmed inlined arm would price esbuild, not the payload.
		for (const shape of [...new Set(options.arms.map((arm) => arm.inline))]) {
			process.stderr.write(`bench: warming the daemon (${shape ? "inlined" : "shipped"} document)\n`);
			await setInline(daemon.url, shape);
			writeCamera(
				root,
				planCamera(boxes, VIEWPORT.width, VIEWPORT.height, options.zooms[0] ?? DEFAULT_ZOOM),
				canvasPage,
			);
			const warm = await browser.newContext({ viewport: VIEWPORT });
			const warmPage = await warm.newPage();
			await warmPage.goto(url, { waitUntil: "domcontentloaded" });
			await warmPage.waitForTimeout(20_000);
			await warm.close();
			// The canvas persists its own camera through the daemon on settle, so a
			// save in flight when the context closed can land *after* the planned
			// camera is written and quietly reopen the next run somewhere empty.
			await new Promise((wait) => setTimeout(wait, 1500));
		}

		for (const zoom of options.zooms) {
			for (const arm of options.arms) {
				for (let repeat = 0; repeat < options.repeats; repeat++) {
					// The payload is switched on the daemon rather than per request:
					// routing 26 frame documents through playwright's interceptor would
					// put driver latency inside the one phase this run is measuring.
					await setInline(daemon.url, arm.inline);
					// Every pass replans the camera. The canvas saves its own on settle,
					// so the *previous* pass's camera is on disk by now and a run that
					// planned once per zoom would open where the last one finished.
					writeCamera(root, planCamera(boxes, VIEWPORT.width, VIEWPORT.height, zoom), canvasPage);
					const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
					await context.addInitScript(hostCollector);
					await context.addInitScript(frameCollector);
					const page = await context.newPage();
					page.on("pageerror", (error) =>
						process.stderr.write(`bench: page error — ${String(error).slice(0, 200)}\n`),
					);
					process.stderr.write(`bench: zoom ${zoom} — ${arm.label} ${repeat + 1}/${options.repeats}\n`);
					const result = await measure(context, page, url, zoom, arm, repeat);
					process.stderr.write(
						`bench:   ${result.mounted} mounted, ${result.measured} arrivals decomposed, ${result.wireSeen} requests seen\n`,
					);
					// nothing mounted is not a fast canvas, it is a canvas that opened
					// somewhere with no frames — an empty table would read as a measurement
					if (result.mounted === 0) {
						throw new Error("the canvas mounted no documents — the planned camera did not take");
					}
					results.push(result);
					await context.close();
					// let the settle-time camera save land before the next plan overwrites it
					await new Promise((wait) => setTimeout(wait, 1500));
				}
			}
		}
	} finally {
		await browser?.close();
		daemon.stop();
	}

	process.stdout.write(`${headline(results)}\n`);
	process.stdout.write(`${seedSweep(results)}\n`);

	for (const result of results) {
		process.stdout.write(
			`\n## zoom ${result.zoom} — ${result.arm}, pass ${result.repeat + 1} — ${result.mounted} documents mounted, ${result.measured} arrivals decomposed\n\n`,
		);
		process.stdout.write(`${phaseTable(result.phases)}\n\n`);
		process.stdout.write(`${wireTable(result.wire)}\n\n`);
		process.stdout.write(`Peak requests in flight on the one render origin: ${result.peakInFlight}\n`);
		// `requestHostSession` gives up after 250 ms and seeds as if standalone, so
		// a frame whose reply landed after its scenario fetch began paid the cap
		// rather than the handshake — a different finding, and it must not hide
		// inside a p50.
		const noAsk = result.phases.filter((row) => row.evaluate === undefined).length;
		const noReply = result.phases.filter((row) => row.handshake === undefined).length;
		const lateReply = result.phases.filter((row) => (row.seedTail ?? 0) < 0).length;
		process.stdout.write(
			`Handshake probe: ${result.phases.length - noAsk} of ${result.phases.length} asked, ${result.phases.length - noReply} answered, ${lateReply} answered after the scenario fetch had begun\n`,
		);
		const dropped = Object.entries(result.dropped);
		if (dropped.length > 0) {
			process.stdout.write(`Frames not decomposed: ${dropped.map(([why, n]) => `${n} ${why}`).join(", ")}\n`);
			for (const sample of result.droppedSamples) process.stdout.write(`  ${sample}\n`);
		}
	}
	if (options.out !== undefined) {
		writeFileSync(options.out, `${JSON.stringify({ project: options.project, results }, null, 2)}\n`);
		process.stderr.write(`bench: wrote ${options.out}\n`);
	}
}

await main();
