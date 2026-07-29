import { createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { fulfillClipboardCopy, rejectClipboardCopy } from "./clipboard-host";
import { parseClipboardCopyRequest } from "./clipboard-protocol";
import { type MockCall, Player, type PlayerController, type SessionState, type WalkEvent } from "./player-chrome";

interface FrameGeometry {
	w: number;
	h: number;
}

interface ShellConfig {
	project: string;
	start: string;
	frames: Record<string, FrameGeometry>;
	terminals: string[];
	innerUrl: string;
}

interface PlayerState {
	frame: string;
	stack: string[];
	motion: boolean;
	arrival: number;
	externalHref: string | null;
	log: WalkEvent[];
	mock: MockCall[];
	elapsed: number;
	state: SessionState;
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

type ControllerCommandName = "back" | "restart" | "rewind" | "toggle-motion" | "dismiss-external";

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
 * How long a self-reload counts as already attempted (#88). Serving the control
 * document mints a fresh handoff, so reloading is the repair for a spent one.
 * Rate-limiting it keeps a daemon that rejects every handoff from looping the
 * page, while still letting a tab restored much later repair itself.
 */
const HANDOFF_RELOAD_COOLDOWN_MS = 10_000;
const HANDOFF_RELOAD_KEY = "spool:player-handoff-reload";
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

declare global {
	interface Window {
		__SPOOL_SHELL__?: ShellConfig;
	}
}

/** Boot the trusted player shell. Frame code never enters this realm. */
export function bootPlayerShell(config: ShellConfig): void {
	const root = document.getElementById("root");
	if (root === null) throw new Error("spool: the player shell has no #root");
	let snapshot: PlayerState = {
		frame: config.start,
		stack: [],
		motion: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		arrival: 0,
		externalHref: null,
		log: [],
		mock: [],
		elapsed: 0,
		state: { scenario: "default", rows: [] },
	};
	let elapsedAt = performance.now();
	let version = 0;
	let ready = false;
	let hidden = true;
	let mountedFrame = config.start;
	let generation = 0;
	let stateSequence = 0;
	let geometryRevision = 0;
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
	let nextControllerRequest = 1;
	let activeControllerCommand: ActiveControllerCommand | undefined;
	const pendingControllerCommands: QueuedControllerCommand[] = [];
	const listeners = new Set<() => void>();
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
	/**
	 * Reload once per cooldown to earn a fresh handoff, reporting whether the
	 * reload was taken. Storage is per tab and survives the reload, which is what
	 * makes the cooldown outlive the document that set it.
	 */
	const reloadForHandoff = (): boolean => {
		let last = 0;
		try {
			last = Number(window.sessionStorage.getItem(HANDOFF_RELOAD_KEY)) || 0;
		} catch {
			// A tab that denies storage still deserves one attempt per load.
		}
		const now = Date.now();
		if (last !== 0 && now - last < HANDOFF_RELOAD_COOLDOWN_MS) return false;
		try {
			window.sessionStorage.setItem(HANDOFF_RELOAD_KEY, String(now));
		} catch {
			// Losing the marker risks a slow reload loop, not a broken player.
		}
		window.location.reload();
		return true;
	};
	/** An inner document that handshakes proves its handoff was taken, so the cooldown has nothing left to suppress. */
	const clearHandoffReload = () => {
		try {
			window.sessionStorage.removeItem(HANDOFF_RELOAD_KEY);
		} catch {
			// Nothing to clear when storage is denied.
		}
	};
	/** The render-origin player with the shell params stripped: same prototype, no embedding left to interfere with. */
	const barePlayerUrl = (): string => {
		const url = new URL(config.innerUrl);
		url.searchParams.delete("shell");
		url.searchParams.delete("handoff");
		return url.href;
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
			loadEscape = barePlayerUrl();
			hidden = true;
			postToRuntime = undefined;
			runtimePort?.close();
			runtimePort = undefined;
			notify();
		}, grace);
	};
	const host = () => document.querySelector<HTMLIFrameElement>("#spool-player");
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

	const controller: PlayerController = {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		version: () => version,
		stateSubscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		stateVersion: () => version,
		read: () => ({ project: config.project, ...snapshot }),
		state: () => snapshot.state,
		elapsed: () => snapshot.elapsed + performance.now() - elapsedAt,
		geometry: (frame) => (hasFrame(config.frames, frame) ? config.frames[frame] : undefined) ?? { w: 390, h: 844 },
		terminal: (frame) => config.terminals.includes(frame),
		back: () => command("back"),
		restart: () => command("restart"),
		rewind: (index) => command("rewind", { index }),
		toggleMotion: () => command("toggle-motion"),
		dismissExternal: () => command("dismiss-external"),
		close: () => {
			window.close();
			window.setTimeout(() => {
				if (!window.closed) window.location.href = `/p/${encodeURIComponent(config.project)}`;
			}, 150);
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
			elapsedAt = performance.now();
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

	window.addEventListener("spool-player-geometry-pending", ((event: CustomEvent<{ revision: number }>) => {
		if (!Number.isInteger(event.detail?.revision) || event.detail.revision <= geometryRevision) return;
		geometryRevision = event.detail.revision;
		if (!revealed) {
			geometryReadyRevision = 0;
			reconcileVisibility();
		}
		notify();
	}) as EventListener);

	window.addEventListener("spool-player-geometry", ((
		event: CustomEvent<{ revision: number; frames: { name: string; w: number; h: number }[] }>,
	) => {
		if (
			!Number.isInteger(event.detail?.revision) ||
			event.detail.revision < geometryRevision ||
			event.detail.revision <= geometryAppliedRevision ||
			!Array.isArray(event.detail.frames)
		) {
			return;
		}
		geometryRevision = event.detail.revision;
		geometryAppliedRevision = event.detail.revision;
		if (!revealed) geometryReadyRevision = 0;
		latestGeometry = { revision: event.detail.revision, frames: event.detail.frames };
		if (
			pendingNavigation?.kind === "transition" &&
			transitionGeometryChanged(pendingNavigation, event.detail.frames)
		) {
			if (pendingNavigation.phase === "applying") {
				geometrySettleRevision = event.detail.revision;
				hidden = true;
				notify();
				return;
			}
			convertTransitionToCut(event.detail.frames);
			return;
		}
		applyGeometry(event.detail.frames);
		postToRuntime?.({ spool: "player-geometry", ...latestGeometry });
		notify();
	}) as EventListener);

	window.addEventListener("message", (event) => {
		if (event.source !== host()?.contentWindow || !isRecord(event.data)) return;
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
			clearHandoffReload();
			postToRuntime = (outbound) => postMessage(outbound);
			config.frames = frames;
			if (latestGeometry !== undefined) applyGeometry(latestGeometry.frames);
			addMessageListener("message", (incoming) => {
				if (isRecord(incoming.data)) handleRuntimeMessage(incoming.data);
			});
			startPort();
			if (latestGeometry !== undefined) {
				postToRuntime({ spool: "player-geometry", ...latestGeometry });
			}
			window.dispatchEvent(new Event("spool-player-geometry-request"));
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
			if (reloadForHandoff()) {
				disarmBootstrapDeadline();
				return;
			}
			loadError = message.error;
			hidden = true;
			notify();
			return;
		}
	});

	function handleRuntimeMessage(message: Record<string, unknown>): void {
		const clipboard = parseClipboardCopyRequest(message);
		if (clipboard !== undefined) {
			const reply = postToRuntime;
			if (reply !== undefined && config.terminals.includes(clipboard.frame)) {
				rejectClipboardCopy(
					clipboard,
					reply,
					new DOMException("Clipboard writes require an HTML frame", "NotSupportedError"),
				);
				return;
			}
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
				elapsedAt = performance.now();
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
			if (message.revision === geometrySettleRevision) geometrySettleRevision = 0;
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
			elapsedAt = performance.now();
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
			window.dispatchEvent(
				new CustomEvent("spool-player-walked", { detail: { from: message.from, to: message.to } }),
			);
			return;
		}

		if (message.spool === "player-wake" && hasOnly(message, ["spool"])) {
			document.querySelector(".spool-stage")?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
		}
	}

	function Host() {
		useSyncExternalStore(controller.subscribe, controller.version);
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
			<iframe
				id="spool-player"
				title={config.project}
				sandbox="allow-scripts"
				src={config.innerUrl}
				onLoad={() => armBootstrapDeadline(BOOTSTRAP_CONNECT_DEADLINE_MS, BOOTSTRAP_SILENT_MESSAGE)}
				// Hidden by opacity, never visibility: headed Chromium render-throttles
				// a visibility-hidden cross-origin iframe, which starves the runtime's
				// animation-frame gates and deadlocks the reveal it is hiding for
				// (#185). inert keeps what visibility used to guarantee — no clicks,
				// no focus — while the frame stays rendered underneath.
				inert={hidden}
				style={{ opacity: hidden ? 0 : 1 }}
			/>
		);
	}
	createRoot(root).render(createElement(Player, { frames: {}, controller, host: createElement(Host) }));
	armBootstrapDeadline(BOOTSTRAP_BOOT_DEADLINE_MS, BOOTSTRAP_SILENT_MESSAGE);
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
	if (
		!isRecord(value) ||
		!hasOnly(value, ["frame", "stack", "motion", "arrival", "externalHref", "log", "mock", "elapsed", "state"]) ||
		typeof value.frame !== "string" ||
		!hasFrame(frames, value.frame) ||
		!Array.isArray(value.stack) ||
		value.stack.length > 10_000 ||
		!value.stack.every((frame) => typeof frame === "string" && hasFrame(frames, frame)) ||
		typeof value.motion !== "boolean" ||
		typeof value.arrival !== "number" ||
		!Number.isInteger(value.arrival) ||
		value.arrival < 0 ||
		!isExternalHref(value.externalHref) ||
		!Array.isArray(value.log) ||
		value.log.length > 10_000 ||
		!value.log.every((event) => isWalkEvent(event, frames)) ||
		!Array.isArray(value.mock) ||
		value.mock.length > 10_000 ||
		!value.mock.every(isMockCall) ||
		typeof value.elapsed !== "number" ||
		!Number.isFinite(value.elapsed) ||
		value.elapsed < 0 ||
		!isSessionState(value.state)
	) {
		return false;
	}
	return true;
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

function isWalkEvent(value: unknown, frames: Record<string, FrameGeometry>): value is WalkEvent {
	if (!isRecord(value) || !hasOnly(value, ["kind", "from", "to", "at", "changed"], ["label"])) return false;
	return (
		(value.kind === "go" || value.kind === "back" || value.kind === "restart" || value.kind === "rewind") &&
		typeof value.from === "string" &&
		hasFrame(frames, value.from) &&
		typeof value.to === "string" &&
		hasFrame(frames, value.to) &&
		(value.label === undefined || (typeof value.label === "string" && value.label.length <= 24)) &&
		typeof value.at === "number" &&
		Number.isFinite(value.at) &&
		value.at >= 0 &&
		Array.isArray(value.changed) &&
		value.changed.length <= 10_000 &&
		value.changed.every((key) => typeof key === "string")
	);
}

function isMockCall(value: unknown): value is MockCall {
	if (!isRecord(value) || !hasOnly(value, ["method", "path", "status", "ms"])) return false;
	return (
		typeof value.method === "string" &&
		typeof value.path === "string" &&
		typeof value.status === "number" &&
		Number.isInteger(value.status) &&
		typeof value.ms === "number" &&
		Number.isFinite(value.ms) &&
		value.ms >= 0
	);
}

function isSessionState(value: unknown): value is SessionState {
	if (!isRecord(value) || !hasOnly(value, ["scenario", "rows"])) return false;
	return (
		typeof value.scenario === "string" &&
		Array.isArray(value.rows) &&
		value.rows.length <= 10_000 &&
		value.rows.every(
			(row) =>
				isRecord(row) &&
				hasOnly(row, ["key", "value", "changed"]) &&
				typeof row.key === "string" &&
				typeof row.value === "string" &&
				typeof row.changed === "boolean",
		)
	);
}
