import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, sep } from "node:path";
import type { Context } from "hono";
import { Hono } from "hono";
import { type SSEStreamingApi, streamSSE } from "hono/streaming";
import { validator } from "hono/validator";
import trash from "trash";
import { z } from "zod";
import { writeAtomic } from "../atomic-write";
import { type Attachment, MAX_ATTACHMENT_BYTES, parseAttachment } from "../attachment";
import { SPOOL_DEVELOPMENT_FAVICON_SVG, SPOOL_DEVELOPMENT_THREAD, SPOOL_FAVICON_SVG } from "../brand";
import type { Cover } from "../cover";
import { DOOR_ORIGIN } from "../door";
import { SpoolError } from "../errors";
import { createProject, initProject } from "../init";
import { openProject } from "../open";
import { isSafeName } from "../page-path";
import { forgetResolvedProject, lookupProjectByName, readRegistry } from "../registry";
import { appearanceOf, themeInline } from "../settings/registry";
import { requestUpgrade } from "../upgrade";
import { parseAgentReply } from "./agent-control";
import { type AgentExecutor, claudeExecutor } from "./agent-exec";
import { type AgentHeld, createAgentTurns } from "./agent-live";
import { type AgentAsk, askAgentOffer, askFrom, isEffortShaped, isModelShaped } from "./agent-offer";
import { agentInstalled, askAgentLogin, type Look } from "./agent-preflight";
import { agentPromptContent } from "./agent-spawn";
import { closeThread, isThreadId, parseThreadPut, putThread, serveThreads, sessionExists } from "./agent-threads";
import { startAgentTurn } from "./agent-turn";
import { CanvasFileError } from "./canvas-file";
import { parseOrder, readOrder, storedOrder, writeOrder } from "./canvas-order";
import { parsePlaces, writePlaces } from "./canvas-places";
import { createFrameCompiler } from "./compile";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import {
	captureWorkerCsp,
	captureWorkerDocument,
	escapeHtml,
	escapeInlineScript,
	escapeInlineStyle,
	escapeJsonScript,
	playerHandoffRejectedDocument,
	playerLoadErrorDocument,
} from "./document";
import { createChangeHub } from "./events";
import {
	createPage,
	duplicateFrames,
	duplicatePage,
	forgetPages,
	moveFrames,
	movePages,
	pageDir,
	type Refusal,
	renameFrame,
	renamePage,
} from "./explorer";
import { createFlowGraph, recordWalk } from "./flows";
import { listDirectory, refreshIndex, searchDirectories } from "./fs-list";
import { type Geometry, parseGeometry, sidecarFileIn, writeGeometry } from "./geometry";
import { createGoReader } from "./go-reader";
import { ASSET_REQUEST_CAP, base64Length, listAssets } from "./hand-asset";
import { type AssetPut, assetSite, patchSite, readRungs, revertTarget, STALE_FILE } from "./hand-lane";
import { uncaughtNotice } from "./hand-notice";
import { applySpan, fingerprintOf, parseHandOps, parseStamps, spanBetween } from "./hand-write";
import { createHistory, type HistoryClock } from "./history";
import { locateInDesign } from "./locate";
import { isLoopbackHost } from "./loopback";
import { assemblePlayerDocument, chromeFontFile, createPlayerCompiler, playerChromeCss, playerEtag } from "./play";
import { type ProjectJson, readScenario } from "./project-files";
import { parseCanvasState, readCanvasState, writeCanvasState } from "./project-state";
import {
	FRAME_BIRTH,
	frameDirectories,
	frameExists,
	frameGeometry,
	listProjectFrames,
	lookupFrame,
	type ProjectCard,
	summarizeProject,
} from "./projection";
import { createResolvePass } from "./resolve-pass";
import {
	CAPTURE_HOST,
	CONTROL_HEADER,
	captureOriginFor,
	createCapability,
	matchesCapability,
	normalizeHostname,
	PROJECT_HEADER,
	RENDER_HOST,
	renderOriginFor,
} from "./security";
import { markSeen } from "./seen";
import { createSelectionStore, parseSelectionEntries, parseSelectionPut, type SelectionEntry } from "./selection";
import { selectionBlock } from "./selection-block";
import {
	type AppEvent,
	type MachineStateWatchAdapter,
	orderSession,
	readSession,
	updateSession,
	watchMachineState,
} from "./session";
import { createSettingsStore } from "./settings";
import { createShotTaker } from "./shots";
import { compileClasses, readTheme } from "./theme";
import {
	createThumbHealer,
	isCoverHash,
	readCoverImage,
	UnservableCoverError,
	writeCaptureError,
	writeCover,
} from "./thumbs";
import { readUiAsset, readUiIndex, UI_MISSING_NOTICE } from "./ui";
import { createUpdateChecker } from "./update-check";
import {
	reactVersion,
	type VendorModule,
	vendorPlayerShellJs,
	vendorReactJs,
	vendorSpoolJs,
	vendorSpoolJsxJs,
} from "./vendor";
import { createWebfonts } from "./webfonts";

export interface DaemonOptions {
	spoolDir: string;
	version: string;
	/** Exact control virtual host. Tests use localhost; the bound daemon passes its configured loopback host. */
	controlHost?: string | undefined;
	/** Injectable only for deterministic seam tests. Production always generates one. */
	controlToken?: string | undefined;
	/** dist/ui — absent in seam tests and unbuilt checkouts. */
	uiDir?: string | undefined;
	/** The checkout daemon keeps its browser identity distinct from the release. */
	development?: boolean | undefined;
	/** The OS Trash (#7: spool never manages it) — swapped out by seam tests. */
	moveToTrash?: (paths: string[]) => Promise<void>;
	/** #30 phone-home: on only when `spool serve` resolves it on from config. */
	updateCheck?: boolean | undefined;
	/** #238: the experiment names config.json switched on, handed to the canvas at boot. */
	experiments?: readonly string[] | undefined;
	/**
	 * #158: the per-user history switch off config.json. Absent means on, because
	 * only `false` is a refusal — the project flag is what turns history on, and
	 * this is the one way to say no to every project at once.
	 */
	history?: boolean | undefined;
	/** The registry probe — swapped out by seam tests. */
	fetchLatest?: () => Promise<string | undefined>;
	/** The toast door's detached `spool upgrade` spawn — swapped out by seam tests. */
	upgrade?: () => { ok: true } | { ok: false; error: string };
	/** The agent spawn (#191) — swapped for a capture replayer so CI never runs a real agent. */
	agentExecutor?: AgentExecutor;
	/**
	 * The `which` behind the install wall (#201) — swapped so a test says what this
	 * machine has rather than inheriting whatever the machine running it happens to have.
	 *
	 * The executor's counterpart: a test that hands the daemon a fixture agent has said
	 * there is one, and the wall must not then contradict it because no `claude` is on the
	 * runner's PATH.
	 */
	agentLook?: Look;
	/** Machine-state filesystem lifecycle boundary. */
	machineStateWatchAdapter?: MachineStateWatchAdapter;
	/** History's idle window (#157) — driven by tests instead of by the clock. */
	historyClock?: HistoryClock;
	/**
	 * The home the picker's search walks (#251) — swapped by seam tests, so a walk
	 * reads a fixture home rather than whatever is on the machine running them.
	 */
	home?: string | undefined;
	/** Where history writes the one notice a project without git earns. */
	onHistoryNotice?: (message: string) => void;
	/** Machine-state observation failures stay visible without escaping a watcher callback. */
	onMachineStateWatchError?: (error: Error) => void;
}

/** The player page's params (#24): Zod-validated, path-safe names only. */
const playParams = z.object({
	frame: z.string().refine(isSafeName, { message: "not a frame name" }).optional(),
	scenario: z.string().refine(isSafeName, { message: "not a scenario name" }).optional(),
	shell: z.literal("1").optional(),
	handoff: z
		.string()
		.regex(/^[A-Za-z0-9_-]{43}$/, { message: "not a shell handoff" })
		.optional(),
});

const PLAYER_HANDOFF_TTL_MS = 30_000;
/** Browser handoffs are deliberately short and bounded: issuing the control document is a public GET. */
const MAX_PLAYER_HANDOFFS = 64;
/**
 * How long after the last design/ change a played project is recomposed in
 * the background. The composition is whole-project, so an edit anywhere
 * retires it; recomposing once the editor goes quiet means the next play
 * finds it ready instead of paying the compile behind a blank screen.
 */
const PLAYER_WARM_MS = 1_500;

/** A JSON body as fields to read, whatever arrived. */
const bodyFields = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/** A `[name, ...]` field, or nothing when it is not one. */
const nameList = (value: unknown): string[] | undefined =>
	Array.isArray(value) && value.every((name): name is string => typeof name === "string") ? value : undefined;

/**
 * What a trash names (#228): frames, pages, or both. Both sides are optional on
 * the wire and the handler requires one of them to be there, so a caller that
 * only ever deletes frames writes what it always wrote.
 */
interface TrashBody {
	frames?: string[];
	pages?: string[];
}

/**
 * A design/ read or write, with the two refusals it can throw already answered
 * (#228): a path that resolves out of design/, and a canvas.json spool will not
 * overwrite because it cannot read what overwriting it would lose.
 */
function answeringDiskRefusals<T>(c: Context, work: () => T): { value: T } | { response: Response } {
	try {
		return { value: work() };
	} catch (error) {
		if (error instanceof DesignBoundaryError) return { response: c.text(error.message, 400) };
		if (error instanceof CanvasFileError) return { response: c.text(error.message, 500) };
		throw error;
	}
}

const isRefusal = (outcome: { kind: string }): outcome is Refusal => outcome.kind === "refused";

/**
 * One explorer verb, answered (#228): the disk's refusals first, then the
 * operation's own — which already carries the status it wants said — and what
 * is left is the verb having happened, which only the route can phrase.
 */
function explorerVerb<T extends { kind: string }, R extends Response>(
	c: Context,
	work: () => T | Refusal,
	done: (value: T) => R,
): R | Response {
	const outcome = answeringDiskRefusals(c, work);
	if ("response" in outcome) return outcome.response;
	if (isRefusal(outcome.value)) return c.text(outcome.value.message, outcome.value.status);
	return done(outcome.value);
}

/** Both renames read one body; only what they move differs. */
const renameBody = validator("json", (value: unknown, c: Context) => {
	const { from, to } = bodyFields(value);
	if (typeof from !== "string" || typeof to !== "string") {
		return c.text('a rename is { "from": "…", "to": "…" }', 400);
	}
	return { from, to };
});

/**
 * How often a long-lived stream says something while nothing is happening.
 *
 * A comment rather than an event: it is bytes on the wire and nothing more, so
 * every parser drops it and no handler has to know it exists. What it buys is
 * the one thing a quiet stream cannot tell you by itself — that it is still
 * there. A connection the network dropped under a sleeping laptop reads exactly
 * like a project nobody is editing, and a browser waits on that forever.
 */
const SSE_HEARTBEAT_MS = 15_000;

/**
 * Keep one stream audible. The returned stop is for a handler that ends of its
 * own accord; a client that hangs up is covered by the abort.
 */
function beatWhileOpen(stream: SSEStreamingApi): () => void {
	const timer = setInterval(() => {
		// a write to a stream that has already gone is nothing to report
		void stream.write(": beat\n\n").catch(() => {});
	}, SSE_HEARTBEAT_MS);
	timer.unref?.();
	const stop = () => clearInterval(timer);
	stream.onAbort(stop);
	return stop;
}

/**
 * One view of a held turn, which is what both doors return (#211).
 *
 * The turn is not this response's to end. A client that goes away closes its own read and
 * leaves the process where it was — which is the whole of what #211 changed, and it is one
 * line: `onAbort` closes the view rather than abandoning the turn.
 *
 * It opens by saying what is being read: the name the rail's stop has to quote, whether
 * the process is still up, and how many events are already in the log. That last one is
 * what lets the rail draw the replay whole and pace only what arrives after it — the same
 * rule a picture off disk is under, since neither of them is happening now.
 */
function attachTurn(c: Context, held: AgentHeld, from: number) {
	return streamSSE(c, async (stream) => {
		const view = held.watch(from);
		stream.onAbort(() => view.close());
		const stopBeat = beatWhileOpen(stream);
		try {
			await stream.writeSSE({
				event: "attached",
				data: JSON.stringify({
					...(held.id === undefined ? {} : { turn: held.id }),
					running: held.running,
					from,
					logged: held.logged,
				}),
			});
			for await (const { id, event } of view) {
				try {
					await stream.writeSSE({ event: "agent", data: JSON.stringify(event), id: String(id) });
				} catch {
					// the client hung up mid-write — stop reading, and leave the turn running
					break;
				}
			}
		} finally {
			stopBeat();
			view.close();
		}
	});
}

/**
 * The daemon's Hono app, the primary seam: everything observable rides
 * app.request(), no port needed. The inferred AppType is the compile-time
 * tripwire between daemon and UI once the canvas exists.
 */
export function createDaemonApp({
	spoolDir,
	version,
	controlHost,
	controlToken: providedControlToken,
	uiDir,
	development,
	moveToTrash,
	updateCheck,
	experiments,
	history: historyAllowed,
	fetchLatest,
	upgrade,
	agentExecutor,
	agentLook,
	machineStateWatchAdapter,
	onMachineStateWatchError,
	historyClock,
	onHistoryNotice,
	home,
}: DaemonOptions) {
	const controlToken = providedControlToken ?? createCapability();
	const controlHostname = normalizeHostname(controlHost ?? "localhost");
	let controlOrigin = `http://${controlHostname.includes(":") ? `[${controlHostname}]` : controlHostname}`;
	let renderOrigin = renderOriginFor(controlOrigin);
	let captureOrigin = captureOriginFor(controlOrigin);
	const projectCapabilities = new Map<string, string>();
	const playerHandoffs = new Map<string, { project: string; frame: string; scenario: string; expiresAt: number }>();

	function projectCapability(root: string): string {
		let capability = projectCapabilities.get(root);
		if (capability === undefined) {
			capability = createCapability();
			projectCapabilities.set(root, capability);
		}
		return capability;
	}

	function issuePlayerHandoff(project: string, frame: string, scenario: string): string {
		const now = Date.now();
		for (const [token, handoff] of playerHandoffs) {
			if (handoff.expiresAt <= now) playerHandoffs.delete(token);
		}
		while (playerHandoffs.size >= MAX_PLAYER_HANDOFFS) {
			const oldest = playerHandoffs.keys().next().value;
			if (oldest === undefined) break;
			playerHandoffs.delete(oldest);
		}
		const token = createCapability();
		playerHandoffs.set(token, { project, frame, scenario, expiresAt: now + PLAYER_HANDOFF_TTL_MS });
		return token;
	}

	function consumePlayerHandoff(
		token: string | undefined,
		project: string,
		frame: string | undefined,
		scenario: string,
	): boolean {
		if (token === undefined) return false;
		const handoff = playerHandoffs.get(token);
		playerHandoffs.delete(token);
		return (
			handoff !== undefined &&
			handoff.expiresAt > Date.now() &&
			handoff.project === project &&
			handoff.frame === frame &&
			handoff.scenario === scenario
		);
	}

	const startedAt = new Date().toISOString();
	const webfonts = createWebfonts({ cacheDir: join(spoolDir, "webfonts") });
	const compiler = createFrameCompiler(version, webfonts);
	const playerCompiler = createPlayerCompiler(version, webfonts);

	/**
	 * Where a session opens, and what it is composed of. Both play doors climb
	 * the same ladder — an explicit `?frame=` wins, then whatever the canvas
	 * last pointed at, then the first frame by name (#13) — and both refuse the
	 * same two ways, so the ladder is written once and the doors differ only in
	 * how they carry a refusal back.
	 */
	function openingOn(
		root: string,
		frame: string | undefined,
		projectName: string,
	): { start: string; projection: ReturnType<typeof listProjectFrames> } | { message: string } {
		const projection = listProjectFrames(root);
		const names = projection.frames.map((entry) => entry.name);
		const first = names[0];
		if (first === undefined) {
			return {
				message: `nothing to play in "${projectName}" — ${FRAME_BIRTH}`,
			};
		}
		if (frame !== undefined && !names.includes(frame)) {
			return { message: `no frame "${frame}" to play — ${FRAME_BIRTH}` };
		}
		const selected = selections.get(root).find((entry) => names.includes(entry.frame))?.frame;
		return { start: frame ?? selected ?? first, projection };
	}
	/**
	 * Projects this daemon has played, kept composed (#24): the first play
	 * subscribes the root to its own change stream, and every edit that
	 * retires the composition rebuilds it once the edits go quiet. Never before
	 * a first play — a project nobody is playing is not worth a watcher.
	 */
	const playerWarmers = new Map<string, () => void>();
	function keepPlayerWarm(root: string): void {
		if (playerWarmers.has(root)) return;
		let timer: NodeJS.Timeout | undefined;
		const unsubscribe = hub.subscribe(root, (event) => {
			if (event.kind !== "frame" && event.kind !== "shared") return;
			if (timer !== undefined) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = undefined;
				void playerCompiler.getBundle(root, listProjectFrames(root).frames);
			}, PLAYER_WARM_MS);
			timer.unref?.();
		});
		playerWarmers.set(root, () => {
			if (timer !== undefined) clearTimeout(timer);
			unsubscribe();
		});
	}
	const flowGraph = createFlowGraph();
	// a shared/ edit wakes the frames whose graph reaches it, not every document
	const hub = createChangeHub({ framesUsing: (root, path) => flowGraph.framesUsing(root, path) });
	// what Liam points at, per project — daemon memory only, dies with it (#3)
	const selections = createSelectionStore();
	const trashImpl = moveToTrash ?? (async (paths: string[]) => void (await trash(paths)));

	/**
	 * What the write lane needs of the project: who renders a shared file, which
	 * is the blast radius a refusal names. The graph is built rather than
	 * guessed at, because it is only asked for on the refusal path.
	 */
	const framesUsingIn = (root: string) => ({
		framesUsing: async (path: string) => {
			await flowGraph.flows(root).catch(() => undefined);
			return flowGraph.framesUsing(root, path);
		},
	});

	const askBody = validator("json", (value, c) => {
		const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
		const ops = parseHandOps(body.ops);
		if (typeof body.frame !== "string" || !isSafeName(body.frame) || ops === undefined) {
			return c.text('a patch is { "frame", "ops": [ { "kind", "source", ... } ] }', 400);
		}
		return { frame: body.frame, ops };
	});

	/** The rail's read (#256): one frame, and the ancestry's stamps in rung order. */
	const rungsBody = validator("json", (value, c) => {
		const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
		const sources = parseStamps(body.sources);
		if (typeof body.frame !== "string" || !isSafeName(body.frame) || sources === undefined) {
			return c.text('a read is { "frame", "sources": [ "frames/…/frame.tsx:12:4" ] }', 400);
		}
		return { frame: body.frame, sources };
	});

	/**
	 * The rail's free class field (#257): candidates put to the compiler.
	 *
	 * A handful at a time — the field asks about what a person is typing and
	 * about the seeds it offers beside it, and a list longer than that is not a
	 * question about one field any more.
	 */
	const classesBody = validator("json", (value, c) => {
		const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
		const tokens = body.tokens;
		if (!Array.isArray(tokens) || tokens.length > 64 || tokens.some((token) => typeof token !== "string")) {
			return c.text('a compile is { "tokens": ["mt-4", "md:hidden"] }, at most 64', 400);
		}
		return { tokens: tokens as string[] };
	});

	/** A write carries the fingerprint of the file the ask was answered against. */
	const patchBody = validator("json", (value, c) => {
		const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
		const ops = parseHandOps(body.ops);
		if (typeof body.frame !== "string" || !isSafeName(body.frame) || ops === undefined) {
			return c.text('a patch is { "frame", "fingerprint", "ops": [ { "kind", "source", ... } ] }', 400);
		}
		if (typeof body.fingerprint !== "string" || body.fingerprint === "") {
			return c.text("a patch carries the fingerprint it was formed against", 400);
		}
		return { frame: body.frame, ops, fingerprint: body.fingerprint };
	});

	/**
	 * The asset swap (#260): one `<img>`, and the picture it is to draw.
	 *
	 * Either a file a hand just dropped — its name and its bytes, because a
	 * browser never reveals a dropped file's path — or one the project already
	 * holds, named the way the canvas spells every path. Exactly one of the two:
	 * a body carrying both is a client that has not decided.
	 */
	const assetBody = validator("json", (value, c) => {
		const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
		const { frame, source, fingerprint, file, asset } = body;
		const says = 'a swap is { "frame", "source", "fingerprint", and one of "file" or "asset" }';
		if (typeof frame !== "string" || !isSafeName(frame) || typeof source !== "string") return c.text(says, 400);
		if (parseStamps([source]) === undefined) return c.text(says, 400);
		if (typeof fingerprint !== "string" || fingerprint === "") {
			return c.text("a swap carries the fingerprint it was formed against", 400);
		}
		const swap: {
			frame: string;
			source: string;
			fingerprint: string;
			asset: string | undefined;
			file: { name: string; data: string } | undefined;
		} = { frame, source, fingerprint, asset: undefined, file: undefined };
		if (typeof asset === "string" && file === undefined) {
			if (asset.length === 0 || asset.length > 512) return c.text(says, 400);
			swap.asset = asset;
			return swap;
		}
		if (typeof file !== "object" || file === null || asset !== undefined) return c.text(says, 400);
		const { name, data } = file as Record<string, unknown>;
		if (typeof name !== "string" || typeof data !== "string") return c.text(says, 400);
		if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
			return c.text("not a file spool can read", 400);
		// the budget is the real ceiling and the lane says so in the project's own
		// words; this is only a bound on what one request may carry at all
		if (data.length > base64Length(ASSET_REQUEST_CAP)) return c.text("not a file spool can read", 400);
		swap.file = { name, data };
		return swap;
	});

	const frameAuthority = (root: string) => ({
		projectCapability: projectCapability(root),
		controlOrigin,
	});

	// #157: the daemon keeps design history, one idle-window batch per project.
	// It reads the change hub rather than opening a watcher of its own, and its
	// subscription is what holds that watcher open when no browser is looking.
	const history = createHistory({
		watch: (root, changed) =>
			hub.subscribe(root, (event) => {
				// only what the disk really did: a walk, a cover and a resolve pass
				// are the daemon publishing on the same channel, and .spool is
				// nobody's history
				if (event.kind === "frame" || event.kind === "geometry" || event.kind === "shared") changed();
			}),
		...(historyClock === undefined ? {} : { clock: historyClock }),
		...(onHistoryNotice === undefined ? {} : { notice: onHistoryNotice }),
		...(historyAllowed === undefined ? {} : { enabled: historyAllowed }),
	});
	// #281: every setting, behind one read and one write over the three files
	const settings = createSettingsStore(spoolDir);
	/** The home the picker's search indexes, and the registry that marks its projects (#251/#277). */
	const fsIndex = { home: home ?? homedir(), spoolDir };
	const registeredRoots = () => readRegistry(spoolDir).projects.map((project) => project.root);

	// the app-level channel: registry and session changes, fanned to every page
	const appListeners = new Set<(event: AppEvent) => void>();
	const emitAppEvent = (event: AppEvent) => {
		// a project that arrived or left changes who keeps history, and an arrival
		// brings whatever design/ churn the daemon was not up for
		if (event.kind === "registry") history.keeping(registeredRoots());
		for (const listener of appListeners) listener(event);
	};
	// the catch-up batch: whatever design/ is already dirty is a batch pending
	history.keeping(registeredRoots());
	const machineStateWatch = watchMachineState(spoolDir, emitAppEvent, {
		...(machineStateWatchAdapter === undefined ? {} : { adapter: machineStateWatchAdapter }),
		onError:
			onMachineStateWatchError ??
			((error) => console.error(`spool: machine-state observation failed: ${error.message}`)),
	});

	// #30: the daily registry ask — constructed idle, started only by a
	// really-listening daemon whose owner has not opted out; a check that
	// learns of a newer release tells every connected page over app SSE
	const upgradeImpl = upgrade ?? (() => requestUpgrade(spoolDir));
	const updateChecker = createUpdateChecker({
		spoolDir,
		version,
		...(fetchLatest === undefined ? {} : { fetchLatest }),
		onUpdate: (latest) => emitAppEvent({ kind: "update", latest }),
	});
	const updateAvailable = () => (updateCheck === true ? updateChecker.available() : undefined);

	// the healer needs a dialable origin, which exists only once the server has
	// bound — in-process app.request() never activates it
	let selfOrigin: string | undefined;
	const shots = createShotTaker();
	const healer = createThumbHealer({
		capture: (target) => shots.capture(target),
		stored: (root, frame, cover) => hub.publish(root, { kind: "thumb", frame, cover }),
	});
	const goReader = createGoReader();
	const resolvePass = createResolvePass({
		read: (target) => goReader.read(target),
		sources: (root) => flowGraph.sources(root),
		moved: (root) => hub.publish(root, { kind: "resolved" }),
		now: () => new Date().toISOString(),
	});

	// #191's ADR: the daemon spawns the developer's own agent when the hands ask
	// for it. Project code never reaches this — it is a control-plane route
	// behind the control token, the same boundary #41 drew.
	const spawnAgent = agentExecutor ?? claudeExecutor();
	/**
	 * Every turn this daemon is holding, by the conversation it belongs to (#211).
	 *
	 * It used to be every turn *in flight*, keyed by the turn and cleared by the request
	 * that streamed it — which is what made a refresh kill the binary. A turn is held here
	 * now and the stream is only a view of it: the project is carried because an answer
	 * arrives on its own request rather than on the stream that asked for it (#197), and
	 * the rail's own name for the turn is carried because a stop has no request to quote
	 * and names the turn instead (#165).
	 */
	const liveTurns = createAgentTurns();
	/**
	 * Which machine each thread chose, and how hard it should think (#199).
	 *
	 * It is the ask and never the readout: what is drawn comes back off the binary's own
	 * report, and this is only what the next spawn is asked to carry.
	 *
	 * Per thread rather than per project, because which machine is answering is a fact
	 * about a conversation: a project runs one thread on Opus and another on Haiku, and a
	 * project-wide ask would carry the open thread's choice into the one you switched to.
	 * It dies with the daemon, because a preference nobody has said is durable is not a
	 * file to write — a restarted thread reads its model off the next turn's own report.
	 * It dies with the thread too: a conversation that was closed is not one anything is
	 * going to spawn for again, and a map only ever written to is a map that only grows.
	 */
	const agentAsks = new Map<string, AgentAsk>();
	const askKey = (root: string, thread: string) => `${root}\x00${thread}`;

	function resolveProject(c: Context, name: string): { root: string } | { response: Response } {
		const lookup = lookupProjectByName(spoolDir, name);
		if (lookup.kind === "unknown") {
			return { response: c.text(`unknown project "${name}" — run \`spool open\` in its product root first`, 404) };
		}
		if (lookup.kind === "ambiguous") {
			if (!c.req.path.startsWith("/api/")) {
				return { response: c.text(`"${name}" names multiple registered projects`, 409) };
			}
			return {
				response: c.text(
					`"${name}" names ${lookup.roots.length} registered projects:\n${lookup.roots.join("\n")}`,
					409,
				),
			};
		}
		return { root: lookup.root };
	}

	/** The most the one uploaded cover image may weigh. */
	const MAX_COVER_BYTES = 16 * 1024 * 1024;

	/**
	 * Ask the headless fallback for a frame's cover. The healer holds the
	 * per-frame cooldown and runs one shot at a time, so calling this for every
	 * uncovered frame in a projection read costs a queue, never a stampede.
	 */
	function requestHeal(root: string, name: string, frame: string, geometry?: { w: number; h: number }): void {
		if (selfOrigin === undefined) return;
		const { w, h } = geometry ?? frameGeometry(root, frame);
		healer.request({
			root,
			frame,
			url: `${selfOrigin}/p/${encodeURIComponent(name)}/frames/${encodeURIComponent(frame)}`,
			width: w,
			height: h,
		});
	}

	/** The capture protocol carries exactly one image. */
	async function parseCover(c: Context): Promise<Buffer> {
		const form = await c.req.formData();
		const entries = [...form.entries()];
		const [key, value] = entries[0] ?? [];
		if (
			entries.length !== 1 ||
			key !== "cover" ||
			value === undefined ||
			typeof value === "string" ||
			value.size === 0 ||
			value.size > MAX_COVER_BYTES
		) {
			throw new Error("not a cover");
		}
		return Buffer.from(await value.arrayBuffer());
	}

	/**
	 * Headers for a cover. The hash in the URL is the content, so the answer can
	 * never go stale: the browser holds it for a year and revalidates nothing,
	 * and a changed cover arrives as a different address.
	 */
	function immutableCover(c: Context, type: string): void {
		c.header("cache-control", "private, max-age=31536000, immutable");
		c.header("content-type", type);
		c.header("x-content-type-options", "nosniff");
	}

	/** Body of the picker's POSTs: { path } — anything else is a 400. */
	function requestedPath(value: unknown, c: Context): { path: string } | Response {
		const path = (value as { path?: unknown }).path;
		if (typeof path !== "string" || path === "") {
			return c.json({ error: 'expected { "path": "/abs/dir" }' }, 400);
		}
		return { path };
	}

	/** Body of the picker's create: { path, name } — the folder to make it in, and what to call it. */
	function requestedNewProject(value: unknown, c: Context): { path: string; name: string } | Response {
		const { path, name } = value as { path?: unknown; name?: unknown };
		if (typeof path !== "string" || path === "" || typeof name !== "string" || name === "") {
			return c.json({ error: 'expected { "path": "/abs/dir", "name": "folder" }' }, 400);
		}
		return { path, name };
	}

	type HostClass = "control" | "alias" | "render" | "capture" | "unexpected";

	function hostClass(url: string): HostClass {
		const hostname = normalizeHostname(new URL(url).hostname);
		if (hostname === controlHostname) return "control";
		if (hostname === RENDER_HOST) return "render";
		if (hostname === CAPTURE_HOST) return "capture";
		// The other names for this machine reach the same listener but are not the
		// same origin. They are not strangers either — see the redirect above.
		return isLoopbackHost(hostname) ? "alias" : "unexpected";
	}

	/**
	 * Who may read `/api/health` across origins, and nothing else may — this is
	 * the daemon's only CORS header anywhere.
	 *
	 * The hosted front door at local.spool.page listens for this daemon from a
	 * visitor's browser and hands over when it answers (spool-cloud#8). Without a
	 * readable reply it can only learn that *something* is on the port, so any dev
	 * server squatting 7766 would read as spool and a visitor would be handed to
	 * it. One route, one header, one trimmed body is the whole carve-out.
	 *
	 * Loopback origins are allowed too, so a locally served copy of that page can
	 * read health while the page itself is being worked on. It is safe by
	 * construction: anything already serving on loopback could ask the daemon
	 * directly, and a public website can never carry a loopback origin.
	 *
	 * Narrower than the issue in one place, on purpose: http and https only.
	 * `new URL("foo://localhost").origin` serializes to the string "null", and
	 * echoing that back would hand the header to every sandboxed frame on the
	 * machine — the exact opaque-origin law the rest of this file exists to keep.
	 */
	function healthReaderOrigin(origin: string | undefined): string | undefined {
		if (origin === undefined) return undefined;
		if (origin === DOOR_ORIGIN) return DOOR_ORIGIN;
		let url: URL;
		try {
			url = new URL(origin);
		} catch {
			return undefined;
		}
		if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
		return isLoopbackHost(normalizeHostname(url.hostname)) ? url.origin : undefined;
	}

	function isProjectDataPath(path: string): boolean {
		return /^\/api\/p\/[^/]+\/scenarios\/[^/]+$/.test(path);
	}

	function isExecutableRenderPath(path: string): boolean {
		return /^\/p\/[^/]+\/frames\/[^/]+$/.test(path) || /^\/play\/[^/]+$/.test(path);
	}

	function isRenderOnlyPath(path: string): boolean {
		return /^\/p\/[^/]+\/frames\/[^/]+$/.test(path) || path.startsWith("/vendor/") || isProjectDataPath(path);
	}

	function normalizedOrigin(value: string): string | undefined {
		try {
			return new URL(value).origin;
		} catch {
			return undefined;
		}
	}

	function registeredCapabilityRoot(capability: string | undefined): string | undefined {
		if (capability === undefined) return undefined;
		const registered = new Set(readRegistry(spoolDir).projects.map((project) => project.root));
		for (const [root, expected] of projectCapabilities) {
			if (registered.has(root) && matchesCapability(expected, capability)) return root;
		}
		return undefined;
	}

	function resolveProjectData(c: Context): { root: string } | { response: Response } {
		const origin = c.req.header("origin");
		if (origin !== "null") return { response: c.text("forbidden", 403) };
		const supplied = c.req.header(PROJECT_HEADER);
		const root = registeredCapabilityRoot(supplied);
		if (root === undefined) return { response: c.text("unauthenticated", 401) };
		if (basename(root) !== c.req.param("project")) return { response: c.text("forbidden", 403) };
		c.header("access-control-allow-origin", "null");
		return { root };
	}

	// scenario reads land in null-origin sandboxed frames. Their
	// capability, not a wildcard origin, selects the one root they may read.
	function serveProjectJson(c: Context, result: ProjectJson): Response {
		// The same display-name URL can select different registered roots by
		// capability. Never let an HTTP cache collapse those authorities.
		c.header("cache-control", "no-store");
		c.header("vary", "Origin, X-Spool-Project");
		if (result.kind === "missing") return c.text(result.message, 404);
		if (result.kind === "invalid") return c.text(result.message, 500);
		c.header("content-type", "application/json; charset=utf-8");
		return c.body(result.json);
	}

	const app = new Hono()
		.use("*", async (c, next) => {
			const host = hostClass(c.req.url);
			// localhost and 127.0.0.1 are the same machine and the same daemon, but
			// not the same origin — and the bound one is the origin everything here
			// hangs off: the capability's audience, the Origin checks below, and the
			// browser storage a canvas keeps. Serving both would quietly fork a
			// person's canvas in two. So the other loopback names are sent to the
			// bound one instead of refused: one address to type, still one origin to
			// trust. The target is this daemon's own, never the request's, so no Host
			// header can steer it; every other name is still a stranger's (a rebound
			// DNS record pointed at this port) and still gets 421.
			if (host === "alias") {
				const { pathname, search } = new URL(c.req.url);
				return c.redirect(`${controlOrigin}${pathname}${search}`, 307);
			}
			if (host === "unexpected") return c.text("unexpected host", 421);
			const path = c.req.path;
			if (host === "capture") {
				const url = new URL(c.req.url);
				if (c.req.method !== "GET" || url.pathname !== "/capture" || url.search !== "") {
					return c.text("not found", 404);
				}
				await next();
				return;
			}
			if (host === "render") {
				const allowed = isRenderOnlyPath(path) || path.startsWith("/play/") || path === "/favicon.svg";
				if (!allowed) return c.text("not found", 404);
				// A direct render URL must retain the opaque-origin law that its
				// canvas and Play wrappers impose. This also keeps capabilities
				// in one document unreadable to another project on the shared host.
				if (isExecutableRenderPath(path)) c.header("content-security-policy", "sandbox allow-scripts");
				await next();
				return;
			}
			if (isRenderOnlyPath(path) || path === "/capture") return c.text("not found", 404);
			if (!path.startsWith("/api/") || path === "/api/health") {
				await next();
				return;
			}
			if (c.req.method === "OPTIONS") return c.text("forbidden", 403);
			if (!matchesCapability(controlToken, c.req.header(CONTROL_HEADER))) {
				return c.text("unauthenticated", 401);
			}
			const origin = c.req.header("origin");
			if (origin !== undefined && normalizedOrigin(origin) !== controlOrigin) {
				return c.text("forbidden", 403);
			}
			await next();
		})
		.get("/capture", (c) => {
			c.header("cache-control", "no-store");
			c.header("content-security-policy", captureWorkerCsp(controlOrigin));
			c.header("x-content-type-options", "nosniff");
			return c.html(captureWorkerDocument(controlOrigin));
		})
		.get("/api/health", (c) => {
			const reader = healthReaderOrigin(c.req.header("origin"));
			// two shapes behind one URL, chosen by Origin — no cache may collapse them
			c.header("vary", "origin");
			if (reader === undefined) return c.json({ name: "spool", version, pid: process.pid, startedAt });
			c.header("access-control-allow-origin", reader);
			// the door asks two questions and is owed two answers: is this spool,
			// and which version. The pid and the start time are nobody else's.
			return c.json({ name: "spool", version });
		})
		.post("/api/upgrade", (c) => {
			// the toast door (#30): spawn the one orchestrator detached and stand
			// back — the SSE drop and the version flip tell the rest of the story
			const outcome = upgradeImpl();
			if (!outcome.ok) return c.json({ error: outcome.error }, 409);
			return c.json({ started: true }, 202);
		})
		.get("/api/session", (c) => c.json(readSession(spoolDir)))
		.put(
			"/api/session",
			validator("json", (value, c) => {
				const { root, open } = value as { root?: unknown; open?: unknown };
				if (typeof root !== "string" || typeof open !== "boolean") {
					return c.text('session mutation must be { "root": string, "open": boolean }', 400);
				}
				return { root, open };
			}),
			(c) => {
				const { root, open } = c.req.valid("json");
				const result = updateSession(spoolDir, root, open);
				if (result.kind === "unregistered") {
					return c.text(`not a registered project root: ${result.root}`, 400);
				}
				machineStateWatch.acknowledgeSession(result.session);
				emitAppEvent({ kind: "session" });
				return c.body(null, 204);
			},
		)
		// tabs dragged into an arrangement: the list is the whole mutation, and it
		// opens and closes nothing — a root it no longer names stays open
		.put(
			"/api/session/order",
			validator("json", (value, c) => {
				const { order } = value as { order?: unknown };
				if (!Array.isArray(order) || order.some((root) => typeof root !== "string")) {
					return c.text('a tab arrangement must be { "order": string[] }', 400);
				}
				return { order: order as string[] };
			}),
			(c) => {
				const session = orderSession(spoolDir, c.req.valid("json").order);
				machineStateWatch.acknowledgeSession(session);
				emitAppEvent({ kind: "session" });
				return c.body(null, 204);
			},
		)
		// #281: the settings registry with its values, for one project or for none.
		// A project setting asked for without a project reads as its default.
		.get("/api/settings", (c) => {
			const name = c.req.query("project");
			if (name === undefined || name === "") return c.json(settings.read());
			const project = resolveProject(c, name);
			if ("response" in project) return project.response;
			return c.json(settings.read(project.root));
		})
		.put(
			"/api/settings",
			validator("json", (value, c) => {
				// one write, or several under `writes`; several are checked as a set
				// and land as one, which is what a theme of ten tokens needs
				const shape =
					'a setting write is { "key", "value", "project"? } or { "writes": [{ "key", "value" }], "project"? }';
				const body = (typeof value === "object" && value !== null ? value : {}) as {
					key?: unknown;
					value?: unknown;
					writes?: unknown;
					project?: unknown;
				};
				if (body.project !== undefined && typeof body.project !== "string") return c.text(shape, 400);
				if (Array.isArray(body.writes)) {
					for (const write of body.writes as unknown[]) {
						const { key } = (typeof write === "object" && write !== null ? write : {}) as { key?: unknown };
						if (typeof key !== "string") return c.text(shape, 400);
					}
					return body as { writes: { key: string; value: unknown }[]; project?: string };
				}
				if (typeof body.key !== "string") return c.text(shape, 400);
				return body as { key: string; value: unknown; project?: string };
			}),
			(c) => {
				const body = c.req.valid("json");
				let root: string | undefined;
				if (body.project !== undefined) {
					const project = resolveProject(c, body.project);
					if ("response" in project) return project.response;
					root = project.root;
				}
				const one = !("writes" in body);
				const writes = "writes" in body ? body.writes : [{ key: body.key, value: body.value }];
				const written = settings.writeMany(writes, root);
				if (!written.ok) return c.text(written.reason, written.status);
				// history reads its flag off canvas.json at every window, but a project
				// switched on has to be picked up now rather than at the next arrival
				if (writes.some((write) => write.key === "history")) history.keeping(registeredRoots());
				emitAppEvent({ kind: "settings" });
				return c.json(one ? written.readings[0] : written.readings);
			},
		)
		.get("/api/events", (c) => {
			return streamSSE(c, async (stream) => {
				let id = 0;
				// subscribed before the first write: an event emitted while hello is
				// still in flight is delivered, never dropped into the handshake gap
				const listener = (event: AppEvent) => {
					void stream.writeSSE({ event: "app", data: JSON.stringify(event), id: String(id++) }).catch(() => {});
				};
				appListeners.add(listener);
				stream.onAbort(() => {
					appListeners.delete(listener);
				});
				beatWhileOpen(stream);
				// hello carries the daemon's version — the reconnect after an upgrade
				// answers a different one, and the page reloads itself on it (#30)
				await stream.writeSSE({
					event: "hello",
					data: JSON.stringify({ name: "spool", version, latest: updateAvailable() ?? null }),
					id: String(id++),
				});
				await new Promise<void>((resolve) => stream.onAbort(resolve));
			});
		})
		.get("/api/fs/list", (c) => {
			const path = c.req.query("path");
			const listing = listDirectory(path);
			if (listing === undefined) return c.json({ error: "no such directory" }, 404);
			// no path is the picker opening: the moment to walk home again behind the index that stands (#277)
			if (path === undefined) void refreshIndex(fsIndex);
			return c.json(listing);
		})
		.get("/api/fs/search", async (c) => {
			// one indexed walk of home, answered under the folder asked for: the browse is what an empty query still shows
			const found = await searchDirectories(c.req.query("q") ?? "", { ...fsIndex, under: c.req.query("under") });
			if (found === undefined) return c.json({ error: "not under home" }, 400);
			return c.json(found);
		})
		.post("/api/projects/open", validator("json", requestedPath), (c) => {
			try {
				const { root } = openProject(c.req.valid("json").path, spoolDir);
				return c.json({ root, name: basename(root) });
			} catch (error) {
				if (!(error instanceof SpoolError)) throw error;
				// nothing found by walk-up: the picker's next move is offering init
				return c.json({ error: error.message, offerInit: true }, 404);
			}
		})
		.post("/api/projects/init", validator("json", requestedPath), (c) => {
			try {
				const { root } = initProject(c.req.valid("json").path, spoolDir);
				return c.json({ root, name: basename(root) });
			} catch (error) {
				if (!(error instanceof SpoolError)) throw error;
				return c.json({ error: error.message }, 409);
			}
		})
		.post("/api/projects/create", validator("json", requestedNewProject), (c) => {
			try {
				const { path, name } = c.req.valid("json");
				// the "+" (#242): mkdir, then the same scaffold init runs
				const { root } = createProject(path, name, spoolDir);
				return c.json({ root, name: basename(root) });
			} catch (error) {
				if (!(error instanceof SpoolError)) throw error;
				return c.json({ error: error.message }, 409);
			}
		})
		.post(
			"/api/projects/forget",
			validator("json", (value, c) => {
				const root = (value as { root?: unknown }).root;
				if (typeof root !== "string" || root === "") {
					return c.json({ error: 'expected { "root": "/abs/dir" }' }, 400);
				}
				return { root };
			}),
			(c) => {
				// home's remove (#13): the registry forgets, the folder is untouched —
				// and its open tab closes in the same machine-state mutation
				const { root } = c.req.valid("json");
				const result = forgetResolvedProject(spoolDir, root);
				if (result.removed) {
					machineStateWatch.acknowledgeRegistry(result.registry);
					emitAppEvent({ kind: "registry" });
				}
				if (result.sessionChanged) {
					machineStateWatch.acknowledgeSession(result.session);
					emitAppEvent({ kind: "session" });
				}
				if (!result.removed) {
					return c.json({ error: `not a registered project root: ${root}` }, 404);
				}
				return c.body(null, 204);
			},
		)
		.get("/api/projects", async (c) => {
			// the app waits on this before it shows anything, and every card is a
			// walk of a project's design folder — so they run together (#13)
			const projects: ProjectCard[] = await Promise.all(
				readRegistry(spoolDir).projects.map(async (project) => ({
					name: basename(project.root),
					root: project.root,
					openedAt: project.openedAt,
					...(await summarizeProject(project.root)),
				})),
			);
			projects.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
			return c.json({ projects });
		})
		.get("/api/p/:project/frames", (c) => {
			const name = c.req.param("project");
			const project = resolveProject(c, name);
			if ("response" in project) return project.response;
			try {
				const projection = listProjectFrames(project.root, { seen: true });
				return c.json({
					...projection,
					frames: projection.frames.map((frame) => {
						// This read is the moment a canvas learns a frame has no cover
						// to show, and a frame with none renders its placeholder and
						// asks for nothing (#111). So the heal is enqueued here rather
						// than waiting for a request that will never come.
						if (frame.cover === undefined) requestHeal(project.root, name, frame.name, frame);
						return frame;
					}),
				});
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				throw error;
			}
		})
		.get("/covers/:project/:frame/:hash", async (c) => {
			// The hash addresses the image content, which makes the URL both the credential because an <img> cannot
			// carry the control header, and an immutable cache key, so a warm
			// reload fetches none of them.
			const name = c.req.param("project");
			const project = resolveProject(c, name);
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			const hash = c.req.param("hash");
			if (!isSafeName(frame) || !isCoverHash(hash)) {
				return c.text("no such cover", 404);
			}
			let exists = false;
			try {
				exists = frameExists(project.root, frame);
				const image = exists ? readCoverImage(project.root, frame, hash) : undefined;
				if (image !== undefined) {
					immutableCover(c, image.type);
					return c.body(new Uint8Array(image.bytes));
				}
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				throw error;
			}
			// The address named a cover this frame does not have. Heal it: the shot
			// lands, the thumb event carries the new image, and the canvas asks
			// again at the address that now exists.
			if (exists) requestHeal(project.root, name, frame);
			return c.text("no such cover", 404);
		})
		.get("/api/p/:project/state", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json(readCanvasState(project.root));
		})
		.put(
			"/api/p/:project/state",
			validator("json", (value, c) => {
				const state = parseCanvasState(value);
				if (state === undefined) {
					return c.text(
						"canvas state must be an object without mode; supported fields are camera, arrows, activePage, and pageCameras",
						400,
					);
				}
				return state;
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				try {
					writeCanvasState(project.root, c.req.valid("json"));
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				return c.body(null, 204);
			},
		)
		/*
		 * Manual order (#228), beside the camera because both are arrangement —
		 * and in a different file, because this one is the canvas rather than
		 * this machine's view of it: canvas.json is committed and cloned where
		 * .spool/ is per-machine ephemera.
		 *
		 * What is stored is advisory. A name in it can be stale, can name a
		 * frame that has since moved page, and can be missing one born a second
		 * ago, so a PUT is never refused for naming a frame the projection does
		 * not have and a read never rewrites the file to agree — the client
		 * merges the two, and cleaning here would drop the place a frame an
		 * agent is halfway through writing is about to come back to.
		 */
		.get("/api/p/:project/order", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			// the document rather than the daemon's reading of it: a flat project's
			// pages are the bare list they have always been (#231)
			const order = answeringDiskRefusals(c, () => storedOrder(readOrder(project.root)));
			if ("response" in order) return order.response;
			return c.json(order.value);
		})
		.put(
			"/api/p/:project/order",
			validator("json", (value, c) => {
				const order = parseOrder(value);
				if (order === undefined) {
					return c.text(
						'order must be { "pages": [page, ...] or { "<page>": [page, ...] }, "frames": { "<page>": [frame, ...] } }',
						400,
					);
				}
				return order;
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const written = answeringDiskRefusals(c, () => writeOrder(project.root, c.req.valid("json")));
				if ("response" in written) return written.response;
				return c.body(null, 204);
			},
		)
		/**
		 * Where each page stands on the field holding it (#265).
		 *
		 * The second thing about this canvas a hand arranged, and it goes in the
		 * same committed file for the same reason. There is no GET beside this
		 * one: a page's place arrives on the projection, already completed for
		 * every page that had none, so a second read would only be able to say
		 * less.
		 */
		.put(
			"/api/p/:project/places",
			validator("json", (value, c) => {
				const places = parsePlaces(value);
				if (places === undefined) {
					return c.text('places must be { "<page>": { "x": number, "y": number } }', 400);
				}
				return places;
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const written = answeringDiskRefusals(c, () => writePlaces(project.root, c.req.valid("json")));
				if ("response" in written) return written.response;
				return c.body(null, 204);
			},
		)
		.get("/api/p/:project/flows", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json(await flowGraph.flows(project.root));
		})
		.post("/api/p/:project/flows/resolve", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			// the pass dials this daemon: before the server binds there is no
			// origin to render from, and in-process app.request() never binds one
			if (selfOrigin === undefined) return c.json({ skipped: 0, read: 0, unavailable: 0, ran: false });
			const listing = listProjectFrames(project.root);
			const frames = listing.frames.map((frame) => ({ name: frame.name, width: frame.w, height: frame.h }));
			try {
				const result = await resolvePass.run({
					root: project.root,
					project: c.req.param("project"),
					origin: selfOrigin,
					frames,
				});
				return c.json({ ...result, ran: true });
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				throw error;
			}
		})
		.post(
			"/api/p/:project/walked",
			validator("json", (value, c) => {
				const { from, to } = (value ?? {}) as { from?: unknown; to?: unknown };
				if (typeof from !== "string" || !isSafeName(from) || typeof to !== "string" || !isSafeName(to)) {
					return c.text('a walk is { "from": "<frame>", "to": "<frame>" }', 400);
				}
				return { from, to };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { from, to } = c.req.valid("json");
				// only witness walks between frames that really exist — a session
				// racing a delete records nothing
				for (const frame of [from, to]) {
					if (!frameExists(project.root, frame)) {
						return c.text(`no frame "${frame}" to walk`, 404);
					}
				}
				// a mark that records moves the flows payload; a discarded walk is
				// silent — the map never claims more than source (#34)
				try {
					if (recordWalk(project.root, from, to)) hub.publish(project.root, { kind: "walked" });
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				return c.body(null, 204);
			},
		)
		/**
		 * These frames have been looked at (seen.ts). The canvas says so when a
		 * frame has held enough of the viewport long enough to have been read, and
		 * when one is pressed. Names the project does not hold are ignored rather
		 * than refused: a browser one beat behind a delete is not an error.
		 */
		.post(
			"/api/p/:project/seen",
			validator("json", (value, c) => {
				const { frames } = (value ?? {}) as { frames?: unknown };
				if (!Array.isArray(frames) || frames.some((name) => typeof name !== "string" || !isSafeName(name))) {
					return c.text('seen is { "frames": ["<frame>", ...] }', 400);
				}
				return { frames: frames as string[] };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				try {
					const dirs = frameDirectories(project.root);
					markSeen(
						project.root,
						[...dirs].map(([name, dir]) => ({ name, dir })),
						c.req.valid("json").frames,
					);
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				return c.body(null, 204);
			},
		)
		/*
		 * The two ways there is no agent to talk to, one door each (#201).
		 *
		 * They are two doors because they are two questions, and `agent-preflight.ts` is
		 * where that split is argued. What the shape of these routes carries is when each is
		 * allowed to be asked: the `which` is free and stable, so the rail asks it on open,
		 * and the login costs a process inside somebody else's product, so it is only ever
		 * opened by a hand on `check again`.
		 */
		.get("/api/p/:project/agent/installed", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json({ installed: agentInstalled(process.env, agentLook) });
		})
		.get("/api/p/:project/agent/login", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			// the probe is this request's process and nobody else's, so it goes when the
			// request does: a page navigated off mid-check would otherwise leave a whole
			// binary running for the length of its own timeout with nobody to hear it
			return c.json(
				await askAgentLogin({
					executor: spawnAgent,
					root: project.root,
					env: process.env,
					signal: c.req.raw.signal,
				}),
			);
		})
		.post(
			"/api/p/:project/agent/turn",
			validator("json", (value, c) => {
				const body = (typeof value === "object" && value !== null ? value : {}) as {
					said?: unknown;
					turn?: unknown;
					thread?: unknown;
				};
				// a turn is what the human said, which is one message when they pressed Enter
				// against a quiet rail and several when a queue fired as one turn (#170)
				if (!Array.isArray(body.said) || body.said.length === 0) {
					return c.text('a turn is { "said": [{ "prompt": "…" }] }', 400);
				}
				if (body.turn !== undefined && (typeof body.turn !== "string" || body.turn === "")) {
					return c.text('"turn" is the id a stop names this turn by', 400);
				}
				// the conversation this turn belongs to, which is the agent's own session id
				// (#120): spool mints it before there is a process, so it is never optional and
				// never anything but the uuid shape the binary takes
				if (!isThreadId(body.thread)) {
					return c.text('"thread" is the uuid this conversation runs under', 400);
				}
				const said: { prompt: string; selection?: SelectionEntry[]; attachment?: Attachment }[] = [];
				for (const raw of body.said) {
					const one = (typeof raw === "object" && raw !== null ? raw : {}) as {
						prompt?: unknown;
						selection?: unknown;
						attachment?: unknown;
					};
					if (typeof one.prompt !== "string" || one.prompt.trim() === "") {
						return c.text('a turn is { "said": [{ "prompt": "…" }] }', 400);
					}
					// an attachment is optional and never guessed at: a picture spool cannot
					// send is said out loud rather than dropped out of the message (#119)
					const attached = one.attachment === undefined ? undefined : parseAttachment(one.attachment);
					if (one.attachment !== undefined && attached === undefined) {
						return c.text(
							`an attachment is { "media": "image/png", "data": "<base64>" } — png, jpeg, gif or webp under ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`,
							400,
						);
					}
					// a message that captured its own selection at Enter hands it back here;
					// one that did not is asking for what the hands are pointing at now (#170)
					const captured = one.selection === undefined ? undefined : parseSelectionEntries(one.selection);
					if (one.selection !== undefined && captured === undefined) {
						return c.text('"selection" is the entry list this daemon served the rail', 400);
					}
					said.push({
						prompt: one.prompt,
						...(captured === undefined ? {} : { selection: captured }),
						...(attached === undefined ? {} : { attachment: attached }),
					});
				}
				return { said, thread: body.thread, turn: typeof body.turn === "string" ? body.turn : undefined };
			}),
			(c) => {
				// one turn, streamed as it arrives (#191): the prompt goes down the
				// binary's stdin and its events come back over this response in the
				// order the wire sent them
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { said, thread, turn: named } = c.req.valid("json");
				/*
				 * One turn per conversation, refused rather than replaced (#211).
				 *
				 * A thread holding a running turn is a thread with a process standing in the repo,
				 * and a second one would be two agents writing the same files against a prompt
				 * neither of them can see. The rail queues into a running turn rather than sending,
				 * so this only ever catches a client that lost its stream and came back without
				 * attaching — and saying so is what sends it to the door below.
				 */
				if (liveTurns.get(project.root, thread)?.running === true) {
					return c.text(
						`a turn is already running in thread "${thread}" — attach to it rather than starting a second`,
						409,
					);
				}
				const turn = startAgentTurn({
					executor: spawnAgent,
					root: project.root,
					permissions: settings.agentPermissions(project.root),
					/*
					 * The thread, in the binary's own vocabulary for one (#120, #200).
					 *
					 * Resume when the session file is there and start it under the same id when it
					 * is not, because the two flags are exclusive and the file is the fact: the
					 * binary deletes its own sessions after thirty days, so a thread that outlived
					 * one carries on under its own id rather than failing a resume. The rail has
					 * already stopped offering it as continuable by then — this is the honest
					 * floor under that, not a second opinion about it.
					 */
					session: { id: thread, resume: sessionExists(project.root, thread, process.env) },
					// what the hands are pointing at rides with the words, in the bytes
					// `spool selection` prints for this same moment (#116) — or, for a
					// message the queue held, for the moment it was said (#170)
					content: agentPromptContent(
						said.map((one) => ({
							prompt: one.prompt,
							selection: selectionBlock(one.selection ?? selections.get(project.root)),
							...(one.attachment === undefined ? {} : { attachment: one.attachment }),
						})),
					),
					// the machine this thread chose, handed to the process that will answer: a
					// resume restores the conversation, and the flag is what makes the choice a
					// property of the thread rather than of whichever turn last said so
					ask: agentAsks.get(askKey(project.root, thread)) ?? {},
				});
				const held = liveTurns.hold({
					root: project.root,
					thread,
					turn,
					...(named === undefined ? {} : { id: named }),
				});
				return attachTurn(c, held, 0);
			},
		)
		/*
		 * The same turn, read again from wherever a client left off (#211).
		 *
		 * A refresh, a lid, a dropped socket: the browser loses the response and the turn goes
		 * on, so what a returning rail needs is not a new turn but the one it was reading. It
		 * asks for the turn in this thread, says how much of it it has, and gets the rest —
		 * the log from that point, and then everything that arrives after.
		 *
		 * From zero by default, which is what a fresh page asks for: the fold from the event
		 * union to the drawing is the rail's and it is pure, so handing back every event the
		 * turn has produced rebuilds exactly what was on screen. Nothing down here folds
		 * anything, which is #120's seam kept where it was.
		 */
		.get(
			"/api/p/:project/agent/turn/:thread",
			validator("query", (value) => {
				// how much of the turn the client already has, which is the id it wants first.
				// Anything that is not a whole number is a client that has nothing, and that is a
				// replay rather than a refusal: a bad query must cost the read no events, never
				// the turn
				const said = (value as { from?: unknown }).from;
				const from = Number.parseInt(typeof said === "string" ? said : "", 10);
				return { from: Number.isInteger(from) && from > 0 ? from : 0 };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const thread = c.req.param("thread");
				if (!isThreadId(thread)) {
					return c.text("a thread is named by the uuid its session runs under", 400);
				}
				const held = liveTurns.get(project.root, thread);
				// nothing is being held for this conversation: it ended long enough ago to have
				// been let go of, or it never ran here. Both are the same fact from here, and the
				// picture on disk is the whole of what the rail can draw for one of them
				if (held === undefined) return c.text(`no turn to read in thread "${thread}"`, 404);
				return attachTurn(c, held, c.req.valid("query").from);
			},
		)
		.post(
			"/api/p/:project/agent/interrupt",
			validator("json", (value, c) => {
				const body = (typeof value === "object" && value !== null ? value : {}) as { turn?: unknown };
				if (typeof body.turn !== "string" || body.turn === "") {
					return c.text('a stop is { "turn": "…" }', 400);
				}
				return { turn: body.turn };
			}),
			(c) => {
				/*
				 * The way out of a turn that is already running (#165).
				 *
				 * Its own door for the reason an answer has one: the turn's stream is a
				 * response the client is reading and has no way back up. The turn names
				 * itself when it starts, so a project holding two of them stops the one the
				 * hands are looking at rather than both.
				 *
				 * What goes down the wire is a request rather than a kill. The process
				 * survives it and ends the turn itself, which is why this answers with
				 * nothing: everything there is to say arrives on the stream.
				 */
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { turn: named } = c.req.valid("json");
				for (const held of liveTurns.of(project.root)) {
					if (held.id === named && held.interrupt()) return c.body(null, 204);
				}
				// nothing is running under that name: it ended on its own, or it was never
				// this project's. Both are the same fact from here, and both mean stopped
				return c.text(`no turn "${named}" to stop`, 404);
			},
		)
		.post(
			"/api/p/:project/agent/answer",
			validator("json", (value, c) => {
				const body = (typeof value === "object" && value !== null ? value : {}) as {
					request?: unknown;
					reply?: unknown;
				};
				const reply = parseAgentReply(body.reply);
				if (typeof body.request !== "string" || body.request === "" || reply === undefined) {
					return c.text(
						'an answer is { "request": "…", "reply": { "kind": "allow" | "always" | "deny" | "said" | "picked" } }',
						400,
					);
				}
				return { request: body.request, reply };
			}),
			(c) => {
				/*
				 * The answer to a request the turn is parked on (#121, #145).
				 *
				 * It is its own door rather than a second body on the turn's stream, because
				 * that stream is a response the client is reading and has no way back up. The
				 * request's own id is the address, so nothing here has to name a turn: a
				 * project can hold several and exactly one of them is holding this request.
				 */
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { request, reply } = c.req.valid("json");
				for (const held of liveTurns.of(project.root)) {
					if (held.answer(request, reply)) return c.body(null, 204);
				}
				// nobody is waiting on it: the turn ended, it was answered already, or it
				// belongs to another project. All three are the same fact from here
				return c.text(`no waiting request "${request}"`, 404);
			},
		)
		/*
		 * The threads of this project, as they survive (#120, #136, #200).
		 *
		 * The picture is the rail's and the disk is the daemon's, which is the whole seam:
		 * the fold from the event union to what is drawn lives in the rail, so the rail is
		 * what writes the drawing, and nothing down here has a second opinion about the
		 * vocabulary. What the daemon adds is the two facts only it can answer — whether a
		 * thread's process was taken by a restart, and whether the agent's own session is
		 * still there to continue.
		 */
		.get("/api/p/:project/agent/threads", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json({ threads: serveThreads(spoolDir, project.root, { live: liveTurns.threads(project.root) }) });
		})
		.put(
			"/api/p/:project/agent/threads/:thread",
			validator("json", (value, c) => {
				const put = parseThreadPut(value);
				if (put === undefined) {
					return c.text('a thread is { "ask": "…", "life": "read", "entries": [] }', 400);
				}
				return put;
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const thread = c.req.param("thread");
				if (!isThreadId(thread)) {
					return c.text("a thread is named by the uuid its session runs under", 400);
				}
				putThread(spoolDir, project.root, thread, c.req.valid("json"));
				return c.body(null, 204);
			},
		)
		/*
		 * Closing a thread, which is a tidy rather than a delete (#136).
		 *
		 * It leaves the strip and it leaves nothing else: not the agent's own session, and
		 * not spool's stored picture. Spool does not throw away a readable record because a
		 * tab was put away, so this writes one flag and touches no bytes of the drawing.
		 */
		.post("/api/p/:project/agent/threads/:thread/close", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const thread = c.req.param("thread");
			if (!closeThread(spoolDir, project.root, thread)) {
				return c.text(`no thread "${thread}" to close`, 404);
			}
			// the ask goes with the conversation it was a fact about. It is the one thing
			// here that is spool's own memory rather than a byte on disk, so nothing else
			// forgets it: a daemon left open for a week would otherwise hold an entry for
			// every thread anybody ever opened in it
			agentAsks.delete(askKey(project.root, thread));
			return c.body(null, 204);
		})
		/*
		 * What this thread may pick, and what is answering (#118, #199).
		 *
		 * Asked of the binary every time rather than cached, because the answer is the
		 * installed CLI's: a new model appears because the developer updated it, and a table
		 * spool shipped would be a release behind on the day that happened. It costs one
		 * spawn, no turn and no token — `list_models` is a control request and a bare
		 * `/model` is answered before the model ever sees it.
		 *
		 * Under the thread rather than beside it, because `current` is a fact about one
		 * conversation: the rows are the binary's and the same for all of them, and which of
		 * those rows is answering is not.
		 */
		.get("/api/p/:project/agent/threads/:thread/models", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const thread = c.req.param("thread");
			if (!isThreadId(thread)) {
				return c.text("a thread is named by the uuid its session runs under", 400);
			}
			return c.json(
				await askAgentOffer({
					executor: spawnAgent,
					root: project.root,
					env: process.env,
					ask: agentAsks.get(askKey(project.root, thread)) ?? {},
					// a menu that was opened and closed again is nobody waiting: the spawn
					// this read costs goes with the request that asked for it
					signal: c.req.raw.signal,
				}),
			);
		})
		.post(
			"/api/p/:project/agent/threads/:thread/model",
			validator("json", (value, c) => {
				const body = (typeof value === "object" && value !== null ? value : {}) as {
					value?: unknown;
					effort?: unknown;
				};
				// a leading dash is refused here rather than reasoned about downstream: an
				// offered alias never starts with one, and a value that does is a value being
				// handed to argv where a flag would go
				if (body.value !== undefined && !isModelShaped(body.value)) {
					return c.text('"value" is one of the choices `list_models` named', 400);
				}
				// one lowercase word, which is the shape a level has to have to be an argument
				// at all. Which levels exist is the model's own claim and not a list spool
				// carries: the round trip below is what refuses one the binary will not take
				if (body.effort !== undefined && !isEffortShaped(body.effort)) {
					return c.text('"effort" is one of the levels the model said it supports', 400);
				}
				if (body.value === undefined && body.effort === undefined) {
					return c.text('a choice is { "value": "…" } or { "effort": "…" }', 400);
				}
				return {
					...(body.value === undefined ? {} : { value: body.value as string }),
					...(body.effort === undefined ? {} : { effort: body.effort }),
				} satisfies AgentAsk;
			}),
			async (c) => {
				/*
				 * Choosing one, which is sending the message (#118, #199).
				 *
				 * The menu is a shortcut for `/model haiku` and never a second source of truth,
				 * so this sends that message and answers with what came back. What spool keeps
				 * is only the ask the binary confirmed: an alias it resolved to nothing, or an
				 * effort the environment holds, leaves the readout exactly where it was,
				 * because nothing moved.
				 */
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const thread = c.req.param("thread");
				if (!isThreadId(thread)) {
					return c.text("a thread is named by the uuid its session runs under", 400);
				}
				const wanted = c.req.valid("json");
				const key = askKey(project.root, thread);
				const held = agentAsks.get(key) ?? {};
				const offer = await askAgentOffer({
					executor: spawnAgent,
					root: project.root,
					env: process.env,
					ask: held,
					choose: wanted,
				});
				agentAsks.set(key, askFrom(offer, wanted, held));
				return c.json(offer);
			},
		)
		.get("/api/p/:project/verify/:frame", async (c) => {
			// the agent's compile probe (#25): shot and logs branch on this JSON —
			// ok hands the closure etag (the log cache key), error the text verbatim
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			const doc = await compiler.getDocument(project.root, frame, frameAuthority(project.root));
			if (doc.kind === "missing") return c.json({ kind: "missing", message: doc.message }, 404);
			if (doc.kind === "error") return c.json({ kind: "error", message: doc.message }, 500);
			return c.json({ kind: "ok", etag: doc.etag });
		})
		.post(
			"/api/p/:project/locate",
			validator("json", (value, c) => {
				const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
				const { path, find } = body;
				if (typeof path !== "string" || path === "") return c.text('locate must be { "path", "find": [...] }', 400);
				if (!Array.isArray(find) || !find.every((one): one is string => typeof one === "string")) {
					return c.text('locate must be { "path", "find": [...] }', 400);
				}
				return { path, find };
			}),
			(c) => {
				// where one write landed (#214): the canvas has the strings the edit was made
				// of and only this side owns the file, so the line range comes from here
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { path, find } = c.req.valid("json");
				// nothing found is an answer rather than an error: a file the agent has
				// already moved on from is the ordinary case, and it costs a mark, not a turn
				return c.json({ range: locateInDesign(project.root, path, find) ?? null });
			},
		)
		.get("/api/p/:project/selection", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json({ selection: selections.get(project.root) });
		})
		.put(
			"/api/p/:project/selection",
			validator("json", (value, c) => {
				const put = parseSelectionPut(value);
				if (put === undefined) {
					return c.text('selection must be { "frames": [name, ...] } or { "element": { ... } }', 400);
				}
				return put;
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				selections.set(project.root, c.req.valid("json"));
				// the enriched list comes straight back, because the composer's chips are
				// the promise of what the prompt will carry and only this side knows the
				// paths, the sizes, the line ranges and the excerpts (#116)
				return c.json({ selection: selections.get(project.root) });
			},
		)
		.put(
			"/api/p/:project/geometry",
			validator("json", (value, c) => {
				const frames =
					typeof value === "object" && value !== null ? (value as { frames?: unknown }).frames : undefined;
				if (typeof frames !== "object" || frames === null || Array.isArray(frames)) {
					return c.text('geometry must be { "frames": { "<name>": { x, y, w, h } } }', 400);
				}
				const parsed: Record<string, Geometry> = {};
				for (const [name, raw] of Object.entries(frames)) {
					const geometry = parseGeometry(raw);
					if (!isSafeName(name) || geometry === undefined || geometry.w <= 0 || geometry.h <= 0) {
						return c.text(`not a placeable geometry for "${name}"`, 400);
					}
					parsed[name] = geometry;
				}
				return { frames: parsed };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { frames } = c.req.valid("json");
				// all-or-nothing: every frame resolved before the first sidecar write
				const sidecars = new Map<string, string>();
				const designDir = realDesignDir(project.root);
				try {
					for (const name of Object.keys(frames)) {
						const found = lookupFrame(project.root, name);
						if (found.kind !== "found") return c.text(`no frame "${name}" to place`, 404);
						sidecars.set(name, resolveDesignPath(designDir, sidecarFileIn(found.dir)));
					}
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				for (const [name, geometry] of Object.entries(frames)) {
					const sidecar = sidecars.get(name);
					if (sidecar === undefined) continue;
					writeGeometry(sidecar, geometry, designDir);
					hub.publish(project.root, { kind: "geometry", frame: name });
				}
				return c.body(null, 204);
			},
		)
		/*
		 * The write lane (#253). Hands write frame source only as span patches:
		 * one typed op, parsed fresh and gated, the exact characters replaced,
		 * every other byte left alone. A refusal is the answer rather than an
		 * error — the gesture does not apply, nothing is forwarded to an agent,
		 * and the surface says why. The watcher announces the write like any
		 * other edit, so the document reloads down the one path it always has.
		 */
		.post("/api/p/:project/patch/gate", askBody, async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const { frame, ops } = c.req.valid("json");
			const site = await patchSite(project.root, frame, ops, framesUsingIn(project.root));
			if (site.kind === "error") return c.text(site.message, site.status);
			// an ask that comes back no is a question answered, not a failure
			if (site.kind === "refusal") return c.json({ ok: false, refusal: site.refusal });
			return c.json({ ok: true, path: site.path, fingerprint: site.fingerprint, mapped: site.mapped });
		})
		/*
		 * The read half (#256). The properties rail draws an element before
		 * anybody touches it, so it asks the same file the write lane parses:
		 * the name the author wrote, the literal className, and the refusal a
		 * write would have given. Nothing here writes, and a refusal is part of
		 * the answer rather than an error.
		 */
		.post("/api/p/:project/rungs", rungsBody, async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const { frame, sources } = c.req.valid("json");
			const read = await readRungs(project.root, frame, sources, framesUsingIn(project.root));
			if (read.kind === "error") return c.text(read.message, read.status);
			return c.json({ rungs: read.rungs });
		})
		/*
		 * The compiled theme (#257). Every properties menu reads it, because a
		 * menu that offers Tailwind's defaults while the project's tokens.css
		 * says otherwise is lying about the project. It is the same stylesheets
		 * a frame is compiled against, read through the same pinned Tailwind.
		 */
		.get("/api/p/:project/theme", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			try {
				return c.json({ theme: await readTheme(project.root) });
			} catch (error) {
				// a tokens.css that will not compile is the project's answer, and
				// the rail draws its rows without menus rather than not at all
				return c.text(error instanceof Error ? error.message : "the theme did not compile", 422);
			}
		})
		/*
		 * The compiler as the gate on the free class field (#257). A token lands
		 * only when Tailwind has a utility for it, and what it compiles to is
		 * shown beside it; one that does not carries the reason.
		 */
		.post("/api/p/:project/theme/classes", classesBody, async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const { tokens } = c.req.valid("json");
			try {
				return c.json({ compiled: await compileClasses(project.root, tokens) });
			} catch (error) {
				return c.text(error instanceof Error ? error.message : "the theme did not compile", 422);
			}
		})
		.post("/api/p/:project/patch", patchBody, async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const { frame, ops, fingerprint } = c.req.valid("json");
			const site = await patchSite(project.root, frame, ops, framesUsingIn(project.root), fingerprint);
			if (site.kind === "error") return c.text(site.message, site.status);
			if (site.kind === "refusal") return c.json({ ok: false, refusal: site.refusal }, 409);
			// an op that says what the file already says writes nothing: a rewrite
			// with the same bytes is a reload nobody asked for
			const undo = spanBetween(site.source, site.text);
			if (site.text !== site.source) writeAtomic(site.file, site.text);
			const after = fingerprintOf(site.text);
			return c.json({
				ok: true,
				path: site.path,
				fingerprint: after,
				mapped: site.mapped,
				undo: { path: site.path, ...undo, fingerprint: after },
				// the one project with nothing catching a hand edit hears so once
				...(site.text !== site.source && uncaughtNotice(project.root) ? { uncaught: true } : {}),
			});
		})
		.post("/api/p/:project/asset", assetBody, async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const { frame, source, fingerprint, file, asset } = c.req.valid("json");
			const put: AssetPut =
				file === undefined
					? { kind: "held", path: asset ?? "" }
					: { kind: "new", name: file.name, bytes: Buffer.from(file.data, "base64") };
			const site = await assetSite(project.root, frame, source, put, framesUsingIn(project.root), fingerprint);
			if (site.kind === "error") return c.text(site.message, site.status);
			if (site.kind === "refusal") return c.json({ ok: false, refusal: site.refusal }, 409);
			// the bytes land first: a document that reloads between the two writes
			// must never find an import of a file that is not there yet
			if (site.asset.bytes !== undefined) writeAtomic(site.asset.file, site.asset.bytes);
			const undo = spanBetween(site.source, site.text);
			if (site.text !== site.source) writeAtomic(site.file, site.text);
			const after = fingerprintOf(site.text);
			return c.json({
				ok: true,
				path: site.path,
				asset: `design/${site.asset.path}`,
				fingerprint: after,
				mapped: site.mapped,
				undo: { path: site.path, ...undo, fingerprint: after },
				...(site.text !== site.source && uncaughtNotice(project.root) ? { uncaught: true } : {}),
			});
		})
		/*
		 * The imports the swap may choose from: what sits beside this frame, and
		 * what `shared/assets/` holds. A menu rather than an index — the point of
		 * choose-an-import is that a `src` is never typed.
		 */
		.get(
			"/api/p/:project/assets",
			validator("query", (value, c) => {
				const frame = (value as { frame?: unknown }).frame;
				if (typeof frame !== "string" || !isSafeName(frame)) {
					return c.text("an asset listing is for one frame", 400);
				}
				return { frame };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { frame } = c.req.valid("query");
				const found = lookupFrame(project.root, frame);
				if (found.kind !== "found") return c.text(`no frame "${frame}"`, 404);
				try {
					return c.json({ assets: listAssets(project.root, found.dir) });
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
			},
		)
		.post(
			"/api/p/:project/patch/revert",
			validator("json", (value, c) => {
				const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
				const { path, start, end, text, fingerprint } = body;
				const spans = typeof start === "number" && typeof end === "number" && Number.isInteger(start);
				if (typeof path !== "string" || !spans || typeof text !== "string" || typeof fingerprint !== "string") {
					return c.text('a revert is { "path", "start", "end", "text", "fingerprint" }', 400);
				}
				if (!Number.isInteger(end) || start < 0 || end < start) return c.text("not a span", 400);
				return { path, start, end, text, fingerprint };
			}),
			(c) => {
				// undo and the rollback after a measurement are the same act: put the
				// characters back, and refuse rather than clobber if they moved
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { path, start, end, text, fingerprint } = c.req.valid("json");
				const target = revertTarget(project.root, path);
				if ("message" in target) return c.text(target.message, target.status);
				const { file } = target;
				let source: string;
				try {
					source = readFileSync(file, "utf8");
				} catch {
					return c.text(`no ${path} to put back`, 404);
				}
				if (fingerprintOf(source) !== fingerprint) return c.json({ ok: false, refusal: STALE_FILE }, 409);
				if (end > source.length) return c.text("not a span in this file", 400);
				const replaced = source.slice(start, end);
				const next = applySpan(source, { start, end, text });
				if (next !== source) writeAtomic(file, next);
				const after = fingerprintOf(next);
				return c.json({
					ok: true,
					path,
					fingerprint: after,
					// its own inverse comes back, so a redo is the same call again
					undo: { path, start, end: start + text.length, text: replaced, fingerprint: after },
				});
			},
		)
		/*
		 * The explorer's verbs (#228). Every one of them moves or copies a
		 * folder, so the law that the canvas never writes frame source stands: a
		 * rename leaves the `data-go` literals naming the old name exactly as
		 * the author wrote them, and the flow map re-derives and reports a
		 * target it can no longer find, which is where that fix belongs.
		 *
		 * None of them publishes an event. Each is a folder move under design/
		 * that the watcher sees and names for itself — unlike a geometry write,
		 * which the watcher classifies as a move rather than an edit and which
		 * the API says early so a drag reaches another browser at once.
		 */
		.post("/api/p/:project/frames/rename", renameBody, (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const { from, to } = c.req.valid("json");
			return explorerVerb(
				c,
				() => renameFrame(project.root, from, to),
				() => c.body(null, 204),
			);
		})
		.post("/api/p/:project/pages/rename", renameBody, (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const { from, to } = c.req.valid("json");
			return explorerVerb(
				c,
				() => renamePage(project.root, from, to),
				() => c.body(null, 204),
			);
		})
		.post(
			"/api/p/:project/frames/move",
			validator("json", (value, c) => {
				const body = bodyFields(value);
				const frames = nameList(body.frames);
				const { page } = body;
				if (frames === undefined || typeof page !== "string") {
					return c.text('a move is { "frames": [name, ...], "page": "…" }, "" being the root page', 400);
				}
				return { frames, page };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { frames, page } = c.req.valid("json");
				return explorerVerb(
					c,
					() => moveFrames(project.root, frames, page),
					() => c.body(null, 204),
				);
			},
		)
		.post(
			"/api/p/:project/pages/move",
			validator("json", (value, c) => {
				const body = bodyFields(value);
				const pages = nameList(body.pages);
				const { page } = body;
				if (pages === undefined || typeof page !== "string") {
					return c.text('a page move is { "pages": [page, ...], "page": "…" }, "" being the root page', 400);
				}
				return { pages, page };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { pages, page } = c.req.valid("json");
				return explorerVerb(
					c,
					() => movePages(project.root, pages, page),
					() => c.body(null, 204),
				);
			},
		)
		.post(
			"/api/p/:project/frames/duplicate",
			validator("json", (value, c) => {
				const body = bodyFields(value);
				const frames = nameList(body.frames);
				const { page } = body;
				if (frames === undefined || (page !== undefined && typeof page !== "string")) {
					return c.text('a duplicate is { "frames": [name, ...], "page"?: "…" }', 400);
				}
				return { frames, page };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { frames, page } = c.req.valid("json");
				// the minted names come straight back: only this side knows them, and
				// the rail has copies to select the moment it hears they exist
				return explorerVerb(
					c,
					() => duplicateFrames(project.root, frames, page),
					(done) => c.json({ frames: done.copies }),
				);
			},
		)
		.post(
			"/api/p/:project/pages/duplicate",
			validator("json", (value, c) => {
				const { name } = bodyFields(value);
				if (typeof name !== "string") return c.text('a page duplicate is { "name": "…" }', 400);
				return { name };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				return explorerVerb(
					c,
					() => duplicatePage(project.root, c.req.valid("json").name),
					(done) => c.json({ page: done.page, frames: done.copies }),
				);
			},
		)
		.post(
			"/api/p/:project/pages/create",
			validator("json", (value, c) => {
				const { name } = bodyFields(value);
				if (typeof name !== "string") return c.text('a page is { "name": "…" }', 400);
				return { name };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				return explorerVerb(
					c,
					() => createPage(project.root, c.req.valid("json").name),
					() => c.body(null, 204),
				);
			},
		)
		.post(
			"/api/p/:project/trash",
			validator("json", (value, c) => {
				const body = bodyFields(value);
				const frames = body.frames === undefined ? [] : nameList(body.frames);
				const pages = body.pages === undefined ? [] : nameList(body.pages);
				if (frames === undefined || pages === undefined || frames.length + pages.length === 0) {
					return c.text('trash must be { "frames": [name, ...] } or { "pages": [name, ...] }', 400);
				}
				const named: TrashBody = { frames, pages };
				return named;
			}),
			async (c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				// the wire's shape, not the validator's: both sides are optional so a
				// frames-only caller keeps the body it always wrote, and the validator
				// has already refused anything either side is not a list of names
				const { frames = [], pages = [] } = c.req.valid("json");
				const dirs: string[] = [];
				const pageDirs: string[] = [];
				try {
					const designDir = realDesignDir(project.root);
					const held: string[] = [];
					for (const page of pages) {
						const found = pageDir(project.root, page);
						if (found.kind === "refused") return c.text(found.message, found.status);
						held.push(found.dir);
					}
					// a page inside a page being trashed rides along inside its folder, so
					// naming both is one move rather than a move and a miss (#231)
					for (const dir of held) {
						if (!held.some((outer) => dir.startsWith(`${outer}${sep}`))) pageDirs.push(dir);
					}
					for (const name of frames) {
						if (!isSafeName(name)) return c.text(`not a frame name: "${name}"`, 400);
						const found = lookupFrame(project.root, name);
						if (found.kind !== "found") return c.text(`no frame "${name}" to trash`, 404);
						const dir = resolveDesignPath(designDir, found.dir);
						// a frame inside a page being trashed rides along inside its folder,
						// so naming both is one move rather than a move and a miss (#228)
						if (!pageDirs.some((pageFolder) => dir.startsWith(`${pageFolder}${sep}`))) dirs.push(dir);
					}
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				// the whole folder moves; the OS Trash owns restore from here (#7)
				await trashImpl([...pageDirs, ...dirs]);
				// a page that is gone leaves the canvas nowhere to be, and its camera
				// and its place in the rail nothing to describe (#228)
				if (pages.length > 0) {
					try {
						forgetPages(project.root, pages);
					} catch {
						// bookkeeping is not worth un-saying the move for: order is advisory
						// and state validates on read, so a cleanup that threw heals the next
						// time either is read, where answering 500 from here would claim
						// folders that have already gone had never moved at all
					}
				}
				return c.body(null, 204);
			},
		)
		.put("/api/p/:project/thumbs/:frame", async (c) => {
			// A self-capture arrives as one image. The answer is its immutable address, so the canvas can put the new
			// cover on screen without re-reading the projection.
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			// captures are only accepted for frames that exist — never a write for a ghost
			if (!isSafeName(frame) || !frameExists(project.root, frame))
				return c.text(`no frame "${frame}" to cover`, 404);
			let image: Buffer;
			try {
				image = await parseCover(c);
			} catch {
				return c.text("a cover is one image in the cover field", 400);
			}
			let cover: Cover;
			try {
				cover = writeCover(project.root, frame, image);
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				if (error instanceof UnservableCoverError) return c.text(error.message, 400);
				throw error;
			}
			hub.publish(project.root, { kind: "thumb", frame, cover });
			return c.json(cover);
		})
		.post(
			"/api/p/:project/thumbs/:frame/error",
			validator("json", (value, c) => {
				const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
				const { error } = body;
				if (typeof error !== "string" || error === "") return c.text('a capture error is { "error": "..." }', 400);
				return { error: error.slice(0, 240) };
			}),
			(c) => {
				// The reason a self-capture failed (#173), recorded beside the cover it
				// never wrote. Same existence check as the PUT above — a ghost has
				// nothing to record a capture reason against — and no SSE event: the
				// placeholder it explains is already on screen, and this is read by
				// `spool logs`, never drawn on the canvas.
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const frame = c.req.param("frame");
				if (!isSafeName(frame) || !frameExists(project.root, frame))
					return c.text(`no frame "${frame}" to cover`, 404);
				writeCaptureError(project.root, frame, c.req.valid("json").error);
				return c.body(null, 204);
			},
		)
		.get("/p/:project/frames/:frame", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			const doc = await compiler.getDocument(project.root, frame, frameAuthority(project.root));
			if (doc.kind === "missing") return c.text(doc.message, 404);
			if (doc.kind === "error") return c.html(doc.document, 500);
			// A frame document changes whenever its source does, and the etag is the
			// whole of how a browser learns that. Without this the browser is free to
			// guess a freshness lifetime from nothing, so say it: ask every time, and
			// the ask is a 304 for as long as the source stands still.
			c.header("cache-control", "no-cache");
			if (c.req.header("if-none-match") === doc.etag) return c.body(null, 304);
			c.header("etag", doc.etag);
			c.header("x-spool-cache", doc.cache);
			return c.html(doc.document);
		})
		.get(
			"/play/:project",
			validator("query", (value, c) => {
				const parsed = playParams.safeParse(value);
				if (!parsed.success) {
					const issues = parsed.error.issues
						.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
						.join("; ");
					const message = `not a playable request — ${issues}`;
					return value.shell === "1" && hostClass(c.req.url) === "render"
						? c.html(playerLoadErrorDocument(message, "failed to load"), 400)
						: c.text(message, 400);
				}
				return parsed.data;
			}),
			async (c) => {
				const name = c.req.param("project");
				const { frame, scenario, shell, handoff } = c.req.valid("query");
				const controlRequest = hostClass(c.req.url) === "control";
				const shellRender = !controlRequest && shell === "1";
				const shellDocument = (body: string, status: number) =>
					new Response(body, { status, headers: { "content-type": "text/html; charset=UTF-8" } });
				const shellFailure = (message: string, status: number) =>
					shellDocument(playerLoadErrorDocument(message, "failed to load"), status);
				const playScenario = scenario ?? "default";
				if (shellRender && !consumePlayerHandoff(handoff, name, frame, playScenario)) {
					// Single-use stays: a leaked shell URL must not be re-embeddable, since
					// shell mode is what hands a live player port to its parent. This is
					// the one failure the outer page repairs by reloading, so it reports
					// through its own signal rather than the generic load error (#88).
					return shellDocument(playerHandoffRejectedDocument("invalid or expired player shell handoff"), 403);
				}
				if (!shellRender && !controlRequest && handoff !== undefined) {
					return c.text("a player shell handoff requires shell=1", 400);
				}
				const project = resolveProject(c, name);
				if ("response" in project) {
					if (shellRender) return shellFailure(await project.response.text(), project.response.status);
					return project.response;
				}
				const opening = openingOn(project.root, frame, name);
				if ("message" in opening) {
					return shellRender ? shellFailure(opening.message, 404) : c.text(opening.message, 404);
				}
				const { start, projection } = opening;
				const frames = Object.fromEntries(
					projection.frames.map((entry) => [entry.name, { w: entry.w, h: entry.h }]),
				);
				if (controlRequest) {
					// The shell goes out before anything is compiled: the bar and the
					// frame's name paint at once, and the compile is spent behind the
					// iframe's own request, where the shell can watch it and where a
					// failure reports through the load protocol like any other.
					protectControlDocument(c);
					const requestUrl = new URL(c.req.url);
					requestUrl.searchParams.set("frame", start);
					requestUrl.searchParams.set("scenario", playScenario);
					requestUrl.searchParams.set("shell", "1");
					requestUrl.searchParams.set("handoff", issuePlayerHandoff(name, start, playScenario));
					return c.html(
						assemblePlayerShell({
							project: name,
							start,
							frames,
							controlToken,
							innerUrl: `${renderOrigin}${requestUrl.pathname}${requestUrl.search}`,
						}),
					);
				}
				const compiled = await playerCompiler.getBundle(project.root, projection.frames);
				if (compiled.kind === "error") return c.html(playerLoadErrorDocument(compiled.message), 500);
				keepPlayerWarm(project.root);
				const config = {
					project: name,
					projectCapability: projectCapability(project.root),
					start,
					scenario: playScenario,
					frames,
					...(shell === "1" ? { shell: true as const } : {}),
				};
				const etag = playerEtag(compiled.bundle, config);
				if (!shellRender && c.req.header("if-none-match") === etag) return c.body(null, 304);
				if (shellRender) {
					c.header("cache-control", "no-store");
				} else {
					c.header("etag", etag);
				}
				c.header("x-spool-cache", compiled.cache);
				return c.html(assemblePlayerDocument(config, compiled.bundle));
			},
		)
		.get("/play/:project/-/*", (c) => {
			// The composition's modules (#24): named by content, so a name is the
			// module and may be cached for good. They answer only for a project this
			// daemon has already composed — the document that imports them is what
			// composes it — and a name from a bundle since retired still answers for
			// as long as a tab served with it might walk to it.
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const name = c.req.path.slice(c.req.path.indexOf("/-/") + 3);
			const chunk = playerCompiler.getChunk(project.root, name);
			if (chunk === undefined) return c.text("not found", 404);
			c.header("access-control-allow-origin", "*");
			c.header("cache-control", "public, max-age=31536000, immutable");
			c.header("content-type", "text/javascript; charset=utf-8");
			return c.body(chunk);
		})
		.options("/api/p/:project/scenarios/:name", (c) => serveProjectDataPreflight(c))
		.get("/api/p/:project/scenarios/:name", (c) => {
			const project = resolveProjectData(c);
			if ("response" in project) return project.response;
			return serveProjectJson(c, readScenario(project.root, c.req.param("name")));
		})
		.get("/api/p/:project/events", (c) => {
			const name = c.req.param("project");
			const project = resolveProject(c, name);
			if ("response" in project) return project.response;
			return streamSSE(c, async (stream) => {
				let id = 0;
				beatWhileOpen(stream);
				await stream.writeSSE({ event: "hello", data: JSON.stringify({ project: name }), id: String(id++) });
				const unsubscribe = hub.subscribe(project.root, (event) => {
					void stream.writeSSE({ event: "change", data: JSON.stringify(event), id: String(id++) }).catch(() => {});
				});
				stream.onAbort(unsubscribe);
				await new Promise<void>((resolve) => stream.onAbort(resolve));
			});
		})
		.get("/vendor/react.js", async (c) => {
			// sandboxed srcdoc frames fetch this from a null origin — CORS must be open
			c.header("access-control-allow-origin", "*");
			const etag = `"react-${reactVersion}"`;
			if (c.req.header("if-none-match") === etag) return c.body(null, 304);
			c.header("etag", etag);
			c.header("cache-control", "public, max-age=0, must-revalidate");
			c.header("content-type", "text/javascript; charset=utf-8");
			return c.body(await vendorReactJs());
		})
		.get("/vendor/spool.js", (c) => serveRuntime(c, vendorSpoolJs))
		.get("/vendor/spool-jsx.js", (c) => serveRuntime(c, vendorSpoolJsxJs))
		.get("/vendor/fonts/:file", (c) => {
			// the chrome mono rides spool's own install — never a CDN;
			// null-origin sandboxed frames fetch fonts under CORS
			const file = chromeFontFile(c.req.param("file"));
			if (file === undefined) return c.text("no such font", 404);
			c.header("access-control-allow-origin", "*");
			const etag = `"font-${version}-${c.req.param("file")}"`;
			if (c.req.header("if-none-match") === etag) return c.body(null, 304);
			c.header("etag", etag);
			c.header("cache-control", "public, max-age=0, must-revalidate");
			c.header("content-type", "font/woff2");
			return c.body(new Uint8Array(readFileSync(file)));
		})
		.get("/vendor/webfont/:key", async (c) => {
			// A project's own fonts.css named this file's URL and nothing else can
			// (#80): the key is content-addressed and only a resolved stylesheet
			// puts one in reach. Null-origin sandboxed frames fetch it under CORS,
			// both to render and to inline into their own stills.
			const file = await webfonts.read(c.req.param("key"));
			if (file === undefined) return c.text("no such font", 404);
			c.header("access-control-allow-origin", "*");
			const etag = `"webfont-${c.req.param("key")}"`;
			if (c.req.header("if-none-match") === etag) return c.body(null, 304);
			c.header("etag", etag);
			c.header("cache-control", "public, max-age=0, must-revalidate");
			c.header("content-type", file.type);
			return c.body(new Uint8Array(file.bytes));
		})
		.get("/player-assets/react.js", async (c) => {
			const etag = `"react-${reactVersion}"`;
			if (c.req.header("if-none-match") === etag) return c.body(null, 304);
			c.header("etag", etag);
			c.header("cache-control", "public, max-age=0, must-revalidate");
			c.header("content-type", "text/javascript; charset=utf-8");
			return c.body(await vendorReactJs());
		})
		.get("/player-assets/player-shell.js", (c) => serveRuntime(c, vendorPlayerShellJs, false))
		.get("/player-assets/fonts/:file", (c) => {
			const file = chromeFontFile(c.req.param("file"));
			if (file === undefined) return c.text("no such font", 404);
			c.header("cache-control", "public, max-age=0, must-revalidate");
			c.header("content-type", "font/woff2");
			return c.body(new Uint8Array(readFileSync(file)));
		})
		.get("/favicon.svg", (c) => {
			c.header("content-type", "image/svg+xml");
			c.header("cache-control", "no-cache");
			return c.body(development === true ? SPOOL_DEVELOPMENT_FAVICON_SVG : SPOOL_FAVICON_SVG);
		})
		.get("/ui/*", (c) => {
			const asset = readUiAsset(uiDir, c.req.path.slice("/ui/".length));
			if (asset === undefined) return c.text("no such asset", 404);
			c.header("content-type", asset.contentType);
			c.header("cache-control", asset.cacheControl);
			return c.body(new Uint8Array(asset.body));
		})
		.get("/", (c) => serveUiIndex(c))
		.get("/p/:project", (c) => serveUiIndex(c));

	app.onError((error, c) => {
		if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
		throw error;
	});

	async function serveRuntime(c: Context, module: () => Promise<VendorModule>, crossOrigin = true): Promise<Response> {
		if (crossOrigin) c.header("access-control-allow-origin", "*");
		const runtime = await module();
		if (c.req.header("if-none-match") === runtime.etag) return c.body(null, 304);
		c.header("etag", runtime.etag);
		c.header("cache-control", "public, max-age=0, must-revalidate");
		c.header("content-type", "text/javascript; charset=utf-8");
		return c.body(runtime.js);
	}

	function serveProjectDataPreflight(c: Context): Response {
		const requestedHeaders = (c.req.header("access-control-request-headers") ?? "")
			.split(",")
			.map((header) => header.trim().toLowerCase())
			.filter((header) => header !== "");
		if (
			c.req.header("origin") !== "null" ||
			c.req.header("access-control-request-method")?.toUpperCase() !== "GET" ||
			requestedHeaders.length !== 1 ||
			requestedHeaders[0] !== PROJECT_HEADER
		) {
			return c.text("forbidden", 403);
		}
		c.header("access-control-allow-origin", "null");
		c.header("access-control-allow-methods", "GET");
		c.header("access-control-allow-headers", PROJECT_HEADER);
		c.header("vary", "Origin, Access-Control-Request-Headers");
		return c.body(null, 204);
	}

	function serveUiIndex(c: Context): Response {
		const index = readUiIndex(uiDir);
		if (index === undefined) return c.text(UI_MISSING_NOTICE, 503);
		protectControlDocument(c);
		c.header("content-type", index.contentType);
		c.header("cache-control", "no-store");
		// the experiments ride the same boot script rather than a route: a surface
		// that is off has to be absent from the first paint, and a fetch the page
		// waits for would show it first and take it away after
		const boot = `<script>window.__SPOOL_CONTROL__ = ${escapeJsonScript(controlToken)}; window.__SPOOL_RENDER_ORIGIN__ = ${escapeJsonScript(renderOrigin)}; window.__SPOOL_CAPTURE_ORIGIN__ = ${escapeJsonScript(captureOrigin)}; window.__SPOOL_EXPERIMENTS__ = ${escapeJsonScript([...(experiments ?? [])])};</script>`;
		// A development daemon's canvas wears the blue on its ribbon mark, the way
		// its favicon and the lane app's icon already do, so a checkout window and
		// the daily one are not two of the same picture. The mark alone: the thread
		// stays the accent everywhere else. One token, injected ahead of first paint
		// rather than a class the page has to be told to put on. The player is left
		// alone: its chrome frames somebody's design, not this canvas.
		const mark = development === true ? `<style>:root{--color-mark:${SPOOL_DEVELOPMENT_THREAD}}</style>` : "";
		// #281, #282: the look and the tokens a person moved land on <html> itself,
		// ahead of first paint, so a themed chrome never flashes its defaults. The
		// attribute is the appearance and the inline style is the moved tokens,
		// which is exactly what the canvas keeps current after boot, so there is
		// one place for both and no order of stylesheets to get right.
		const readings = settings.read().entries;
		const theme = themeInline(readings);
		const dressed = `data-appearance="${appearanceOf(readings)}"${theme === "" ? "" : ` style="${theme}"`}`;
		const head = `${mark}${boot}`;
		const html = dressHtml(index.body.toString("utf8"), dressed);
		return c.body(html.includes("</head>") ? html.replace("</head>", `${head}\n</head>`) : `${head}\n${html}`);
	}

	/** The attributes onto the document's <html>, or onto one opened for the purpose. */
	function dressHtml(html: string, attributes: string): string {
		const tag = html.match(/<html\b/i);
		if (tag !== null && tag.index !== undefined) {
			const at = tag.index + tag[0].length;
			return `${html.slice(0, at)} ${attributes}${html.slice(at)}`;
		}
		const doctype = html.match(/<!doctype[^>]*>/i);
		const at = doctype === null || doctype.index === undefined ? 0 : doctype.index + doctype[0].length;
		return `${html.slice(0, at)}<html ${attributes}>${html.slice(at)}`;
	}

	function protectControlDocument(c: Context): void {
		// A foreign page must not turn the authenticated UI into a clickjacking
		// oracle. This CSP is the modern rule; X-Frame-Options covers older engines.
		c.header("content-security-policy", "frame-ancestors 'none'");
		c.header("x-frame-options", "DENY");
		c.header("cache-control", "no-store");
	}

	function assemblePlayerShell({
		project,
		start,
		frames,
		controlToken: shellToken,
		innerUrl,
	}: {
		project: string;
		start: string;
		frames: Record<string, { w: number; h: number }>;
		controlToken: string;
		innerUrl: string;
	}): string {
		const config = escapeJsonScript({ project, start, frames, innerUrl, controlToken: shellToken });
		const bridge = `(() => {
	const config = window.__SPOOL_SHELL__;
	const headers = { "${CONTROL_HEADER}": config.controlToken };
	let geometryRevision = 0;
	let geometryRequest = 0;
	let geometrySubscribed = false;
	function retainedGeometry() {
		return Object.entries(config.frames).map(([name, geometry]) => ({ name, w: geometry.w, h: geometry.h }));
	}
	let latestGeometry = retainedGeometry();
	function pendingGeometry() {
		const revision = ++geometryRevision;
		window.dispatchEvent(new CustomEvent("spool-player-geometry-pending", { detail: { revision } }));
		return revision;
	}
	function announceGeometry(revision, frames) {
		window.dispatchEvent(new CustomEvent("spool-player-geometry", { detail: { revision, frames } }));
	}
	function replayGeometry() {
		const revision = pendingGeometry();
		announceGeometry(revision, latestGeometry);
	}
	async function sendGeometry() {
		const request = ++geometryRequest;
		const revision = pendingGeometry();
		let settled = false;
		const fallback = setTimeout(() => {
			if (request !== geometryRequest || settled) return;
			settled = true;
			announceGeometry(revision, latestGeometry);
		}, 1000);
		try {
			const response = await fetch("/api/p/" + encodeURIComponent(config.project) + "/frames", { headers });
			if (!response.ok) throw new Error("geometry unavailable");
			const listing = await response.json();
			if (!Array.isArray(listing.frames)) throw new Error("invalid geometry");
			if (request !== geometryRequest) return;
			const frames = listing.frames
				.filter((frame) => frame && typeof frame.name === "string" && Number.isInteger(frame.w) && frame.w > 0 && Number.isInteger(frame.h) && frame.h > 0)
				.map(({ name, w, h }) => ({ name, w, h }));
			if (frames.length !== listing.frames.length) throw new Error("invalid geometry");
			latestGeometry = frames;
			if (settled || revision !== geometryRevision) {
				replayGeometry();
			} else {
				settled = true;
				announceGeometry(revision, latestGeometry);
			}
		} catch {
			if (request === geometryRequest && !settled) {
				settled = true;
				announceGeometry(revision, latestGeometry);
			}
		} finally {
			clearTimeout(fallback);
		}
	}
	async function followGeometry() {
		void sendGeometry();
		try {
			const response = await fetch("/api/p/" + encodeURIComponent(config.project) + "/events", {
				headers: { ...headers, accept: "text/event-stream" },
			});
			if (!response.ok || !response.body) return;
			geometrySubscribed = true;
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			for (;;) {
				const next = await reader.read();
				if (next.done) return;
				buffer += decoder.decode(next.value, { stream: true });
				const blocks = buffer.split("\\n\\n");
				buffer = blocks.pop() || "";
				for (const block of blocks) {
					const raw = block.match(/^data: (.*)$/m)?.[1];
					if (!raw) continue;
					try {
						const change = JSON.parse(raw);
						if (change.kind === "geometry") void sendGeometry();
					} catch {}
				}
			}
		} finally {
			geometrySubscribed = false;
			setTimeout(followGeometry, 1000);
		}
	}
	addEventListener("spool-player-geometry-request", () => {
		replayGeometry();
		if (geometrySubscribed) void sendGeometry();
	});
	addEventListener("spool-player-walked", (event) => {
		const walk = event.detail;
		if (walk && typeof walk.from === "string" && typeof walk.to === "string") {
			void fetch("/api/p/" + encodeURIComponent(config.project) + "/walked", {
				method: "POST",
				headers: { ...headers, "content-type": "application/json" },
				body: JSON.stringify({ from: walk.from, to: walk.to }),
				keepalive: true,
			});
		}
	});
	void followGeometry();
})();`;
		return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(start)} · ${escapeHtml(project)}</title>
<style>${escapeInlineStyle(playerChromeCss("/player-assets/fonts/"))}</style>
<style>html, body, #root { width: 100%; height: 100%; } body { margin: 0; overflow: hidden; background: #0e0e0e; } .spool-screen { height: 100%; min-height: 0; } .spool-screen > iframe { display: block; width: 100%; height: 100%; border: 0; }</style>
</head>
<body>
<div id="root"></div>
<script>window.__SPOOL_SHELL__ = JSON.parse(${escapeJsonScript(config)});</script>
<script type="importmap">{"imports":{"react":"/player-assets/react.js","react-dom":"/player-assets/react.js","react-dom/client":"/player-assets/react.js","react/jsx-runtime":"/player-assets/react.js"}}</script>
<script type="module">import { bootPlayerShell } from "/player-assets/player-shell.js"; bootPlayerShell(window.__SPOOL_SHELL__);</script>
<script>${escapeInlineScript(bridge)}</script>
</body>
</html>
`;
	}

	return {
		app,
		controlToken,
		/** Stable for this daemon and canonical root; rendered project code receives only its own. */
		projectCapability,
		/** Activate origin-dependent work (the thumb healer) once really bound. */
		setSelfOrigin: (origin: string) => {
			controlOrigin = new URL(origin).origin;
			renderOrigin = renderOriginFor(controlOrigin);
			captureOrigin = captureOriginFor(controlOrigin);
			selfOrigin = renderOrigin;
		},
		/** Begin the daily phone-home — post-listen only, and only when opted in. */
		startUpdateCheck: () => {
			if (updateCheck === true) updateChecker.start();
		},
		/** Walk home for the picker's search now, so the first keystroke ever finds an index standing (#277). */
		warmFsIndex: () => {
			void refreshIndex(fsIndex);
		},
		/** The /term upgrade path — wired by serveDaemon onto the raw server. */
		/**
		 * The checkout's UI watcher finished a rebuild (#30's blind spot).
		 *
		 * An upgrade replaces the daemon, so every open page loses its capability
		 * and reloads itself onto the new bundle. A rebuild replaces only the
		 * bundle: the daemon lives, the capability stays good, and the page keeps
		 * its streams while the JS it is running has been superseded and the
		 * hashed chunks beside it no longer exist on disk. Nothing about that is
		 * visible from the page, which is why it has to be told.
		 */
		announceUiBuild: () => {
			emitAppEvent({ kind: "ui" });
		},
		close: () => {
			for (const stop of playerWarmers.values()) stop();
			playerWarmers.clear();
			void playerCompiler.close();
			machineStateWatch.stop();
			history.close();
			liveTurns.close();
			agentAsks.clear();
			hub.close();
			updateChecker.stop();
			void shots.close();
			void goReader.close();
		},
	};
}

export type AppType = ReturnType<typeof createDaemonApp>["app"];
