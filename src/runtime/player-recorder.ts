import { type ClipAspect, RECORD_LIMIT_MS, type RecordedInput } from "./record-protocol";

/**
 * The player's Record (spool#221), as the bar sees it. The clip's shape is
 * picked first: Record opens a panel with the shape, and the frame is played
 * at that shape at once, so what the person sees is what the clip holds.
 * Start begins the recording from a fresh session at the screen on show,
 * because the daemon plays it back into a fresh copy: so it reopens the
 * player recording at that shape rather than starting mid-session, and a
 * player opened recording starts as soon as its frame is in. Stopping renders
 * the clip straight away, with its progress, and downloads it.
 */
export type RecorderView =
	| { kind: "idle" }
	| { kind: "arming"; aspect: ClipAspect }
	| { kind: "recording"; since: number; aspect: ClipAspect }
	| { kind: "stopping" }
	| { kind: "rendering"; progress: number }
	| { kind: "saved"; name: string }
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
	/** Play the frame at a clip's shape, or back at the window's with none. */
	shape(aspect: ClipAspect | null): void;
	/** Open the player again at the screen on show, recording at `aspect`. */
	reopen(aspect: ClipAspect): void;
	/** The screen on show, which a recording starts at. */
	frame(): string;
	/** Render a recording, told how far it has got; the clip, or why not. */
	render(body: object, progress: (done: number) => void): Promise<Blob>;
	download(clip: Blob, name: string): void;
	now(): number;
	later(run: () => void, ms: number): () => void;
}

export interface PlayerRecorder {
	subscribe(listener: () => void): () => void;
	version(): number;
	view(): RecorderView;
	/** The bar's Record: open the panel, at the shape picked last. */
	record(): void;
	/** The panel's shape. */
	pick(aspect: ClipAspect): void;
	/** The panel's Start: reopen recording. */
	begin(): void;
	/** Start noting at `aspect`, in a player opened recording, once its frame is in. */
	start(aspect: ClipAspect): void;
	stop(): void;
	/** The inner document's recording: the answer to a stop, or Escape pressed in the frame. */
	heard(noted: NotedHands): void;
	/** Render a failed recording again. */
	retry(): void;
	/** Close the panel, drop a failed recording, or put away saved. */
	dismiss(): void;
}

/** How long saved stays up. */
const SAVED_MS = 5000;

export function createPlayerRecorder(
	scenario: string,
	host: RecorderHost,
	firstAspect: ClipAspect = "16:9",
): PlayerRecorder {
	let view: RecorderView = { kind: "idle" };
	let version = 0;
	let frame = "";
	let aspect: ClipAspect = firstAspect;
	let noted: NotedHands | undefined;
	let cancelLimit: (() => void) | undefined;
	let cancelSaved: (() => void) | undefined;
	const listeners = new Set<() => void>();
	const set = (next: RecorderView) => {
		view = next;
		version++;
		for (const listener of listeners) listener();
	};
	const render = () => {
		if (noted === undefined) return;
		const { inputs, duration, w, h } = noted;
		set({ kind: "rendering", progress: 0 });
		host
			.render({ frame, scenario, viewport: { w, h }, duration, aspect, inputs }, (done) => {
				if (view.kind === "rendering" && done > view.progress)
					set({ kind: "rendering", progress: Math.min(1, done) });
			})
			.then((clip) => {
				const name = `${frame.split("/").at(-1) ?? "clip"}.mp4`;
				host.download(clip, name);
				noted = undefined;
				set({ kind: "saved", name });
				cancelSaved = host.later(() => {
					if (view.kind === "saved") set({ kind: "idle" });
				}, SAVED_MS);
			})
			.catch((error: unknown) => {
				// the recording is kept, so the clip can be asked for again
				set({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
			});
	};
	const recorder: PlayerRecorder = {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		version: () => version,
		view: () => view,
		record() {
			if (view.kind !== "idle" && view.kind !== "saved") return;
			cancelSaved?.();
			host.shape(aspect);
			set({ kind: "arming", aspect });
		},
		pick(next) {
			if (view.kind !== "arming") return;
			aspect = next;
			host.shape(next);
			set({ kind: "arming", aspect: next });
		},
		begin() {
			if (view.kind === "arming") host.reopen(aspect);
		},
		start(given) {
			if (view.kind !== "idle") return;
			aspect = given;
			frame = host.frame();
			host.note(true);
			cancelLimit = host.later(() => recorder.stop(), RECORD_LIMIT_MS);
			set({ kind: "recording", since: host.now(), aspect });
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
			// the frame goes back to the window's size while its clip renders
			host.shape(null);
			render();
		},
		retry() {
			if (view.kind === "failed") render();
		},
		dismiss() {
			if (view.kind === "arming") host.shape(null);
			if (view.kind !== "arming" && view.kind !== "failed" && view.kind !== "saved") return;
			cancelSaved?.();
			noted = undefined;
			set({ kind: "idle" });
		},
	};
	return recorder;
}
