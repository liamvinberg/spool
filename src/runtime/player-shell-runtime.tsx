import { deskWindow } from "./player-page";
import {
	mountPlayerShell,
	type NamedGeometry,
	type PlayerGeometrySource,
	type PlayerShellConfig,
	type PlayerShellHost,
	type PlayerShellRecording,
} from "./player-shell";
import type { ClipAspect } from "./record-protocol";

/**
 * The player shell's live host: the played tab the daemon serves (the door
 * `spool url` prints, the canvas opens, and a phone visits) and the Mac app's
 * play window. Everything that needs a daemon, a recording or the app's window
 * is here; the shell itself (player-shell) needs none of it.
 *
 * Geometry and walks go through the served document's own bridge, an inline
 * script beside this one that holds the daemon's geometry and its stream and
 * posts walks, spoken to through window events.
 */

export interface ShellConfig extends PlayerShellConfig {
	innerUrl: string;
	scenario: string;
	/** Trusted outer-shell capability. Never forwarded to the authored iframe. */
	controlToken: string;
	/**
	 * Record (spool#221) is on: the bar can record. `arm` opened this player
	 * with Record's panel up, and `start` opened it recording at a shape.
	 */
	record?: "ready" | "arm" | { start: ClipAspect };
}

declare global {
	interface Window {
		__SPOOL_SHELL__?: ShellConfig;
	}
}

/**
 * Boot the played tab. `config` is the served document's own: the shell plays
 * in it, so what it plays at can be read back off the window.
 */
export function bootPlayerShell(config: ShellConfig): void {
	const root = document.getElementById("root");
	if (root === null) throw new Error("spool: the player shell has no #root");
	mountPlayerShell(root, config, liveHost(config));
}

function liveHost(config: ShellConfig): PlayerShellHost {
	const desk = deskWindow();
	return {
		geometry: bridgeGeometry(),
		close: () => {
			window.close();
			window.setTimeout(() => {
				if (!window.closed) window.location.href = `/p/${encodeURIComponent(config.project)}`;
			}, 150);
		},
		walked: (from, to) => window.dispatchEvent(new CustomEvent("spool-player-walked", { detail: { from, to } })),
		repair: {
			attempt: reloadForHandoff,
			// An inner document that handshakes proves its handoff was taken, so the cooldown has nothing left to suppress.
			settled: () => {
				try {
					window.sessionStorage.removeItem(HANDOFF_RELOAD_KEY);
				} catch {
					// Nothing to clear when storage is denied.
				}
			},
		},
		barePlayer: barePlayerUrl(config.innerUrl),
		...(config.record === undefined ? {} : { record: recording(config, config.record) }),
		...(desk === null ? {} : { desk }),
	};
}

/** The daemon's geometry, as the served document's bridge announces it. */
function bridgeGeometry(): PlayerGeometrySource {
	return {
		follow(sink) {
			const onPending = ((event: CustomEvent<{ revision: number }>) => {
				if (Number.isInteger(event.detail?.revision)) sink.pending(event.detail.revision);
			}) as EventListener;
			const onApplied = ((event: CustomEvent<{ revision: number; frames: NamedGeometry[] }>) => {
				if (Number.isInteger(event.detail?.revision) && Array.isArray(event.detail?.frames)) {
					sink.applied(event.detail.revision, event.detail.frames);
				}
			}) as EventListener;
			window.addEventListener("spool-player-geometry-pending", onPending);
			window.addEventListener("spool-player-geometry", onApplied);
			return () => {
				window.removeEventListener("spool-player-geometry-pending", onPending);
				window.removeEventListener("spool-player-geometry", onApplied);
			};
		},
		refresh: () => window.dispatchEvent(new Event("spool-player-geometry-request")),
	};
}

/** Record against the daemon, which renders the clip from the hands the shell noted. */
function recording(config: ShellConfig, opening: NonNullable<ShellConfig["record"]>): PlayerShellRecording {
	return {
		opening,
		scenario: config.scenario,
		reopen: (frame, aspect) => {
			const url = new URL(window.location.href);
			url.searchParams.set("frame", frame);
			url.searchParams.set("scenario", config.scenario);
			url.searchParams.set("record", aspect);
			window.location.replace(url);
		},
		render: async (body, progress) => {
			const api = `/api/p/${encodeURIComponent(config.project)}/record`;
			const headers = { [CONTROL_HEADER_NAME]: config.controlToken };
			// one clip renders at a time, so how far the one rendering has got is this one's
			const polling = window.setInterval(() => {
				fetch(`${api}/progress`, { headers })
					.then((response) => (response.ok ? response.json() : undefined))
					.then((answer: unknown) => {
						const done = (answer as { done?: unknown } | null | undefined)?.done;
						if (typeof done === "number") progress(done);
					})
					.catch(() => {});
			}, RENDER_POLL_MS);
			try {
				const response = await fetch(api, {
					method: "POST",
					headers: { ...headers, "content-type": "application/json" },
					body: JSON.stringify(body),
				});
				if (!response.ok)
					throw new Error((await response.text()) || `the clip could not be made (${response.status})`);
				return await response.blob();
			} finally {
				window.clearInterval(polling);
			}
		},
		download: (clip, name) => {
			const href = URL.createObjectURL(clip);
			const link = document.createElement("a");
			link.href = href;
			link.download = name;
			link.click();
			window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
		},
	};
}

/** The render-origin player with the shell params stripped: same prototype, no embedding left to interfere with. */
function barePlayerUrl(innerUrl: string): string {
	const url = new URL(innerUrl);
	url.searchParams.delete("shell");
	url.searchParams.delete("handoff");
	return url.href;
}

/**
 * How long a self-reload counts as already attempted (#88). Serving the control
 * document mints a fresh handoff, so reloading is the repair for a spent one.
 * Rate-limiting it keeps a daemon that rejects every handoff from looping the
 * page, while still letting a tab restored much later repair itself.
 */
const HANDOFF_RELOAD_COOLDOWN_MS = 10_000;
const HANDOFF_RELOAD_KEY = "spool:player-handoff-reload";

/**
 * Reload once per cooldown to earn a fresh handoff, reporting whether the
 * reload was taken. Storage is per tab and survives the reload, which is what
 * makes the cooldown outlive the document that set it.
 */
function reloadForHandoff(): boolean {
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
}

/** How often a rendering clip's progress is asked for. */
const RENDER_POLL_MS = 300;

/** The daemon's capability header (daemon/security.ts), which this browser bundle cannot import. */
const CONTROL_HEADER_NAME = "x-spool-control";
