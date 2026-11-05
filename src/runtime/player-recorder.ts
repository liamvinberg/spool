import { type ClipAspect, RECORD_LIMIT_MS, type RecordedInput } from "./record-protocol";

/**
 * The player's Record (spool#221), as the bar sees it. A recording always
 * starts from a fresh session at the screen on show, because the daemon plays
 * it back into a fresh copy: so Record reopens the player recording rather
 * than starting mid-session, and a player opened recording starts as soon as
 * its frame is in. Stopping asks which shape the clip takes, and the clip is
 * rendered and downloaded once one is picked.
 */
export type RecorderView =
	| { kind: "idle" }
	| { kind: "recording"; since: number }
	| { kind: "stopping" }
	| { kind: "choosing" }
	| { kind: "rendering" }
	| { kind: "saved" }
	| { kind: "failed"; message: string };

/** What the inner document noted between start and stop. */
export interface NotedHands {
	inputs: RecordedInput[];
	duration: number;
	w: number;
	h: number;
}

export interface RecorderHost {
	/** Tell the inner document to start or stop noting the hands. */
	note(on: boolean): void;
	/** Open the player again at the screen on show, recording. */
	reopen(): void;
	/** The screen on show, which a recording starts at. */
	frame(): string;
	/** Render a recording; the clip, or why not. */
	render(body: object): Promise<Blob>;
	download(clip: Blob, name: string): void;
	now(): number;
	later(run: () => void, ms: number): () => void;
}

export interface PlayerRecorder {
	subscribe(listener: () => void): () => void;
	version(): number;
	view(): RecorderView;
	/** The bar's Record: reopen recording. */
	record(): void;
	/** Start noting, in a player opened recording, once its frame is in. */
	start(): void;
	stop(): void;
	/** The inner document's recording: the answer to a stop, or Escape pressed in the frame. */
	heard(noted: NotedHands): void;
	save(aspect: ClipAspect): void;
	discard(): void;
}

/** How long "saved" stays on the bar. */
const SAVED_MS = 1600;

export function createPlayerRecorder(scenario: string, host: RecorderHost): PlayerRecorder {
	let view: RecorderView = { kind: "idle" };
	let version = 0;
	let frame = "";
	let noted: NotedHands | undefined;
	let cancelLimit: (() => void) | undefined;
	let cancelSaved: (() => void) | undefined;
	const listeners = new Set<() => void>();
	const set = (next: RecorderView) => {
		view = next;
		version++;
		for (const listener of listeners) listener();
	};
	const recorder: PlayerRecorder = {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		version: () => version,
		view: () => view,
		record() {
			if (view.kind === "idle" || view.kind === "saved") host.reopen();
		},
		start() {
			if (view.kind !== "idle") return;
			frame = host.frame();
			host.note(true);
			cancelLimit = host.later(() => recorder.stop(), RECORD_LIMIT_MS);
			set({ kind: "recording", since: host.now() });
		},
		stop() {
			if (view.kind !== "recording") return;
			cancelLimit?.();
			host.note(false);
			set({ kind: "stopping" });
		},
		heard(hands) {
			// stopping is the bar's stop answered; recording is Escape, pressed in the frame
			if (view.kind !== "stopping" && view.kind !== "recording") return;
			cancelLimit?.();
			noted = hands;
			set({ kind: "choosing" });
		},
		save(aspect) {
			if ((view.kind !== "choosing" && view.kind !== "failed") || noted === undefined) return;
			const { inputs, duration, w, h } = noted;
			set({ kind: "rendering" });
			host
				.render({ frame, scenario, viewport: { w, h }, duration, aspect, inputs })
				.then((clip) => {
					host.download(clip, `${frame.split("/").at(-1) ?? "clip"}.mp4`);
					noted = undefined;
					set({ kind: "saved" });
					cancelSaved = host.later(() => {
						if (view.kind === "saved") set({ kind: "idle" });
					}, SAVED_MS);
				})
				.catch((error: unknown) => {
					// the recording is kept, so the clip can be asked for again
					set({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
				});
		},
		discard() {
			cancelSaved?.();
			noted = undefined;
			set({ kind: "idle" });
		},
	};
	return recorder;
}
