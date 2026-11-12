import { createElement, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { SPOOL_MARK_PATH } from "../brand";
import { fulfillClipboardCopy } from "./clipboard-host";
import { parseClipboardCopyRequest } from "./clipboard-protocol";
import { markPlayAfterPaint } from "./play-marks";
import { Player, type PlayerController } from "./player-chrome";
import { heldBox, playRoom } from "./player-fit";
import type { DeskWindow } from "./player-page";
import { createPlayerRecorder, type NotedHands, type PlayerRecorder } from "./player-recorder";
import type { Held } from "./player-size-model";
import { type ClipAspect, shapedBox } from "./record-protocol";

/**
 * The player shell: the trusted half of a played session. It holds the
 * played document in a sandboxed iframe it never reaches into, drives the
 * navigation choreography over a private port, and owns the chrome — so frame
 * code and Spool's own UI never share a document.
 *
 * It is the page around the frame (#227), so the URL, the title and the edge
 * bar live out here where frame code cannot reach them. The frame itself is
 * sized by this side too — at the size it plays at, which the chrome chooses —
 * because the iframe's box is the viewport the runtime inside it measures.
 *
 * This is the shell's core, and it assumes no daemon: everything it needs from
 * outside itself comes through its {@link PlayerShellHost}. The live host (the
 * daemon's played tab and the Mac app's play window) is player-shell-runtime.
 */

interface FrameGeometry {
	w: number;
	h: number;
}

/** A frame's authored box, as geometry crosses from a host. */
export interface NamedGeometry {
	name: string;
	w: number;
	h: number;
}

/**
 * What the shell boots from. `frames` is rewritten in place to the played
 * boxes as the shell plays (see `playedBox`), so a host that hands in an
 * object it can still see sees what the shell plays at.
 */
export interface PlayerShellConfig {
	/** What the bar and the iframe name the composition. */
	project: string;
	/** The screen it opens on. */
	start: string;
	/** The authored box of every screen, as known at boot. */
	frames: Record<string, FrameGeometry>;
	/** The played document, the runtime that mounts the frames and speaks the port, by its address… */
	innerUrl?: string;
	/** …or as its own text, played from the page that holds it (an exported file, spool#304). */
	innerDocument?: string;
}

interface PlayerState {
	frame: string;
	arrival: number;
	externalHref: string | null;
}

/**
 * Everything the shell has to reach out of itself to do, named by its host,
 * and the only way out it has. What a host does not offer, the bar does not
 * draw and the shell does not do.
 */
export interface PlayerShellHost {
	/** The frames' authored boxes, as they change. Nothing is revealed before the first answer. */
	geometry: PlayerGeometrySource;
	/**
	 * Leaving: the bar's close and the leave chord, from the bar or the frame.
	 * Absent, the player cannot be left from inside it.
	 */
	close?(): void;
	/** A walk the session really took, for the flow graph's verified marks. Absent, walks go unreported. */
	walked?(from: string, to: string): void;
	/** Spent handoffs (#88). Absent, a rejected handoff is the reader's to see. */
	repair?: PlayerShellRepair;
	/** The same prototype without the embedding, offered when the embedded one will not boot. */
	barePlayer?: string;
	/** Record (spool#221). Absent, the bar has no Record. */
	record?: PlayerShellRecording;
	/** The Mac app's play window, when the shell is its page: the bar is then its title bar. */
	desk?: DeskWindow;
	/**
	 * No bar and no edges to pull: the frame fills the window at the window's size, as an exported file plays on a
	 * touch screen (spool#304). Absent, the bar is worn.
	 */
	bare?: true;
	/** Links in the frame may open a tab of their own, outside the sandbox. Absent, the played document opens none. */
	popups?: true;
	/** Where a play rests when it opens, and the memory of the last pick. Absent, it opens As drawn and remembers nothing. */
	start?: PlayerShellStart;
}

/** As drawn or Window: where a play rests when it opens, as its host remembers it. */
export interface PlayerShellStart {
	read(): "drawn" | "window";
	/** As drawn or Window was picked. */
	write(at: "drawn" | "window"): void;
}

/**
 * Where geometry comes from. Revisions are the host's own and only grow: a
 * `pending` says what is on screen may be stale until the `applied` at or past
 * it lands.
 */
export interface PlayerGeometrySource {
	/** Tell `sink` every change from now on; returns how to stop. */
	follow(sink: PlayerGeometrySink): () => void;
	/** The shell wants geometry it may not have (its document has connected): answer through the sink. */
	refresh(): void;
}

export interface PlayerGeometrySink {
	/** Geometry is about to change, so what is on screen may be stale. */
	pending(revision: number): void;
	/** The authored boxes as of `revision`. */
	applied(revision: number, frames: NamedGeometry[]): void;
}

export interface PlayerShellRepair {
	/** Earn a fresh handoff after a spent one, reporting whether the repair was taken. */
	attempt(): boolean;
	/** The played document handshook, so its handoff was taken and nothing is left to repair. */
	settled(): void;
}

export interface PlayerShellRecording {
	/** Ready to record, opened with Record's panel up, or opened recording at a shape. */
	opening: "ready" | "arm" | { start: ClipAspect };
	/** The scenario a clip is recorded in. */
	scenario: string;
	/** Open the player again at `frame`, recording at `aspect` from its arrival. */
	reopen(frame: string, aspect: ClipAspect): void;
	/** Render a recording into a clip, told how far it has got. */
	render(body: object, progress: (done: number) => void): Promise<Blob>;
	download(clip: Blob, name: string): void;
}

/** What a host renders from, read fresh on every change the shell notifies. */
export interface PlayerShellView {
	/** The player is not ready to be seen — booting, cutting, or resettling. */
	hidden: boolean;
	/**
	 * A cut after the first reveal: the screen walked from stays on show, inert,
	 * until the next has painted. The runtime mounts the next in the frame the
	 * viewport reaches its size, before paint, so nothing in between is drawn:
	 * hidden, the screen's white backing would show through instead.
	 */
	holding: boolean;
	/** The player has been seen once: what hides it from here on is a walk, never the boot. */
	revealed: boolean;
	loadError: string | undefined;
	/** The bare render-origin player, offered when the embedded one will not boot. */
	loadEscape: string | undefined;
}

export interface PlayerShell {
	controller: PlayerController;
	/** Record, while the experiment is on. */
	recorder?: PlayerRecorder;
	/** Whether the frame is played at a clip's shape rather than the window's. */
	shaped(): boolean;
	view(): PlayerShellView;
	/** The iframe finished its document fetch; the connect leg starts here. */
	loaded(): void;
	destroy(): void;
}

interface Cut {
	generation: number;
	from: string;
	to: string;
	w: number;
	h: number;
	phase: "resizing" | "mounting";
}

interface PendingNavigation {
	generation: number;
	from: string;
	to: string;
	sourceW: number;
	sourceH: number;
	w: number;
	h: number;
	kind: "transition" | "cut";
	phase?: "proposed" | "committing" | "applying" | undefined;
	state?: { sequence: number; value: PlayerState } | undefined;
}

type ControllerCommandName = "walk" | "dismiss-external";

interface QueuedControllerCommand {
	request: number;
	command: ControllerCommandName;
	extra: Record<string, unknown>;
}

interface ActiveControllerCommand extends QueuedControllerCommand {
	generation: number;
	frame: string;
}

const MAX_PENDING_CONTROLLER_COMMANDS = 32;
/**
 * How long a booting player may stay mute before the shell stops hiding it
 * (#185): a runtime that never finishes its bootstrap used to leave the screen
 * white forever, indistinguishable from loading. The connect deadline starts
 * at the iframe's load event, so a slow link spends its time in the document
 * fetch where it belongs — once loaded, connecting is module evaluation plus
 * one postMessage. The ready deadline starts at player-connect and covers the
 * leg to the reveal, so a runtime that connects and then wedges is caught too.
 * The boot deadline is the backstop for a document that never manages to load.
 */
const BOOTSTRAP_CONNECT_DEADLINE_MS = 4_000;
const BOOTSTRAP_READY_DEADLINE_MS = 6_000;
const BOOTSTRAP_BOOT_DEADLINE_MS = 45_000;
const BOOTSTRAP_SILENT_MESSAGE =
	"the player loaded but never connected to its shell. something running inside the player iframe is interfering with its boot; a browser extension injected into the sandbox is the usual culprit. the bare player runs the same prototype without the embedding.";
const BOOTSTRAP_UNREVEALED_MESSAGE =
	"the player connected but never reported its first stable layout, so the shell stopped waiting. something is starving the embedded frame, either code injected into its sandbox or the browser throttling it. the bare player runs the same prototype without the embedding.";

/** The id of the iframe the shell plays its document in. */
const PLAYED_FRAME_ID = "spool-player";

/** The shell's machinery, with everything it has to reach out of itself handed in. */
export function createPlayerShell(
	config: PlayerShellConfig,
	host: PlayerShellHost,
	/** The iframe holding the played document. */
	played: () => HTMLIFrameElement | null,
): PlayerShell {
	let snapshot: PlayerState = { frame: config.start, arrival: 0, externalHref: null };
	let version = 0;
	let ready = false;
	let hidden = true;
	let mountedFrame = config.start;
	let generation = 0;
	let stateSequence = 0;
	/**
	 * The shell's own geometry revisions, one for every change that crosses the
	 * port: the bridge's and the shell's own replays alike. The bridge numbers
	 * its revisions for itself, so they are kept apart (`bridgePending`,
	 * `bridgeApplied`): a replay on every step of a pull never makes the
	 * canvas's next change look stale.
	 */
	let geometryRevision = 0;
	let bridgePending = 0;
	let bridgeApplied = 0;
	let geometryAppliedRevision = 0;
	let geometryReadyRevision = 0;
	let geometrySettleRevision = 0;
	let revealed = false;
	let cut: Cut | undefined;
	let pendingNavigation: PendingNavigation | undefined;
	let loadError: string | undefined;
	let loadEscape: string | undefined;
	let bootstrapDeadline: number | undefined;
	let runtimePort: MessagePort | undefined;
	let postToRuntime: ((message: Record<string, unknown>) => void) | undefined;
	let latestGeometry: { revision: number; frames: { name: string; w: number; h: number }[] } | undefined;
	/** The clip shape the frame is played at while Record's panel is up or it records (spool#221). */
	const record = host.record;
	let shapedAs: ClipAspect | null = typeof record?.opening === "object" ? record.opening.start : null;
	/**
	 * What this play rests at (spool#264): As drawn or Window, as the host
	 * remembers it, until another size is chosen. A row's own size is read from
	 * the row, so a pick carries none.
	 */
	let held: Held = { id: host.bare === true ? "window" : (host.start?.read() ?? "drawn"), size: { w: 0, h: 0 } };
	/** The box the frame on show is laid out at while the chrome moves it, or null resting at `held`. */
	let laying: FrameGeometry | null = null;
	/**
	 * Geometry as the canvas authored it. `config.frames` holds the played box
	 * instead — see `playedBox` below — and a window that changes size re-derives one
	 * from the other, so the authored numbers have to survive somewhere.
	 */
	let authoredGeometry: { name: string; w: number; h: number }[] = retainedGeometry(config.frames);
	let nextControllerRequest = 1;
	let activeControllerCommand: ActiveControllerCommand | undefined;
	const pendingControllerCommands: QueuedControllerCommand[] = [];
	const listeners = new Set<() => void>();
	const teardown: (() => void)[] = [];
	const notify = () => {
		version++;
		for (const listener of listeners) listener();
	};
	const reconcileVisibility = () => {
		if (revealed) {
			hidden = cut !== undefined || geometrySettleRevision !== 0;
			return;
		}
		hidden = !(
			ready &&
			cut === undefined &&
			geometryRevision > 0 &&
			geometryAppliedRevision === geometryRevision &&
			geometryReadyRevision === geometryRevision
		);
		if (!hidden) {
			revealed = true;
			disarmBootstrapDeadline();
		}
	};
	const disarmBootstrapDeadline = () => {
		if (bootstrapDeadline !== undefined) window.clearTimeout(bootstrapDeadline);
		bootstrapDeadline = undefined;
	};
	const armBootstrapDeadline = (grace: number, message: string) => {
		if (revealed || loadError !== undefined) return;
		disarmBootstrapDeadline();
		bootstrapDeadline = window.setTimeout(() => {
			bootstrapDeadline = undefined;
			if (revealed || loadError !== undefined) return;
			loadError = message;
			loadEscape = host.barePlayer;
			hidden = true;
			postToRuntime = undefined;
			runtimePort?.close();
			runtimePort = undefined;
			notify();
		}, grace);
	};
	const recorder =
		record === undefined
			? undefined
			: createPlayerRecorder(
					record.scenario,
					{
						note: (on) => postToRuntime?.({ spool: "player-record", on }),
						shape: (aspect) => {
							shapedAs = aspect;
							geometryReplay();
						},
						reopen: (aspect) => record.reopen(snapshot.frame, aspect),
						frame: () => snapshot.frame,
						render: (body, progress) => record.render(body, progress),
						download: (clip, name) => record.download(clip, name),
						now: () => performance.now(),
						later: (run, ms) => {
							const timer = window.setTimeout(run, ms);
							return () => window.clearTimeout(timer);
						},
					},
					shapedAs ?? "16:9",
				);
	let recordStarted = false;
	const postCommand = (command: string, extra: Record<string, unknown> = {}) =>
		postToRuntime?.({ spool: "player-command", command, ...extra, generation, frame: snapshot.frame });
	const allocateControllerRequest = () => {
		for (;;) {
			const request = nextControllerRequest;
			nextControllerRequest = request === Number.MAX_SAFE_INTEGER ? 1 : request + 1;
			if (
				activeControllerCommand?.request !== request &&
				!pendingControllerCommands.some((pending) => pending.request === request)
			) {
				return request;
			}
		}
	};
	const drainControllerCommands = () => {
		if (
			loadError !== undefined ||
			activeControllerCommand !== undefined ||
			pendingNavigation !== undefined ||
			cut !== undefined ||
			postToRuntime === undefined
		) {
			return;
		}
		const pending = pendingControllerCommands.shift();
		if (pending === undefined) return;
		activeControllerCommand = {
			...pending,
			generation,
			frame: snapshot.frame,
		};
		postToRuntime({
			spool: "player-command",
			command: pending.command,
			request: pending.request,
			...pending.extra,
			generation,
			frame: snapshot.frame,
		});
	};
	const command = (command: ControllerCommandName, extra: Record<string, unknown> = {}) => {
		if (loadError !== undefined) return;
		if (pendingControllerCommands.length >= MAX_PENDING_CONTROLLER_COMMANDS) {
			pendingControllerCommands.shift();
		}
		pendingControllerCommands.push({
			request: allocateControllerRequest(),
			command,
			extra: { ...extra },
		});
		drainControllerCommands();
	};

	/**
	 * The box the page really gives a frame: at the size it plays at
	 * (spool#264), the authored box as drawn (a long page its width over the
	 * window's height, spool#263), the room under the 30px bar both shells wear
	 * at Window, a device's or a pulled size, drawn smaller by the chrome where
	 * the window is; and the frame on show at whatever the chrome lays it out at
	 * while it moves. This is what the iframe is laid out at and what the
	 * runtime inside it will measure, since a scale does not change a viewport —
	 * which is why every w/h that crosses the port is in this space and not the
	 * authored one, and why being 30px out here wedges the reveal shut.
	 */
	const playedBox = (name: string, geometry: FrameGeometry): FrameGeometry => {
		const room = playRoom({ vw: window.innerWidth, vh: window.innerHeight }, host.bare !== true);
		// a frame played at a clip's shape lays itself out in that shape (spool#221)
		if (shapedAs !== null) return shapedBox(shapedAs, room, geometry);
		// with no bar there is no size to choose: the frame is the window
		if (host.bare === true) return room;
		if (laying !== null && name === snapshot.frame) return laying;
		return heldBox(held, geometry, room);
	};
	const playedList = (frames: { name: string; w: number; h: number }[]) =>
		frames.map((frame) => (isGeometry(frame) ? { name: frame.name, ...playedBox(frame.name, frame) } : frame));
	const playedRecord = (frames: Record<string, FrameGeometry>): Record<string, FrameGeometry> =>
		Object.fromEntries(Object.entries(frames).map(([name, geometry]) => [name, playedBox(name, geometry)]));
	config.frames = playedRecord(config.frames);

	const controller: PlayerController = {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		version: () => version,
		read: () => ({ ...snapshot }),
		geometry: (frame) => (hasFrame(config.frames, frame) ? config.frames[frame] : undefined) ?? { w: 1440, h: 900 },
		frames: () => Object.keys(config.frames),
		walk: (frame, back = false) => {
			if (hasFrame(config.frames, frame) && frame !== snapshot.frame) command("walk", { to: frame, back });
		},
		dismissExternal: () => command("dismiss-external"),
		...(host.close === undefined ? {} : { close: () => host.close?.() }),
		size: {
			held: () => held,
			authored: (frame) => {
				const found = authoredGeometry.find((each) => each.name === frame);
				return found === undefined ? { w: 1440, h: 900 } : { w: found.w, h: found.h };
			},
			hold: (next) => {
				held = next;
				if (next.id === "drawn" || next.id === "window") host.start?.write(next.id);
				geometryReplay();
			},
			lay: (box) => {
				if (box === laying || (box !== null && laying !== null && box.w === laying.w && box.h === laying.h)) return;
				laying = box;
				geometryReplay();
			},
		},
	};

	const applyGeometry = (frames: { name: string; w: number; h: number }[]) => {
		for (const frame of frames) {
			if (isGeometry(frame) && hasFrame(config.frames, frame.name)) {
				config.frames[frame.name] = { w: frame.w, h: frame.h };
				if (cut?.to === frame.name && (cut.w !== frame.w || cut.h !== frame.h)) {
					cut = { ...cut, w: frame.w, h: frame.h, phase: "resizing" };
					if (pendingNavigation?.kind === "cut") {
						pendingNavigation = { ...pendingNavigation, w: frame.w, h: frame.h };
					}
				}
			}
		}
	};
	const transitionGeometryChanged = (
		navigation: PendingNavigation,
		frames: { name: string; w: number; h: number }[],
	) => {
		const from = frames.find((frame) => frame.name === navigation.from);
		const to = frames.find((frame) => frame.name === navigation.to);
		return (
			(from !== undefined && (from.w !== navigation.sourceW || from.h !== navigation.sourceH)) ||
			(to !== undefined && (to.w !== navigation.w || to.h !== navigation.h))
		);
	};
	const convertTransitionToCut = (frames: { name: string; w: number; h: number }[]) => {
		const navigation = pendingNavigation;
		if (navigation?.kind !== "transition") return;
		applyGeometry(frames);
		const to = hasFrame(config.frames, navigation.to) ? config.frames[navigation.to] : undefined;
		if (to === undefined) return;
		if (navigation.state !== undefined) {
			stateSequence = navigation.state.sequence;
			snapshot = navigation.state.value;
		}
		pendingNavigation = { ...navigation, kind: "cut", w: to.w, h: to.h, state: undefined };
		cut = {
			generation: navigation.generation,
			from: navigation.from,
			to: navigation.to,
			w: to.w,
			h: to.h,
			phase: "resizing",
		};
		hidden = true;
		if (latestGeometry !== undefined) {
			postToRuntime?.({ spool: "player-geometry", ...latestGeometry });
		}
		postToRuntime?.({
			spool: "player-command",
			command: "prepare",
			generation: navigation.generation,
			frame: navigation.to,
			from: navigation.from,
			to: navigation.to,
			w: to.w,
			h: to.h,
		});
		notify();
	};

	const geometryPending = (revision: number) => {
		if (!Number.isInteger(revision) || revision <= bridgePending) return;
		bridgePending = revision;
		geometryRevision += 1;
		if (!revealed) {
			geometryReadyRevision = 0;
			reconcileVisibility();
		}
		notify();
	};

	const geometryApplied = (revision: number, authored: { name: string; w: number; h: number }[]) => {
		if (
			!Number.isInteger(revision) ||
			revision < bridgePending ||
			revision <= bridgeApplied ||
			!Array.isArray(authored)
		) {
			return;
		}
		bridgeApplied = revision;
		bridgePending = revision;
		authoredGeometry = authored;
		publishGeometry();
	};

	/**
	 * Hand the runtime the played boxes of the authored numbers last applied, at
	 * a revision of the shell's own. The played box is taken once, here at the
	 * door: everything downstream — what is stored, what is compared against a
	 * cut, what crosses the port — is in played space, and only this ever looks
	 * at the authored numbers.
	 */
	const publishGeometry = () => {
		const revision = geometryRevision + 1;
		const frames = playedList(authoredGeometry);
		geometryAppliedRevision = revision;
		// geometry the bridge still has on its way is newer than this, so nothing is ready until it lands
		geometryRevision = bridgePending > bridgeApplied ? revision + 1 : revision;
		if (!revealed) geometryReadyRevision = 0;
		latestGeometry = { revision, frames };
		if (pendingNavigation?.kind === "transition" && transitionGeometryChanged(pendingNavigation, frames)) {
			if (pendingNavigation.phase === "applying") {
				geometrySettleRevision = revision;
				hidden = true;
				notify();
				return;
			}
			convertTransitionToCut(frames);
			return;
		}
		applyGeometry(frames);
		postToRuntime?.({ spool: "player-geometry", ...latestGeometry });
		notify();
	};

	/**
	 * Hand the runtime the geometry the shell already holds, played again: a
	 * window that has changed size, or a size chosen or moving, re-derives the
	 * played box from the authored numbers.
	 */
	const geometryReplay = publishGeometry;

	const onWindowMessage = (event: MessageEvent) => {
		if (event.source !== played()?.contentWindow || !isRecord(event.data)) return;
		const message = event.data;

		if (message.spool === "player-connect") {
			const frames = geometryRecord(message.frames);
			if (
				runtimePort !== undefined ||
				!hasOnly(message, ["spool", "frames"]) ||
				frames === undefined ||
				!hasFrame(frames, config.start) ||
				event.ports.length !== 1
			) {
				return;
			}
			const port = event.ports[0];
			if (port === undefined) return;
			const postMessage = port.postMessage.bind(port);
			const addMessageListener = port.addEventListener.bind(port);
			const startPort = port.start.bind(port);
			runtimePort = port;
			// Connected is not revealed: a runtime can hand its port over and then
			// wedge before player-ready (#185), so the deadline moves to the next leg
			// instead of standing down.
			armBootstrapDeadline(BOOTSTRAP_READY_DEADLINE_MS, BOOTSTRAP_UNREVEALED_MESSAGE);
			host.repair?.settled();
			postToRuntime = (outbound) => postMessage(outbound);
			authoredGeometry = retainedGeometry(frames);
			config.frames = playedRecord(frames);
			if (latestGeometry !== undefined) applyGeometry(latestGeometry.frames);
			addMessageListener("message", (incoming) => {
				if (isRecord(incoming.data)) handleRuntimeMessage(incoming.data);
			});
			startPort();
			if (latestGeometry !== undefined) {
				postToRuntime({ spool: "player-geometry", ...latestGeometry });
			}
			host.geometry.refresh();
			drainControllerCommands();
			notify();
			return;
		}

		if (message.spool === "player-load-error") {
			if (
				runtimePort !== undefined ||
				ready ||
				loadError !== undefined ||
				!hasOnly(message, ["spool", "error"]) ||
				typeof message.error !== "string" ||
				message.error.length === 0 ||
				message.error.length > 100_000
			) {
				return;
			}
			loadError = message.error;
			hidden = true;
			notify();
			return;
		}

		if (message.spool === "player-handoff-rejected") {
			if (
				loadError !== undefined ||
				!hasOnly(message, ["spool", "error"]) ||
				typeof message.error !== "string" ||
				message.error.length === 0 ||
				message.error.length > 100_000
			) {
				return;
			}
			// The browser refetched the inner document on its own — a restored tab, an
			// iframe it discarded, a reloaded frame — and its handoff had expired or
			// been evicted. Serving this page again mints a new one, and a reload is
			// what the player already means by a restart (#88).
			if (host.repair?.attempt() === true) {
				disarmBootstrapDeadline();
				return;
			}
			loadError = message.error;
			hidden = true;
			notify();
			return;
		}
	};
	window.addEventListener("message", onWindowMessage);
	teardown.push(() => window.removeEventListener("message", onWindowMessage));

	function handleRuntimeMessage(message: Record<string, unknown>): void {
		const clipboard = parseClipboardCopyRequest(message);
		if (clipboard !== undefined) {
			const reply = postToRuntime;
			if (
				reply === undefined ||
				pendingNavigation !== undefined ||
				cut !== undefined ||
				clipboard.frame !== mountedFrame ||
				clipboard.frame !== snapshot.frame
			) {
				return;
			}
			fulfillClipboardCopy(clipboard, reply);
			return;
		}

		const bootstrapPending = !ready && !revealed;
		const navigationPending = pendingNavigation !== undefined || cut !== undefined || geometrySettleRevision !== 0;
		if (
			message.spool === "player-runtime-error" &&
			loadError === undefined &&
			(bootstrapPending || navigationPending) &&
			hasOnly(message, ["spool", "error"]) &&
			typeof message.error === "string" &&
			message.error.length > 0 &&
			message.error.length <= 100_000
		) {
			loadError = message.error;
			hidden = true;
			pendingNavigation = undefined;
			cut = undefined;
			geometrySettleRevision = 0;
			activeControllerCommand = undefined;
			pendingControllerCommands.length = 0;
			postToRuntime = undefined;
			runtimePort?.close();
			runtimePort = undefined;
			notify();
			return;
		}

		if (message.spool === "player-navigate") {
			if (
				pendingNavigation !== undefined ||
				cut !== undefined ||
				!hasOnly(message, ["spool", "generation", "from", "to", "w", "h"]) ||
				typeof message.generation !== "number" ||
				!Number.isInteger(message.generation) ||
				message.generation !== generation + 1 ||
				message.from !== mountedFrame ||
				message.from !== snapshot.frame ||
				typeof message.to !== "string" ||
				!isPositiveInteger(message.w) ||
				!isPositiveInteger(message.h) ||
				!hasFrame(config.frames, message.to)
			) {
				return;
			}
			const to = config.frames[message.to];
			const from = config.frames[mountedFrame];
			if (to === undefined || from === undefined) return;
			generation = message.generation;
			const transition = sameGeometry(from, to) && message.w === from.w && message.h === from.h;
			pendingNavigation = {
				generation,
				from: message.from,
				to: message.to,
				sourceW: from.w,
				sourceH: from.h,
				w: to.w,
				h: to.h,
				kind: transition ? "transition" : "cut",
				...(transition ? { phase: "proposed" as const } : {}),
			};
			if (transition) {
				postToRuntime?.({
					spool: "player-command",
					command: "transition",
					generation,
					frame: message.to,
					from: message.from,
					to: message.to,
					w: to.w,
					h: to.h,
				});
				return;
			}
			cut = {
				generation,
				from: message.from,
				to: message.to,
				w: to.w,
				h: to.h,
				phase: "resizing",
			};
			hidden = true;
			postToRuntime?.({
				spool: "player-command",
				command: "prepare",
				generation,
				frame: message.to,
				from: message.from,
				to: message.to,
				w: to.w,
				h: to.h,
			});
			notify();
			return;
		}

		if (message.spool === "player-transition-ready") {
			const pending = pendingNavigation;
			if (
				pending?.kind !== "transition" ||
				pending.phase !== "proposed" ||
				!isCutMessage(message) ||
				!matchesNavigation(message, pending)
			) {
				return;
			}
			pending.phase = "committing";
			postToRuntime?.({
				spool: "player-command",
				command: "transition-commit",
				generation: pending.generation,
				frame: pending.to,
				from: pending.from,
				to: pending.to,
				w: pending.w,
				h: pending.h,
			});
			return;
		}

		if (message.spool === "player-transition-commit-ready") {
			const pending = pendingNavigation;
			if (
				pending?.kind !== "transition" ||
				pending.phase !== "committing" ||
				!isCutMessage(message) ||
				!matchesNavigation(message, pending)
			) {
				return;
			}
			pending.phase = "applying";
			postToRuntime?.({
				spool: "player-command",
				command: "transition-apply",
				generation: pending.generation,
				frame: pending.to,
				from: pending.from,
				to: pending.to,
				w: pending.w,
				h: pending.h,
			});
			return;
		}

		if (
			message.spool === "player-transition-mismatch" &&
			pendingNavigation?.kind === "transition" &&
			hasOnly(message, ["spool", "generation", "from", "to", "w", "h"]) &&
			message.generation === pendingNavigation.generation &&
			message.from === pendingNavigation.from &&
			message.to === pendingNavigation.to &&
			isPositiveInteger(message.w) &&
			isPositiveInteger(message.h)
		) {
			convertTransitionToCut(latestGeometry?.frames ?? []);
			return;
		}

		if (message.spool === "player-transitioned") {
			const pending = pendingNavigation;
			if (pending?.kind !== "transition" || !isCutMessage(message) || !matchesNavigation(message, pending)) {
				return;
			}
			mountedFrame = pending.to;
			if (pending.state !== undefined) {
				stateSequence = pending.state.sequence;
				snapshot = pending.state.value;
			}
			pendingNavigation = undefined;
			ready = true;
			if (geometrySettleRevision !== 0 && latestGeometry !== undefined) {
				applyGeometry(latestGeometry.frames);
				postToRuntime?.({ spool: "player-geometry", ...latestGeometry });
			}
			reconcileVisibility();
			notify();
			drainControllerCommands();
			return;
		}

		if (message.spool === "player-ready") {
			if (
				ready ||
				!hasOnly(message, ["spool", "generation", "frame", "w", "h"]) ||
				message.generation !== generation ||
				message.frame !== mountedFrame ||
				!isPositiveInteger(message.w) ||
				!isPositiveInteger(message.h)
			) {
				return;
			}
			ready = true;
			reconcileVisibility();
			notify();
			if (record !== undefined && record.opening !== "ready" && !recordStarted) {
				recordStarted = true;
				if (record.opening === "arm") recorder?.record();
				else recorder?.start(record.opening.start);
			}
			return;
		}

		if (message.spool === "player-recorded") {
			const noted = notedHands(message);
			if (noted !== undefined) recorder?.heard(noted);
			return;
		}

		if (message.spool === "player-geometry-ready") {
			const geometryFrame = pendingNavigation?.to ?? snapshot.frame;
			if (
				!hasOnly(message, ["spool", "revision", "frame", "w", "h"]) ||
				geometryAppliedRevision !== geometryRevision ||
				message.revision !== geometryRevision ||
				message.frame !== geometryFrame ||
				!matchesGeometry(message, config.frames[geometryFrame])
			) {
				return;
			}
			geometryReadyRevision = geometryRevision;
			// Any report that reaches here discharges a settle, not only one naming
			// the revision that armed it: a report is accepted at the newest revision
			// or not at all, so geometry newer than the settle is geometry the settle
			// was waiting for. Pinning it to one number wedged the reveal shut the
			// moment a revision superseded it between `player-transitioned` and the
			// frame's report — reports for the armed revision are refused as stale,
			// reports for the new one did not match the number, and nothing rescues a
			// shell that has already revealed once, since the bootstrap deadline
			// (#185) only guards the first reveal. One sidecar write now produces two
			// geometry events, the API's and the watcher's (#113), so that window is
			// hit by an ordinary drag rather than by anything exotic.
			geometrySettleRevision = 0;
			reconcileVisibility();
			notify();
			return;
		}

		if (message.spool === "player-state") {
			if (
				!hasOnly(message, ["spool", "generation", "sequence", "state"]) ||
				typeof message.generation !== "number" ||
				!Number.isInteger(message.generation) ||
				typeof message.sequence !== "number" ||
				!Number.isInteger(message.sequence) ||
				message.sequence <= stateSequence ||
				!isPlayerState(message.state, config.frames)
			) {
				return;
			}
			const next = message.state;
			const pending = pendingNavigation;
			if (pending?.kind === "transition") {
				if (
					message.generation !== pending.generation ||
					next.frame !== pending.to ||
					message.sequence <= (pending.state?.sequence ?? stateSequence)
				) {
					return;
				}
				pending.state = { sequence: message.sequence, value: next };
				return;
			}
			if (pending?.kind === "cut") {
				if (message.generation !== pending.generation || next.frame !== pending.to) return;
			} else if (message.generation !== generation || next.frame !== mountedFrame) {
				return;
			}
			stateSequence = message.sequence;
			snapshot = next;
			notify();
			return;
		}

		if (message.spool === "player-viewport") {
			const pending = pendingNavigation;
			if (
				pending?.kind !== "cut" ||
				cut?.phase !== "resizing" ||
				!isCutMessage(message) ||
				!matchesCut(message, cut) ||
				!matchesNavigation(message, pending) ||
				snapshot.frame !== cut.to
			) {
				return;
			}
			cut = { ...cut, phase: "mounting" };
			postCommand("mount", {
				from: cut.from,
				to: cut.to,
				w: cut.w,
				h: cut.h,
			});
			return;
		}

		if (message.spool === "player-mounted") {
			const pending = pendingNavigation;
			if (
				pending?.kind !== "cut" ||
				cut === undefined ||
				!isCutMessage(message) ||
				!matchesCut(message, cut) ||
				!matchesNavigation(message, pending) ||
				snapshot.frame !== cut.to
			) {
				return;
			}
			const mounted = cut;
			mountedFrame = mounted.to;
			cut = undefined;
			pendingNavigation = undefined;
			ready = true;
			reconcileVisibility();
			postCommand("settle", {
				from: mounted.from,
				to: mounted.to,
				w: mounted.w,
				h: mounted.h,
			});
			notify();
			drainControllerCommands();
			return;
		}

		if (message.spool === "player-command-complete") {
			const active = activeControllerCommand;
			if (
				active === undefined ||
				!hasOnly(message, ["spool", "request", "command", "generation", "frame", "outcome"]) ||
				message.request !== active.request ||
				message.command !== active.command ||
				message.generation !== active.generation ||
				message.frame !== active.frame ||
				(message.outcome !== "completed" && message.outcome !== "failed")
			) {
				return;
			}
			activeControllerCommand = undefined;
			drainControllerCommands();
			return;
		}

		if (
			message.spool === "player-walked" &&
			hasOnly(message, ["spool", "from", "to"]) &&
			typeof message.from === "string" &&
			typeof message.to === "string" &&
			hasFrame(config.frames, message.from) &&
			hasFrame(config.frames, message.to)
		) {
			host.walked?.(message.from, message.to);
			return;
		}

		// The one chord the inner runtime keeps for Spool (#227). Everything else
		// in there belongs to the prototype and is never forwarded.
		if (message.spool === "player-key" && hasOnly(message, ["spool", "key"]) && message.key === "leave") {
			host.close?.();
		}
	}

	// The played box is measured against the window, so a window that changes
	// size is a geometry change: the same replay the host asks for, re-derived
	// from the authored numbers.
	const onResize = () => geometryReplay();
	window.addEventListener("resize", onResize);
	teardown.push(() => window.removeEventListener("resize", onResize));
	teardown.push(host.geometry.follow({ pending: geometryPending, applied: geometryApplied }));

	armBootstrapDeadline(BOOTSTRAP_BOOT_DEADLINE_MS, BOOTSTRAP_SILENT_MESSAGE);

	return {
		controller,
		...(recorder === undefined ? {} : { recorder }),
		shaped: () => shapedAs !== null,
		view: () => ({
			hidden,
			holding: revealed && cut !== undefined && geometrySettleRevision === 0,
			revealed,
			loadError,
			loadEscape,
		}),
		loaded: () => armBootstrapDeadline(BOOTSTRAP_CONNECT_DEADLINE_MS, BOOTSTRAP_SILENT_MESSAGE),
		destroy: () => {
			disarmBootstrapDeadline();
			for (const undo of teardown.splice(0)) undo();
			listeners.clear();
			postToRuntime = undefined;
			runtimePort?.close();
			runtimePort = undefined;
		},
	};
}

function retainedGeometry(frames: Record<string, FrameGeometry>): { name: string; w: number; h: number }[] {
	return Object.entries(frames).map(([name, geometry]) => ({ name, w: geometry.w, h: geometry.h }));
}

/**
 * How long a play waits before the mark says it is loading. Under a second a
 * wait reads as the app being quick, and a loader that flashes for a moment
 * reads as slow, so a warm play (a quarter second) and one right after an edit
 * (under one) never show it. A cold compile, seconds long, does.
 */
const ARRIVAL_MARK_MS = 800;

/** The stagger between the mark's bands as they wind, top to bottom. */
const ARRIVAL_BAND_MS = 110;

/** The mark's bands, top first, each its own path so each winds on its own. */
const MARK_BANDS = SPOOL_MARK_PATH.split(/ (?=M )/);

/**
 * What stands over the screen until the player is first seen: the page's own
 * dark, so a played frame never opens on a white box, and the mark winding
 * its thread when the wait is long enough to need saying (a cold compile).
 * A warm play is over before the mark would show, so it is only a dissolve
 * from the dark into the frame. It stays mounted and fades, which is the
 * dissolve; it never takes a pointer, so nothing under it waits on it.
 */
function Arrival({ arrived }: { arrived: boolean }) {
	return (
		<div className={arrived ? "spool-arrival is-arrived" : "spool-arrival"} aria-hidden="true">
			<svg
				className="spool-arrival-mark"
				viewBox="250 182 524 660"
				aria-hidden="true"
				style={{ animationDelay: `${ARRIVAL_MARK_MS}ms` }}
			>
				{MARK_BANDS.map((band, index) => (
					<path key={band} d={band} style={{ animationDelay: `${ARRIVAL_MARK_MS + index * ARRIVAL_BAND_MS}ms` }} />
				))}
			</svg>
		</div>
	);
}

/**
 * Mount the shell on `root`: the bar, the played document in its iframe, and
 * the dark it arrives out of. Frame code never enters this realm; whatever the
 * shell needs from outside comes through `host`.
 */
export function mountPlayerShell(root: HTMLElement, config: PlayerShellConfig, host: PlayerShellHost): PlayerShell {
	const shell = createPlayerShell(config, host, () =>
		document.querySelector<HTMLIFrameElement>(`#${PLAYED_FRAME_ID}`),
	);

	function Host() {
		useSyncExternalStore(shell.controller.subscribe, shell.controller.version);
		const { hidden, holding, revealed, loadError, loadEscape } = shell.view();
		useEffect(() => {
			if (revealed) markPlayAfterPaint("frame-revealed", host.desk?.mark);
		}, [revealed]);
		if (loadError !== undefined) {
			return (
				<div className="spool-player-error" role="alert">
					<strong>player failed to load</strong>
					<pre>{loadError}</pre>
					{loadEscape !== undefined && (
						<a className="spool-player-escape" href={loadEscape}>
							open the bare player
						</a>
					)}
				</div>
			);
		}
		return (
			<>
				<iframe
					id={PLAYED_FRAME_ID}
					title={config.project}
					allow="clipboard-write"
					sandbox={
						host.popups === true ? "allow-scripts allow-popups allow-popups-to-escape-sandbox" : "allow-scripts"
					}
					{...(config.innerDocument === undefined ? { src: config.innerUrl } : { srcDoc: config.innerDocument })}
					onLoad={shell.loaded}
					// Hidden by opacity, never visibility: headed Chromium render-throttles
					// a visibility-hidden cross-origin iframe, which starves the runtime's
					// animation-frame gates and deadlocks the reveal it is hiding for
					// (#185). inert keeps what visibility used to guarantee — no clicks,
					// no focus — while the frame stays rendered underneath.
					inert={hidden}
					style={{ opacity: hidden && !holding ? 0 : 1 }}
				/>
				<Arrival arrived={revealed} />
			</>
		);
	}
	function Page() {
		useEffect(() => markPlayAfterPaint("shell-painted", host.desk?.mark), []);
		return createElement(Player, {
			project: config.project,
			frames: {},
			controller: shell.controller,
			host: createElement(Host),
			...(shell.recorder === undefined ? {} : { recorder: shell.recorder, shaped: shell.shaped }),
			...(host.desk === undefined ? {} : { desk: host.desk }),
			...(host.bare === true ? { bar: false } : {}),
		});
	}
	createRoot(root).render(createElement(Page));
	return shell;
}

/** The inner document's recording, checked for shape; the daemon checks every input again. */
function notedHands(message: Record<string, unknown>): NotedHands | undefined {
	const { inputs, duration, w, h } = message;
	if (!Array.isArray(inputs) || typeof duration !== "number" || !isPositiveInteger(w) || !isPositiveInteger(h)) {
		return undefined;
	}
	return { inputs, duration, w, h };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
	const keys = Object.keys(value);
	return (
		required.every((key) => keys.includes(key)) &&
		keys.every((key) => required.includes(key) || optional.includes(key))
	);
}

function hasFrame(frames: Record<string, FrameGeometry>, name: string): boolean {
	return Object.hasOwn(frames, name);
}

function isGeometry(value: unknown): value is { name: string; w: number; h: number } {
	if (!isRecord(value) || !hasOnly(value, ["name", "w", "h"])) return false;
	return (
		typeof value.name === "string" &&
		typeof value.w === "number" &&
		Number.isInteger(value.w) &&
		value.w > 0 &&
		typeof value.h === "number" &&
		Number.isInteger(value.h) &&
		value.h > 0
	);
}

function geometryRecord(value: unknown): Record<string, FrameGeometry> | undefined {
	if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) return undefined;
	const frames = Object.create(null) as Record<string, FrameGeometry>;
	for (const frame of value) {
		if (!isGeometry(frame) || Object.hasOwn(frames, frame.name)) return undefined;
		frames[frame.name] = { w: frame.w, h: frame.h };
	}
	return frames;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function matchesGeometry(
	value: Record<string, unknown>,
	geometry: FrameGeometry | undefined,
): value is Record<string, unknown> & { w: number; h: number } {
	return geometry !== undefined && value.w === geometry.w && value.h === geometry.h;
}

function sameGeometry(a: FrameGeometry | undefined, b: FrameGeometry | undefined): boolean {
	return a !== undefined && b !== undefined && a.w === b.w && a.h === b.h;
}

function isCutMessage(value: Record<string, unknown>): value is Record<string, unknown> & Omit<Cut, "phase"> {
	return (
		hasOnly(value, ["spool", "generation", "from", "to", "w", "h"]) &&
		typeof value.generation === "number" &&
		Number.isInteger(value.generation) &&
		value.generation >= 0 &&
		typeof value.from === "string" &&
		typeof value.to === "string" &&
		typeof value.w === "number" &&
		Number.isInteger(value.w) &&
		value.w > 0 &&
		typeof value.h === "number" &&
		Number.isInteger(value.h) &&
		value.h > 0
	);
}

function matchesCut(value: Omit<Cut, "phase">, cut: Cut): boolean {
	return (
		value.generation === cut.generation &&
		value.from === cut.from &&
		value.to === cut.to &&
		value.w === cut.w &&
		value.h === cut.h
	);
}

function matchesNavigation(value: Omit<Cut, "phase">, navigation: PendingNavigation): boolean {
	return (
		value.generation === navigation.generation &&
		value.from === navigation.from &&
		value.to === navigation.to &&
		value.w === navigation.w &&
		value.h === navigation.h
	);
}

function isPlayerState(value: unknown, frames: Record<string, FrameGeometry>): value is PlayerState {
	return (
		isRecord(value) &&
		hasOnly(value, ["frame", "arrival", "externalHref"]) &&
		typeof value.frame === "string" &&
		hasFrame(frames, value.frame) &&
		typeof value.arrival === "number" &&
		Number.isInteger(value.arrival) &&
		value.arrival >= 0 &&
		isExternalHref(value.externalHref)
	);
}

function isExternalHref(value: unknown): value is string | null {
	if (value === null) return true;
	if (typeof value !== "string" || value.length > 8192) return false;
	try {
		const url = new URL(value);
		return (
			(url.protocol === "http:" || url.protocol === "https:") &&
			url.username === "" &&
			url.password === "" &&
			url.href === value
		);
	} catch {
		return false;
	}
}
