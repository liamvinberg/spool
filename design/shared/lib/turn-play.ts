import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

/**
 * The turn player behind the playable agent frames.
 *
 * A frame is not a still here: the human types in the composer, presses Enter,
 * and a real captured turn plays out in front of them. So the whole engine is
 * two small hooks and one rule — nothing on screen is a hard-coded end state,
 * every row is derived from how far the clock has got.
 *
 * `useTurn` is the clock. A script is a list of named cues measured in ms from
 * the send; `at(name)` answers whether that moment has passed. Both the rail and
 * the canvas read the same cues, which is why a row resolving in the rail and a
 * frame landing on the canvas can be the same instant rather than two guesses.
 *
 * The cues themselves are no longer authored. They are projected from a captured
 * Claude Code session (see claude-turn.ts), so the ordering and the intervals are
 * the ones that really happened.
 *
 * Reduced motion is not a downgrade path, it is a jump cut: every cue fires at
 * once and the turn is already settled, so someone who asked for stillness gets
 * the end state and no movement at all.
 */

export type TurnPhase = "idle" | "playing" | "settled";

/** a named moment in the turn, measured in ms from the send */
export interface Cue {
	readonly name: string;
	readonly at: number;
}

export interface Turn {
	/** idle until the first send, playing while it runs, settled once it lands */
	phase: TurnPhase;
	/** what the human typed, carried into their turn verbatim */
	prompt: string;
	/** has this cue fired yet */
	at: (name: string) => boolean;
	/** climbs per run, so children can reset with a key */
	run: number;
	send: (text: string) => void;
	replay: () => void;
}

export function useTurn(cues: readonly Cue[]): Turn {
	const still = useReducedMotion() === true;
	const [state, setState] = useState<{ run: number; phase: TurnPhase; prompt: string }>({
		run: 0,
		phase: "idle",
		prompt: "",
	});
	const [fired, setFired] = useState<readonly string[]>([]);

	const send = useCallback((text: string) => {
		setFired([]);
		setState((prev) => ({ run: prev.run + 1, phase: "playing", prompt: text }));
	}, []);

	const replay = useCallback(() => {
		setFired([]);
		setState((prev) => ({ run: prev.run + 1, phase: "playing", prompt: prev.prompt }));
	}, []);

	const { run, phase, prompt } = state;

	useEffect(() => {
		if (run === 0) return;
		if (still) {
			setFired(cues.map((cue) => cue.name));
			setState((prev) => ({ ...prev, phase: "settled" }));
			return;
		}
		const last = cues.reduce((longest, cue) => Math.max(longest, cue.at), 0);
		const timers = cues.map((cue) =>
			window.setTimeout(() => {
				setFired((prev) => (prev.includes(cue.name) ? prev : [...prev, cue.name]));
			}, cue.at),
		);
		timers.push(window.setTimeout(() => setState((prev) => ({ ...prev, phase: "settled" })), last + 60));
		return () => {
			for (const timer of timers) window.clearTimeout(timer);
		};
	}, [run, still, cues]);

	const at = useCallback((name: string) => fired.includes(name), [fired]);
	return { phase, prompt, at, run, send, replay };
}

/**
 * One ticker for the whole turn rather than a clock per row, because how many
 * rows a turn has is not known until the capture has been read and hooks cannot
 * come and go. It returns ms since the send; under reduced motion it returns
 * infinity, which reads out as every duration already final.
 */
export function useTicker(run: number, total: number): number {
	const still = useReducedMotion() === true;
	const [ms, setMs] = useState(0);
	useEffect(() => {
		setMs(0);
		if (run === 0 || still) return;
		const started = Date.now();
		const timer = window.setInterval(() => {
			const elapsed = Date.now() - started;
			setMs(elapsed);
			if (elapsed > total) window.clearInterval(timer);
		}, 100);
		return () => window.clearInterval(timer);
	}, [run, still, total]);
	return still ? Number.POSITIVE_INFINITY : ms;
}

/**
 * A duration as the capture measured it, not as the replay played it. Tenths
 * while a thought is short enough to read as tenths, whole seconds once it is
 * not, minutes once a wait has become the kind you go and do something else
 * during — which, in this capture, it does.
 */
export function duration(ms: number): string {
	if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
	const whole = Math.round(ms / 1000);
	if (whole < 60) return `${whole}s`;
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/* ---------- what a transcript is made of ----------
 * The rail renders these and nothing else: the human's words, the agent's words,
 * and a one-line row per tool call. The vocabulary lives here rather than in the
 * rail because it is the turn's shape, and both the projection and the rail have
 * to agree on it. */

export type RowState = "pending" | "running" | "done";

export interface RowChild {
	/** stable across the child's own state changes — its name is not, so keying on
	 * the name would remount a task the moment it starts running and arrive it twice */
	readonly id: string;
	readonly name: string;
	readonly state: RowState;
}

/** the agent read a picture back; the payload is elided in the capture, so the row holds its place */
export interface ShotRef {
	readonly path: string;
	readonly media: string;
}

export type PlayEntry =
	| { readonly key: string; readonly kind: "user"; readonly text: string; readonly context?: string | undefined }
	| {
			readonly key: string;
			readonly kind: "line";
			readonly state: RowState;
			readonly verb: string;
			/** arrives a beat after the verb: content_block_start names a tool with an empty input */
			readonly subject?: string | undefined;
			/** the one line behind the disclosure */
			readonly detail?: string | undefined;
			/** a plan's tasks or a delegation's steps, which are the disclosure in their own right */
			readonly children?: readonly RowChild[] | undefined;
			/** a picture the agent looked at, standing in for a payload the capture elides */
			readonly shot?: ShotRef | undefined;
			/** opened by the turn rather than by a click; a click still wins after that */
			readonly open?: boolean | undefined;
			/** thinking sits a shade under the work */
			readonly quiet?: boolean | undefined;
	  }
	| { readonly key: string; readonly kind: "prose"; readonly full: string; readonly shown: string };
