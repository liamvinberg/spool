import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Context } from "hono";
import { Hono } from "hono";
import { type SSEStreamingApi, stream, streamSSE } from "hono/streaming";
import { validator } from "hono/validator";
import trash from "trash";
import { z } from "zod";
import { SPOOL_DEVELOPMENT_FAVICON_SVG, SPOOL_DEVELOPMENT_THREAD, SPOOL_FAVICON_SVG } from "../brand";
import { account, type CloudRequestOptions, originOf, sessionVault } from "../cloud-auth";
import { type ColorScheme, coverShape } from "../cover";
import { DOOR_ORIGIN, SPOOL_PAGE_ORIGIN } from "../door";
import { mutateMachineState } from "../machine-state";
import { finishMoves } from "../move-in";
import { fetchLocalCopy } from "../open";
import { isFramePath, isPageSlot, isSafeName } from "../page-path";
import { lookupProjectByName, readRegistry } from "../registry";
import { appearanceOf, themeInline } from "../settings/registry";
import { finishOwedCommits } from "../team-moves";
import { type Presence, readPresenceState } from "../team-sync-protocol";
import { requestUpgrade } from "../upgrade";
import { type AgentAppLauncher, createAgentAppLauncher } from "./agent-app";
import { createAgentDefaults } from "./agent-defaults";
import type { AgentEngine, AgentEngineId, EngineDeps } from "./agent-engine";
import { createClaudeEngine } from "./agent-engine-claude";
import { createCodexEngine } from "./agent-engine-codex";
import { createPiEngine } from "./agent-engine-pi";
import { type AgentExecutor, claudeExecutor } from "./agent-exec";
import { createPlaceholderLedger } from "./agent-frames";
import { createAgentTurns } from "./agent-live";
import { createAgentModelPreferences } from "./agent-model-preferences";
import type { Look } from "./agent-preflight";
import { createAgentPresence } from "./agent-presence";
import { agentRoutes } from "./agent-routes";
import { type BoothSeams, createBooth, createBoothQueue } from "./booth";
import { canvasRoutes } from "./canvas-routes";
import { type CloudAccountServices, createCloudAccount } from "./cloud-account";
import { cloudTeamRoutes } from "./cloud-teams";
import { commentsForPrompt } from "./comment-prompt";
import { commentRoutes, teamPeople } from "./comment-routes";
import { commentStill } from "./comment-stills";
import { createFrameCompiler } from "./compile";
import { DesignBoundaryError } from "./design-path";
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
import { explorerRoutes } from "./explorer-routes";
import { createFlowGraph } from "./flows";
import { servedFrameCsp } from "./frame-csp";
import { frameRevisionOnDisk } from "./frame-revision";
import { refreshIndex } from "./fs-list";
import { createGoReader } from "./go-reader";
import { handRoutes } from "./hand-routes";
import { createHistory, type HistoryClock } from "./history";
import { homeRoutes } from "./home-routes";
import { isLoopbackHost } from "./loopback";
import { machineRoutes } from "./machine-routes";
import { describeMigration, migrateFrameNames } from "./migrate-frame-names";
import { watchForMoves } from "./moved-in";
import { assemblePlayerDocument, chromeFontFile, createPlayerCompiler, playerChromeCss, playerEtag } from "./play";
import { type ProjectJson, readScenario } from "./project-files";
import { createIconWatch, iconType, isIconHash, readProjectIcon } from "./project-icon";
import { withProject } from "./project-route";
import { createThumbnailWatch, readProjectThumbnail } from "./project-thumbnail";
import {
	FRAME_BIRTH,
	frameExists,
	frameGeometry,
	frameNames,
	listProjectFrames,
	listProjectFramesAwaited,
	readFrameGeometry,
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
import { createSelectionStore } from "./selection";
import { type AppEvent, type MachineStateWatchAdapter, watchMachineState } from "./session";
import { setAsideRoutes } from "./set-aside-routes";
import { createSettingsStore } from "./settings";
import { createProjectShares } from "./shares";
import { beatWhileOpen } from "./sse-beat";
import { mapBootStacks } from "./stack-map";
import { createTeamCovers } from "./team-covers";
import { teamProjectRoutes } from "./team-projects";
import { createTeamSync, followedLink, movedOutOf, type OpenSyncSocket, settleMovedOut } from "./team-sync";
import {
	coverSize,
	isCoverHash,
	readCover,
	readCoverImage,
	scanCoverSchemes,
	scanPreBoothCovers,
	writeCaptureError,
	writeCover,
	writePace,
} from "./thumbs";
import { readUiAsset, readUiIndex, UI_MISSING_NOTICE } from "./ui";
import { unstyledWarning } from "./unstyled-classes";
import { createUpdateChecker } from "./update-check";
import {
	reactVersion,
	type VendorModule,
	vendorPlayerShellJs,
	vendorReactDevJs,
	vendorReactJs,
	vendorSpoolJs,
	vendorSpoolJsxJs,
} from "./vendor";
import { type BootLine, planShot, recordBoot, SHOT_AT_MAX_COUNT, SHOT_AT_MAX_MS } from "./verify-record";
import { createWebfonts, type Webfonts } from "./webfonts";

export interface DaemonOptions {
	agentAppLauncher?: AgentAppLauncher;
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
	/** Engine integrations, replaced as a whole by independent fixture engines in tests. */
	agentEngines?: readonly AgentEngine[];
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
	/** Controlled Cloud boundary for the account at the foot of Home. */
	cloudAccountServices?: CloudAccountServices;
	/** The daemon's one boundary to spool.page, for teams, sync, covers and shares: a test's fake, or the Mac's own. */
	cloud?: DaemonCloud;
	/** Where what team sync says about a project goes, besides its open canvases: the log, unless a test listens. */
	teamNotice?: (message: string, root?: string) => void;
	/** How often a local copy gone local asks whether its team pays again: a minute, unless a test can't wait. */
	goneLocalAskMs?: number;
	/** How soon such a copy asks again when spool.page couldn't be reached, doubling up to how often it asks: a minute. */
	goneLocalRetryMs?: number;
	/** The photo booth's browser, starting scheme and waits, as a test sets them. */
	booth?: BoothSeams | undefined;
	/** The foundry boundary behind shared/fonts.css: the network, unless a seam test keeps it off. */
	webfonts?: Webfonts;
}

/** spool.page as the daemon reaches it: where it is, the session vault, the fetch, and the sync socket. */
export interface DaemonCloud extends CloudRequestOptions {
	openSocket?: OpenSyncSocket;
}

/** The player page's params (#24): Zod-validated, path-safe names only. */
const playParams = z.object({
	frame: z.string().refine(isFramePath, { message: "not a frame name" }).optional(),
	scenario: z.string().refine(isSafeName, { message: "not a scenario name" }).optional(),
	shell: z.literal("1").optional(),
	handoff: z
		.string()
		.regex(/^[A-Za-z0-9_-]{43}$/, { message: "not a shell handoff" })
		.optional(),
});

/**
 * What one open canvas shows, told at camera rest (#81): the event stream it
 * rides beside, the page it is on, and the frames inside its viewport.
 */
const canvasView = z.strictObject({
	view: z.uuid(),
	page: z.string().refine(isPageSlot, { message: "not a page" }),
	frames: z.array(z.string().refine(isFramePath, { message: "not a frame name" })).max(100_000),
	scheme: z.enum(["light", "dark"]),
});

/** One boot an agent asked for (#25): the viewport the CLI settled on, and how it should wait. */
const bootRequest = z.strictObject({
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	at: z.array(z.number().int().nonnegative().max(SHOT_AT_MAX_MS)).min(1).max(SHOT_AT_MAX_COUNT).optional(),
	scroll: z.number().int().nonnegative().optional(),
	scenario: z.string().refine(isSafeName, { message: "not a scenario name" }).optional(),
});

/**
 * How often a boot's answer says it is still working. The CLI stops waiting on
 * a daemon that says nothing for much longer than this, so a frame that takes
 * its time and a daemon that went away are never the same silence.
 */
const BOOT_BEAT_MS = 5000;

const PLAYER_HANDOFF_TTL_MS = 30_000;
/** Browser handoffs are deliberately short and bounded: issuing the control document is a public GET. */
const MAX_PLAYER_HANDOFFS = 64;
/**
 * How long after the last design/ change a project is recomposed for play in
 * the background. The composition is whole-project, so an edit anywhere
 * retires it; recomposing once the editor goes quiet means the next play
 * finds it ready instead of paying the compile behind a blank screen.
 */
const PLAYER_WARM_MS = 1_500;
/**
 * The longest a composition for play defers to a busy booth. The booth takes
 * what a canvas shows first, so this is long enough for the screen in view and
 * short of the minutes a whole unpictured project takes.
 */
const PLAYER_BOOTH_PATIENCE_MS = 30_000;

/**
 * The daemon's Hono app, the primary seam: everything observable rides
 * app.request(), no port needed. The inferred AppType is the compile-time
 * tripwire between daemon and UI once the canvas exists.
 */
export function createDaemonApp({
	agentAppLauncher = createAgentAppLauncher(),
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
	agentEngines,
	agentLook,
	machineStateWatchAdapter,
	onMachineStateWatchError,
	historyClock,
	onHistoryNotice,
	home,
	cloudAccountServices,
	cloud,
	teamNotice = (message) => console.error(`spool: ${message}`),
	goneLocalAskMs,
	goneLocalRetryMs,
	booth: boothSeams,
	webfonts: providedWebfonts,
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
	const webfonts = providedWebfonts ?? createWebfonts({ cacheDir: join(spoolDir, "webfonts") });
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
	 * Projects kept composed for play (#24): a project is composed while a canvas
	 * has it open and once it has been played, so a press of play finds it ready
	 * instead of building every frame behind a blank screen, and every edit that
	 * retires the composition rebuilds it once the edits go quiet. Composing
	 * waits until the booth has nothing waiting, because the stills are what an
	 * open canvas is waiting on, but no longer than the booth's patience: a
	 * project with hundreds of frames to picture keeps it busy for minutes. A
	 * project only a canvas kept warm goes cold when its last canvas closes.
	 */
	const playerWarmers = new Map<string, () => void>();
	const playedRoots = new Set<string>();
	function keepPlayerWarm(root: string): void {
		if (playerWarmers.has(root)) return;
		let timer: NodeJS.Timeout | undefined;
		/** When the wait for this composition began, so a booth that stays busy cannot defer it for good. */
		let waitingSince: number | undefined;
		const composeOnceBoothIdle = () => {
			timer = undefined;
			const boothBusy = sittings.waiting > 0 || sittings.busy > 0;
			if (boothBusy && Date.now() - (waitingSince ?? 0) < PLAYER_BOOTH_PATIENCE_MS) {
				arm();
				return;
			}
			waitingSince = undefined;
			void listProjectFramesAwaited(root).then((listing) => playerCompiler.getBundle(root, listing.frames));
		};
		const arm = () => {
			waitingSince ??= Date.now();
			if (timer !== undefined) clearTimeout(timer);
			timer = setTimeout(composeOnceBoothIdle, PLAYER_WARM_MS);
			timer.unref?.();
		};
		const unsubscribe = hub.subscribe(root, (event) => {
			if (event.kind === "frame" || event.kind === "shared") arm();
		});
		arm();
		playerWarmers.set(root, () => {
			if (timer !== undefined) clearTimeout(timer);
			unsubscribe();
		});
	}
	function letPlayerCool(root: string): void {
		if (playedRoots.has(root)) return;
		for (const view of views.values()) if (view.root === root) return;
		playerWarmers.get(root)?.();
		playerWarmers.delete(root);
		void playerCompiler.forget(root);
	}
	const flowGraph = createFlowGraph();
	// a shared/ edit wakes the frames whose graph reaches it, not every document
	/** the placeholder frames running turns hold for their designers, and the ones a last run left go (#369) */
	const placeholders = createPlaceholderLedger(join(spoolDir, "placeholders.json"));
	placeholders.sweep();
	const hub = createChangeHub({ framesUsing: (root, path) => flowGraph.framesUsing(root, path) });
	// what Liam points at, per project — daemon memory only, dies with it (#3)
	const selections = createSelectionStore();
	const trashImpl = moveToTrash ?? (async (paths: string[]) => void (await trash(paths, { glob: false })));
	const trashingProjects = new Set<string>();

	/**
	 * What the write lane needs of the project: who renders a shared file,
	 * which is how far the rail says an edit reaches and whose paint the
	 * canvas holds once it lands (#318). The graph is built rather than
	 * guessed at, because it is only asked for on the shared path.
	 */
	const framesUsingIn = (root: string) => ({
		framesUsing: async (path: string) => {
			await flowGraph.flows(root).catch(() => undefined);
			return flowGraph.framesUsing(root, path);
		},
	});

	/**
	 * The same, for the selection's read (DEV-299): answered from the graph as
	 * last built, and built only when it never was. Every click reads, and
	 * waiting on a fresh pass over every frame made the read queue behind the
	 * rebuild a save had just started; the canvas refetches the graph on every
	 * change anyway, so the last pass is at most one change behind.
	 */
	const lastReadersIn = (root: string) => ({
		framesUsing: async (path: string) =>
			flowGraph.indexed(root) ? flowGraph.framesUsing(root, path) : framesUsingIn(root).framesUsing(path),
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
		if (event.kind === "registry" || event.kind === "project-renamed") {
			history.keeping(registeredRoots());
			boothKeeping(registeredRoots());
			teamSync.keeping(registeredRoots());
			movedIn.keeping(registeredRoots());
			projectShares.keeping(registeredRoots());
			iconKeeping();
		}
		for (const listener of appListeners) listener(event);
	};
	// a project's icon changed on disk, by whatever hand: its card takes the new one on every page
	const iconWatch = createIconWatch({
		subscribe: (root, listener) => hub.subscribe(root, listener),
		changed: (root, icon) => emitAppEvent({ kind: "icon", root, icon: icon ?? null }),
	});
	// and its thumbnail: its card refetches what it shows
	const thumbnailWatch = createThumbnailWatch({
		subscribe: (root, listener) => hub.subscribe(root, listener),
		changed: (root, thumbnail) => emitAppEvent({ kind: "thumbnail", root, thumbnail: thumbnail ?? null }),
	});
	/** The icon watch rides the hub's watchers, which a really-listening daemon holds open for the booth anyway. */
	function iconKeeping(): void {
		if (selfOrigin === undefined) return;
		iconWatch.keeping(registeredRoots());
		thumbnailWatch.keeping(registeredRoots());
	}
	const cloudAccount = createCloudAccount({
		spoolDir,
		...(cloudAccountServices === undefined ? {} : { services: cloudAccountServices }),
		onChange: () => emitAppEvent({ kind: "account" }),
	});
	// the catch-up batch: whatever design/ is already dirty is a batch pending
	history.keeping(registeredRoots());
	// every team project's local copies, kept in step with their teams while the daemon runs
	const teamSync = createTeamSync({
		spoolDir,
		origin: () => originOf(cloud),
		vault: (origin) => cloud?.vault ?? sessionVault(spoolDir, origin),
		...(cloud?.fetch === undefined ? {} : { fetch: cloud.fetch }),
		...(cloud?.openSocket === undefined ? {} : { openSocket: cloud.openSocket }),
		// what didn't travel, a pause and an ending go to the log and to the project's open canvases
		notice: (message, root) => {
			teamNotice(message, root);
			if (root !== undefined) hub.publish(root, { kind: "sync", message });
		},
		onMarks: (root) => hub.publish(root, { kind: "set-aside" }),
		// a pause hollows the copy's team mark on its tab and its cover, and a resume fills it again; a long wait on the
		// minute's bucket is said on the project's open canvases as it begins and ends
		onSyncChanged: (root) => {
			emitAppEvent({ kind: "sync", root, ...syncMarks(root) });
			hub.publish(root, { kind: "sync", message: teamSync.state(root).sending ?? "" });
		},
		// a copy gone local says so on its cover and canvas until its team pays, when they read again
		onGoneLocal: (root) => {
			emitAppEvent({ kind: "sync", root, ...syncMarks(root) });
			if (teamSync.state(root).goneLocal === null) hub.publish(root, { kind: "sync", message: "syncing again" });
		},
		// a copy whose project moved out of its team ended: its cover says so
		onEnded: () => emitAppEvent({ kind: "registry" }),
		// who else is in a team project, for its tab while another is focused (task 139)
		onRoster: (root, people) => emitAppEvent({ kind: "presence", root, people }),
		// the comments a copy knows changed: its open canvases read them again (ADR 0011)
		onComments: (root) => hub.publish(root, { kind: "comments" }),
		...(goneLocalAskMs === undefined ? {} : { goneLocalAskMs }),
		...(goneLocalRetryMs === undefined ? {} : { goneLocalRetryMs }),
	});
	/** What a copy's tab and cover show of its sync: a pause on a limit, or the copy gone local. */
	const syncMarks = (root: string) => {
		const { paused, goneLocal } = teamSync.state(root);
		return { paused, goneLocal };
	};
	teamSync.keeping(registeredRoots());
	// what this machine's agent is doing on a team project, said to the team with its person's presence (#378)
	const agentPresence = createAgentPresence({ publish: (root, agent) => teamSync.copy(root)?.agent(agent) });
	// DEV-190: a project a teammate moved into the team arrives here with the move commit's pull, and is refilled
	const movedIn = watchForMoves({
		refill: async (root) => {
			await fetchLocalCopy(root, spoolDir, {
				origin: originOf(cloud),
				...(cloud === undefined ? {} : { request: cloud }),
				...(cloud?.openSocket === undefined ? {} : { openSocket: cloud.openSocket }),
			});
		},
		arrived: () => teamSync.keeping(registeredRoots()),
		// task 136: a copy whose project moved out of its team waits for the pull that brings design/ back into git
		movedOut: (root) => movedOutOf(root) !== undefined,
		settle: async (root) => {
			const settled = await settleMovedOut(root);
			if (settled) emitAppEvent({ kind: "registry" });
			return settled;
		},
		notice: teamNotice,
	});
	movedIn.keeping(registeredRoots());
	// DEV-190: a move whose commit git didn't take is owed it; it is made now, or at the next start
	const moving = new AbortController();
	void finishMoves(registeredRoots(), { signal: moving.signal }).then((finished) => {
		for (const { root, commit } of finished)
			if (commit.kind === "committed")
				teamNotice(`made the move commit for ${root}: ${commit.commit.slice(0, 7)}`, root);
	});
	// task 136: so is one moving a project to another team, out of one, or into a checkout
	void finishOwedCommits(registeredRoots(), { signal: moving.signal }).then((finished) => {
		for (const { root, commit } of finished)
			if (commit.kind === "committed")
				teamNotice(`made the move commit for ${root}: ${commit.commit.slice(0, 7)}`, root);
	});
	// a team project's covers go up to spool.page, the first of each version from whichever Mac shot it
	const teamCovers = createTeamCovers({
		spoolDir,
		request: () => ({ ...cloud, origin: originOf(cloud) }),
		log: (line) => console.error(`spool: ${line}`),
	});
	// a project's shared pages: a team's through spool.page, and a solo project's uploaded by this daemon
	const projectShares = createProjectShares({
		spoolDir,
		request: cloud,
		version,
		resolve: resolveProject,
		watch: (root, saved) =>
			hub.subscribe(root, (event) => {
				if (event.kind === "frame" || event.kind === "shared" || event.kind === "geometry") saved();
			}),
		log: (line) => console.error(`spool: ${line}`),
	});
	projectShares.keeping(registeredRoots());
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

	// the booth needs a dialable origin, which exists only once the server has
	// bound — in-process app.request() never activates it
	let selfOrigin: string | undefined;
	const sittings = createBoothQueue();
	const booth = createBooth(sittings, {
		origin: () => selfOrigin,
		compile: async (root, frame) => {
			const doc = await compiler.getDocument(root, frame, frameAuthority(root));
			if (doc.kind === "ok") return { kind: "ok", etag: doc.etag, document: doc.document, source: doc.source };
			return doc.kind === "missing" ? { kind: "missing" } : { kind: "error", message: doc.message };
		},
		geometry: (root, frame) => frameGeometry(root, frame),
		covered: (root, frame) => readCover(root, frame) !== undefined,
		registered: (root) => boothWatches.has(root),
		store: (root, frame, bytes, scheme, source) => {
			// a frame deleted while it sat has no folder a picture belongs in
			if (!frameExists(root, frame)) return;
			const cover = writeCover(root, frame, bytes, scheme);
			hub.publish(root, { kind: "thumb", frame, cover });
			if (source !== undefined) teamCovers.stored(root, frame, source, bytes);
			if (source !== undefined) projectShares.covered(root, frame, source, bytes);
		},
		failed: (root, frame, reason) => {
			if (frameExists(root, frame)) writeCaptureError(root, frame, reason);
		},
		paced: (root, frame, pace) => {
			if (frameExists(root, frame)) writePace(root, frame, pace);
		},
		reactDev: vendorReactDevJs,
		// The booth compiles every frame of every registered project, where the
		// canvas only ever compiled the page it showed, and a compiled document
		// holds the frame's whole bundle and stylesheet. One of a page nobody has
		// open is let go once it is photographed, so the cache holds what open
		// canvases are showing rather than everything the booth ever saw. Opening
		// that page later costs each mounted frame one compile.
		finished: (root, frame) => {
			if (sittings.placeOf(root, frame) === "elsewhere") compiler.forget(root, frame);
		},
		...boothSeams,
	});
	/**
	 * The booth listens to every registered project, open in a canvas or not,
	 * the way history does: an agent's edit to a page nobody has open is a
	 * picture owed all the same, and its subscription is what holds that
	 * project's watcher open when no browser is looking.
	 */
	const boothWatches = new Map<string, () => void>();
	/**
	 * Every open canvas, by the id its event stream was handed: the project it
	 * shows, and the colour scheme it last said its frames render in. A view
	 * lives exactly as long as that stream: a canvas that closed, crashed or lost
	 * its connection stops counting the moment the stream does.
	 */
	const views = new Map<string, { root: string; scheme: ColorScheme | undefined }>();
	function boothKeeping(roots: readonly string[]): void {
		if (selfOrigin === undefined) return;
		for (const [root, stop] of boothWatches) {
			if (roots.includes(root)) continue;
			stop();
			boothWatches.delete(root);
			sittings.dropProject(root);
		}
		const arrived: string[] = [];
		for (const root of roots) {
			if (boothWatches.has(root)) continue;
			arrived.push(root);
			const project = basename(root);
			const owe = (frame: string) => booth.enqueue({ root, project, frame, reason: "edited" });
			boothWatches.set(
				root,
				hub.subscribe(root, (event) => {
					try {
						if (event.kind === "frame") {
							if (frameExists(root, event.frame)) owe(event.frame);
							else sittings.drop(root, event.frame);
						} else if (event.kind === "shared") {
							// the link graph names its readers (#109); a file nobody has
							// read yet could be under any frame
							for (const frame of event.frames ?? frameNames(root) ?? []) owe(frame);
						} else if (event.kind === "geometry" && frameExists(root, event.frame)) {
							void resized(root, event.frame).then(
								(owed) => owed && owe(event.frame),
								() => {
									// the same, read later: a cover or sidecar past the design
									// boundary owes nothing, and must never take the daemon down
								},
							);
						}
					} catch {
						// a project whose design folder went strange owes nothing it can be asked
					}
				}),
			);
		}
		// a project's covers may be of the other scheme than the one the booth
		// starts in, or than the one the canvas went to while it was not watched,
		// or taken by a canvas before the booth
		void booth.schemeKnown().then(() => restale(arrived));
	}

	/**
	 * The booth's colour scheme changed: every cover taken in another, of a frame
	 * that follows the scheme, is now a picture of a frame nobody is looking at.
	 * Those are owed again, behind anything edited, and nothing else is: most
	 * frames look the same in both. A project arriving owes the same, and every
	 * cover a canvas took of its own frames before the booth made them.
	 */
	async function restale(roots: Iterable<string>): Promise<void> {
		for (const root of roots) {
			const project = basename(root);
			try {
				for (const [frame, taken] of await scanCoverSchemes(root)) {
					// the scheme may have changed again while the store was read
					if (taken !== booth.scheme && frameExists(root, frame))
						booth.enqueue({ root, project, frame, reason: "stale" });
				}
				for (const frame of await scanPreBoothCovers(root)) {
					if (frameExists(root, frame)) booth.enqueue({ root, project, frame, reason: "stale" });
				}
			} catch {
				// a project whose design folder went strange owes nothing it can be asked
			}
		}
	}

	/**
	 * Whether a frame's stored cover was taken at another size than the frame
	 * has now. A move rewrites the sidecar too, and is not a picture owed; a
	 * resize is, because the cover's layout and its shape are both the old
	 * size's (#113).
	 */
	async function resized(root: string, frame: string): Promise<boolean> {
		const stored = await coverSize(root, frame);
		if (stored === undefined) return true;
		const { w, h } = frameGeometry(root, frame);
		const owed = coverShape(w, h)?.raster;
		if (owed === undefined) return false;
		// Chrome rounds the raster its own way: a pixel either way is the same size
		return stored.width !== owed.width || Math.abs(stored.height - owed.height) > 1;
	}
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
	const executor = agentExecutor ?? claudeExecutor();
	const engineDeps: EngineDeps = { executor, spoolDir, ...(agentLook === undefined ? {} : { look: agentLook }) };
	const engines = new Map<AgentEngineId, AgentEngine>(
		(
			agentEngines ?? [
				createClaudeEngine(engineDeps),
				createCodexEngine({ ...engineDeps, version }),
				createPiEngine(engineDeps),
			]
		).map((engine) => [engine.id, engine]),
	);

	// the agent, model, effort and mode a new thread starts on, one choice per machine (#361)
	const agentDefaults = createAgentDefaults(spoolDir, () => engines.values());
	const projectRenames = new Set<string>();

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
	const modelPreferences = createAgentModelPreferences(spoolDir, agentDefaults);

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
		if (projectRenames.has(lookup.root)) return { response: c.text("Project rename is in progress.", 409) };
		if (trashingProjects.has(lookup.root)) {
			return { response: c.json({ error: "This project is moving to the trash." }, 409) };
		}
		migrateOnce(lookup.root);
		return { root: lookup.root };
	}

	/**
	 * The first read of a project by this daemon renames its walks, when it still
	 * names frames by folder (#336). Once per root per daemon: after that the
	 * stamp says it is done, and a project that failed to migrate answers with
	 * missing walks, which is the flow map's own repair list.
	 */
	const migrated = new Set<string>();
	function migrateOnce(root: string): void {
		if (migrated.has(root)) return;
		migrated.add(root);
		try {
			const done = migrateFrameNames(root);
			if (done === undefined) return;
			console.error(`spool: ${describeMigration(root, done)}`);
		} catch (error) {
			console.error(`spool: could not rename the walks in ${root}: ${(error as Error).message}`);
		}
	}

	/**
	 * A read found a frame with no cover. The booth keeps one entry per frame
	 * and leaves a frame whose cover just failed alone for a while, so calling
	 * this for every uncovered frame in a projection read costs a queue, never a
	 * stampede.
	 */
	function owePicture(root: string, name: string, frame: string): void {
		if (selfOrigin === undefined) return;
		booth.enqueue({ root, project: name, frame, reason: "missing" });
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
	/** The cloud this daemon's team projects live in, whose links knock on it. */
	function linkOrigin(): string | undefined {
		try {
			return originOf(cloud);
		} catch {
			return undefined;
		}
	}

	function healthReaderOrigin(origin: string | undefined): string | undefined {
		if (origin === undefined) return undefined;
		if (origin === DOOR_ORIGIN) return DOOR_ORIGIN;
		// a team project's link at spool.page knocks before it hands over to this Mac
		if (origin === SPOOL_PAGE_ORIGIN || origin === linkOrigin()) return origin;
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
				// in one document unreadable to another project on the shared host,
				// and every frame https-only wherever it plays (DEV-175).
				if (isExecutableRenderPath(path)) c.header("content-security-policy", servedFrameCsp(renderOrigin));
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
		.route(
			"/api",
			machineRoutes({
				resolve: resolveProject,
				spoolDir,
				cloudAccount,
				settings,
				machineStateWatch,
				emitAppEvent,
				historyChanged: () => history.keeping(registeredRoots()),
			}),
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
				// then who else is in each team project, which only changes from here on
				for (const { root, people } of teamSync.rosters()) listener({ kind: "presence", root, people });
				await new Promise<void>((resolve) => stream.onAbort(resolve));
			});
		})
		.route(
			"/api",
			homeRoutes({
				resolve: resolveProject,
				spoolDir,
				settings,
				fsIndex,
				projectRenames,
				trashingProjects,
				liveTurns,
				hub,
				selections,
				machineStateWatch,
				emitAppEvent,
				registeredRoots,
				trash: trashImpl,
				teamSync,
				iconWatch,
				thumbnailWatch,
			}),
		)
		/*
		 * A project's icon: its chosen file or its repo's favicon. The hash is the content, so the address is the
		 * credential an <img> cannot carry as a header and an immutable cache key, as a cover's is. Read-only, and
		 * only ever the file the project's icon resolves to now. An SVG opened on its own runs nothing here: it is
		 * served sandboxed, with no script and nothing fetched.
		 */
		.get("/icons/:project/:hash", async (c) =>
			withProject(c, resolveProject, async (root) => {
				const hash = c.req.param("hash");
				if (!isIconHash(hash)) return c.text("no such icon", 404);
				const found = await readProjectIcon(root);
				if (found === undefined || found.icon.hash !== hash) return c.text("no such icon", 404);
				immutableCover(c, iconType(found.icon.path));
				c.header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
				return c.body(new Uint8Array(found.bytes));
			}),
		)
		// a project's thumbnail, by its content, exactly as its icon is served
		.get("/thumbnails/:project/:hash", async (c) =>
			withProject(c, resolveProject, async (root) => {
				const hash = c.req.param("hash");
				if (!isIconHash(hash)) return c.text("no such thumbnail", 404);
				const found = await readProjectThumbnail(root);
				if (found === undefined || found.thumbnail.hash !== hash) return c.text("no such thumbnail", 404);
				immutableCover(c, iconType(found.thumbnail.path));
				c.header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
				return c.body(new Uint8Array(found.bytes));
			}),
		)
		.route(
			"/api/p",
			canvasRoutes({
				resolve: resolveProject,
				owePicture,
				flowGraph,
				resolvePass,
				origin: () => selfOrigin,
				hub,
				selections,
			}),
		)
		.get("/covers/:project/:frame/:hash", async (c) => {
			const name = c.req.param("project");
			return withProject(c, resolveProject, async (root) => {
				// The hash addresses the image content, which makes the URL both the credential because an <img> cannot
				// carry the control header, and an immutable cache key, so a warm
				// reload fetches none of them.
				const frame = c.req.param("frame");
				const hash = c.req.param("hash");
				if (!isFramePath(frame) || !isCoverHash(hash)) {
					return c.text("no such cover", 404);
				}
				let exists = false;
				try {
					exists = frameExists(root, frame);
					const image = exists ? readCoverImage(root, frame, hash) : undefined;
					if (image !== undefined) {
						immutableCover(c, image.type);
						return c.body(new Uint8Array(image.bytes));
					}
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				// The address named a cover this frame does not have. The booth owes it
				// a picture: the cover lands, the thumb event carries the new image, and
				// the canvas asks again at the address that now exists.
				if (exists) owePicture(root, name, frame);
				return c.text("no such cover", 404);
			});
		})
		/*
		 * What one open canvas shows, for the booth's order (#81): the frames on
		 * screen are photographed first, then the rest of their page. Sent at
		 * camera rest, never per tick, and only when it changed. It names the event
		 * stream it rides beside, because that is how long it stays true; a report
		 * that arrives after its stream has gone describes nobody.
		 */
		.put(
			"/api/p/:project/view",
			validator("json", (value, c) => {
				const parsed = canvasView.safeParse(value);
				return parsed.success ? parsed.data : c.text('a view is { "view", "page", "frames", "scheme" }', 400);
			}),
			(c) =>
				withProject(c, resolveProject, (root) => {
					const { view, page, frames, scheme } = c.req.valid("json");
					const open = views.get(view);
					if (open?.root !== root) return c.body(null, 204);
					sittings.view(view, { root: root, page, frames });
					// Only a canvas whose own scheme changed moves the booth, so two
					// canvases in different schemes do not trade it back and forth on
					// every pan: the one that changed last is the one being looked at.
					if (open.scheme !== scheme) {
						open.scheme = scheme;
						if (booth.setScheme(scheme)) void restale(boothWatches.keys());
					}
					return c.body(null, 204);
				}),
		)
		.route(
			"/api/p",
			agentRoutes({
				resolve: resolveProject,
				spoolDir,
				engines,
				agentDefaults,
				modelPreferences,
				liveTurns,
				projectRenames,
				selections,
				hub,
				placeholders,
				teamSync,
				projectShares,
				agentPresence,
				agentAppLauncher,
				emitAppEvent,
				account: () => account(spoolDir, { ...cloud, origin: originOf(cloud) }),
				commentsForPrompt: (root, ids) =>
					commentsForPrompt(ids, {
						comments: teamSync.comments(root).comments,
						still: (comment) => teamSync.still(root, comment),
					}),
			}),
		)
		.get("/api/p/:project/verify/:frame", async (c) =>
			withProject(c, resolveProject, async (root) => {
				// the agent's compile probe (#25): shot and logs branch on this JSON —
				// ok hands the closure etag (the log cache key), error the text verbatim
				const frame = c.req.param("frame");
				const doc = await compiler.getDocument(root, frame, frameAuthority(root));
				if (doc.kind === "missing") return c.json({ kind: "missing", message: doc.message }, 404);
				if (doc.kind === "error") return c.json({ kind: "error", message: doc.message }, 500);
				// the scheme a boot would render in now, the log cache's third key
				await booth.schemeKnown();
				return c.json({ kind: "ok", etag: doc.etag, scheme: booth.scheme });
			}),
		)
		.post(
			"/api/p/:project/boot/:frame",
			validator("json", (value, c) => {
				const parsed = bootRequest.safeParse(value);
				return parsed.success
					? parsed.data
					: c.text('a boot is { "width", "height", "at"?: [ms, …], "scroll"?: px, "scenario"? }', 400);
			}),
			(c) => {
				// shot and logs (#25): one boot of the served document in the photo
				// booth's browser, ahead of every cover, through the same load and the
				// same settle, and recorded where the CLI reads it back. The answer is
				// lines of JSON, because the first boot on a machine waits on a fetch of
				// the browser, and an agent should hear that while it waits.
				const name = c.req.param("project");
				const project = resolveProject(c, name);
				if ("response" in project) return project.response;
				const frame = c.req.param("frame");
				const { width, height, at, scroll, scenario } = c.req.valid("json");
				c.header("content-type", "application/x-ndjson; charset=utf-8");
				c.header("cache-control", "no-store");
				return stream(c, async (out) => {
					const write = (line: BootLine) => out.write(`${JSON.stringify(line)}\n`);
					const boot = async (): Promise<BootLine> => {
						const doc = await compiler.getDocument(project.root, frame, frameAuthority(project.root));
						if (doc.kind === "missing") return { outcome: { kind: "missing", message: doc.message } };
						if (doc.kind === "error") return { outcome: { kind: "broken", message: doc.message } };
						const plan = planShot(width, height);
						try {
							const shot = await booth.shoot(
								{
									project: name,
									frame,
									width,
									height,
									scale: plan.scale,
									tiles: plan.tiles,
									at: at === undefined ? undefined : [...new Set(at)].sort((a, b) => a - b),
									scroll,
									scenario,
								},
								(line) => void write({ narrate: line }).catch(() => {}),
							);
							if (shot.kind === "unserved") {
								// the source broke between the compile and the load: its text, verbatim
								const again = await compiler.getDocument(project.root, frame, frameAuthority(project.root));
								const message = again.kind === "error" ? again.message : `frame "${frame}" failed to serve`;
								return { outcome: { kind: "broken", message } };
							}
							// an uncaught throw's stack, read back to the frame's own files
							const { entries, errors } = await mapBootStacks(
								shot,
								doc.document,
								`/p/${encodeURIComponent(name)}/frames/${encodeURIComponent(frame)}`,
								() => compiler.sourceMap(project.root, frame),
							);
							// classes its stylesheet never built render unstyled with a clean console
							const unstyled = unstyledWarning(doc.unstyled);
							if (unstyled !== undefined) entries.unshift({ type: "spool", text: unstyled });
							const files = recordBoot(project.root, frame, {
								etag: doc.etag,
								scenario: scenario ?? "default",
								scheme: shot.scheme,
								tiles: plan.tiles,
								...(scroll === undefined ? {} : { scroll }),
								shots: shot.shots,
								entries,
							});
							const { contentHeight } = shot;
							return {
								outcome: { kind: "booted", files, scale: plan.scale, entries, errors, contentHeight },
							};
						} catch (error) {
							return {
								outcome: { kind: "failed", message: error instanceof Error ? error.message : String(error) },
							};
						}
					};
					// the beat lives exactly as long as this answer, whichever way it ends
					const beat = setInterval(() => void write({ beat: true }).catch(() => {}), BOOT_BEAT_MS);
					out.onAbort(() => clearInterval(beat));
					try {
						await write(await boot());
					} finally {
						clearInterval(beat);
					}
				});
			},
		)
		.route("/api/p", handRoutes({ resolve: resolveProject, lastReaders: lastReadersIn }))
		.route(
			"/api/p",
			explorerRoutes({
				resolve: resolveProject,
				trash: trashImpl,
				moved: (root, moved) =>
					teamSync.moved(root, {
						...(moved.frames === undefined ? {} : { frames: [...moved.frames] }),
						...(moved.pages === undefined ? {} : { pages: [...moved.pages] }),
					}),
			}),
		)
		.get("/p/:project/frames/:frame", async (c) =>
			withProject(c, resolveProject, async (root) => {
				const frame = c.req.param("frame");
				const doc = await compiler.getDocument(root, frame, frameAuthority(root));
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
			}),
		)
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
							scenario: playScenario,
							frames,
							controlToken,
							innerUrl: `${renderOrigin}${requestUrl.pathname}${requestUrl.search}`,
						}),
					);
				}
				// marked before composing, so a canvas closing meanwhile never lets it cool
				playedRoots.add(project.root);
				const compiled = await playerCompiler.getPlayable(project.root, projection.frames, start);
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
				// a partial player is one moment of a compile still running: the next
				// request gets the whole one, so nothing may keep this
				if (shellRender || compiled.cache === "partial") {
					c.header("cache-control", "no-store");
				} else {
					c.header("etag", etag);
				}
				c.header("x-spool-cache", compiled.cache);
				return c.html(assemblePlayerDocument(config, compiled.bundle));
			},
		)
		.get("/play/:project/-/*", (c) =>
			withProject(c, resolveProject, async (root) => {
				// The composition's modules (#24): named by content, so a name is the
				// module and may be cached for good. They answer only for a project this
				// daemon has already composed — the document that imports them is what
				// composes it — and a name from a bundle since retired still answers for
				// as long as a tab served with it might walk to it. A partial player's
				// stylesheets (SPOOL-165) answer once their frame's is built.
				const name = c.req.path.slice(c.req.path.indexOf("/-/") + 3);
				const chunk = await playerCompiler.getChunk(root, name);
				if (chunk === undefined) return c.text("not found", 404);
				c.header("access-control-allow-origin", "*");
				c.header("cache-control", "public, max-age=31536000, immutable");
				c.header(
					"content-type",
					name.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8",
				);
				return c.body(chunk);
			}),
		)
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
				// the name this canvas tells the booth what it shows under
				const view = randomUUID();
				views.set(view, { root: project.root, scheme: undefined });
				keepPlayerWarm(project.root);
				stream.onAbort(() => {
					views.delete(view);
					sittings.view(view, undefined);
					letPlayerCool(project.root);
				});
				const team = followedLink(project.root) !== undefined;
				await stream.writeSSE({
					event: "hello",
					data: JSON.stringify({ project: name, view, ...(team ? { team } : {}) }),
					id: String(id++),
				});
				const unsubscribe = hub.subscribe(project.root, (event) => {
					void stream.writeSSE({ event: "change", data: JSON.stringify(event), id: String(id++) }).catch(() => {});
				});
				stream.onAbort(unsubscribe);
				if (team) stream.onAbort(watchPresence(stream, project.root, () => id++));
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
	// Outside the typed chain, which is as deep as the compiler follows; Home reads these by their exported types.
	app.route(
		"/api/cloud",
		cloudTeamRoutes({
			spoolDir,
			cloud,
			// a team paid for again, as an admin who just paid from this Mac sees it: its copies here follow it now
			onTeams: (teams) => {
				for (const team of teams) if (team.billing?.state !== "lapsed") teamSync.recheck(team.address);
			},
		}),
	);
	app.route(
		"/api/cloud",
		teamProjectRoutes({
			spoolDir,
			cloud,
			location: () =>
				String(settings.read().entries.find((entry) => entry.key === "projects.location")?.value ?? "~/spool"),
			notice: teamNotice,
			signal: moving.signal,
			hooks: {
				hold: (root) => teamSync.hold(root),
				relocate: (from, to, folder) => {
					const result = mutateMachineState(spoolDir, { kind: "relocate-project", root: from, to, folder });
					hub.forget(from);
					liveTurns.relocate(from, result.root);
					selections.relocate(from, result.root);
					machineStateWatch.acknowledgeRegistry(result.registry);
					machineStateWatch.acknowledgeSession(result.session);
					emitAppEvent({ kind: "project-renamed", from, root: result.root, name: result.name });
				},
				endMovedOut: (root, link) => teamSync.movedOut(root, link),
				trash: trashImpl,
			},
			changed: () => emitAppEvent({ kind: "registry" }),
		}),
	);
	app.route("/api/p", projectShares.routes);
	/** What a project's canvas says of its sync for as long as it lasts: an ending, a pause, what didn't travel. */
	app.get("/api/p/:project/sync", (c) =>
		withProject(c, resolveProject, (root) => {
			return c.json(teamSync.state(root));
		}),
	);
	/** What an agent's next command on a project says of its sync: what didn't travel and a pause, each said once. */
	app.post("/api/p/:project/sync/untold", (c) =>
		withProject(c, resolveProject, (root) => c.json({ lines: teamSync.untold(root) })),
	);
	app.route(
		"/api/p",
		commentRoutes({
			resolve: resolveProject,
			comments: (root) => teamSync.comments(root),
			comment: (root, comment, still) => teamSync.comment(root, comment, still),
			reply: (root, reply) => teamSync.reply(root, reply),
			change: (root, change) => teamSync.changeComment(root, change),
			people: teamPeople(spoolDir, cloud),
			// the frame as it is now: its own source's revision, and the cover this Mac has of it, the comment's still
			frameNow: async (root, frame) => {
				const cover = readCover(root, frame);
				const image = cover === undefined ? undefined : readCoverImage(root, frame, cover.hash);
				return { revision: await frameRevisionOnDisk(root, frame), still: image?.bytes };
			},
			// the element an agent names, found in the frame booted at its own size, as a pick would see it
			findElement: async (root, project, frame, target) => {
				const doc = await compiler.getDocument(root, frame, frameAuthority(root));
				if (doc.kind === "missing") return { broken: doc.message };
				if (doc.kind === "error") return { broken: `${frame} doesn't compile: ${doc.message}` };
				const { w, h } = readFrameGeometry(root, frame);
				const shot = await booth.shoot({
					project,
					frame,
					width: Math.round(w),
					height: Math.round(h),
					scale: 1,
					tiles: [],
					find: target,
				});
				if (shot.kind === "unserved") return { broken: `${frame} failed to serve` };
				return shot.found ?? null;
			},
			still: async (root, comment) => {
				const link = followedLink(root);
				return link === undefined
					? undefined
					: commentStill(spoolDir, link, comment, { ...cloud, origin: originOf(cloud) });
			},
		}),
	);
	app.route(
		"/api/p",
		setAsideRoutes({
			spoolDir,
			request: cloud,
			resolve: resolveProject,
			framesUsing: (root, path) => framesUsingIn(root).framesUsing(path),
			changed: (root) => hub.publish(root, { kind: "set-aside" }),
		}),
	);
	/*
	 * Presence on a team canvas: where this machine's person is, from the canvas, as it changes. It goes to the
	 * team through the local copy's sync connection and nowhere else: never to disk, never into history.
	 */
	app.put("/api/p/:project/presence", async (c) =>
		withProject(c, resolveProject, async (root) => {
			const state = readPresenceState(((await c.req.json().catch(() => undefined)) as { state?: unknown })?.state);
			if (state === undefined) return c.text("presence must be { state: { page, pointer, ... } | null }", 400);
			teamSync.presence(root, state);
			return c.body(null, 204);
		}),
	);

	/**
	 * Tell one canvas who else is on its team canvas: everyone there now, then each change. Its person leaves
	 * the team's canvas when the last canvas showing this local copy closes. Returns the unsubscribe.
	 */
	function watchPresence(stream: SSEStreamingApi, root: string, nextId: () => number): () => void {
		const tell = (presence: Presence) =>
			void stream
				.writeSSE({ event: "presence", data: JSON.stringify(presence), id: String(nextId()) })
				.catch(() => {});
		for (const presence of teamSync.copy(root)?.people() ?? []) tell(presence);
		const unwatch = teamSync.watchPresence(root, tell);
		return () => {
			unwatch();
			if (![...views.values()].some((view) => view.root === root)) teamSync.presence(root, null);
		};
	}

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
		scenario,
		frames,
		controlToken: shellToken,
		innerUrl,
	}: {
		project: string;
		start: string;
		scenario: string;
		frames: Record<string, { w: number; h: number }>;
		controlToken: string;
		innerUrl: string;
	}): string {
		const config = escapeJsonScript({
			project,
			start,
			scenario,
			frames,
			innerUrl,
			controlToken: shellToken,
		});
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
		/** Activate origin-dependent work (the photo booth) once really bound. */
		setSelfOrigin: (origin: string) => {
			controlOrigin = new URL(origin).origin;
			renderOrigin = renderOriginFor(controlOrigin);
			captureOrigin = captureOriginFor(controlOrigin);
			selfOrigin = renderOrigin;
			boothKeeping(registeredRoots());
			iconKeeping();
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
		close: async () => {
			for (const stop of playerWarmers.values()) stop();
			playerWarmers.clear();
			const compiled = playerCompiler.close();
			machineStateWatch.stop();
			history.close();
			teamSync.close();
			projectShares.close();
			movedIn.close();
			moving.abort();
			liveTurns.close();
			for (const stop of boothWatches.values()) stop();
			boothWatches.clear();
			iconWatch.close();
			thumbnailWatch.close();
			hub.close();
			updateChecker.stop();
			const closed = await Promise.allSettled([compiled, booth.close(), goReader.close()]);
			const errors: unknown[] = [];
			for (const result of closed) if (result.status === "rejected") errors.push(result.reason);
			if (errors.length > 0) throw new AggregateError(errors, "Daemon resources could not close");
		},
	};
}

export type AppType = ReturnType<typeof createDaemonApp>["app"];
