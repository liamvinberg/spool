import { useEffect, useRef, useState } from "react";
import type { EdgeWait } from "./edge-wait-turn";
import type { PlayEntry } from "./turn-play";

/**
 * What the wire is doing right now, as the six things it can actually tell apart.
 *
 * Round three drew ten indicators and every one of them had a single boolean behind it:
 * something is out, or nothing is. That was never all spool knows. The transcript is
 * projected from a real session and the projection already separates six cases, so the
 * question "maybe different for when thinking, waiting, working?" has a data answer
 * before it has a design one:
 *
 *   idle      nothing out, nothing open. 56% of a turn and nearly all of a rail's open life.
 *   sent      the request has gone up and not one token has come back. This is the beat
 *             `agent-transcript.ts:1123` draws today with no name on it, and it is the state
 *             the measured 878/1970/4043ms of `ttft_ms` is a distribution *of*.
 *   thinking  a thinking block is open. It carries a clock and a token estimate and **no
 *             text** — 346 blocks across six captures, every one `"thinking": ""`
 *             (claude-code#20127) — so there is nothing to read and the block runs to 18s.
 *   saying    words are arriving. The one state where the reader has something to do.
 *   tooling   a call is open and nothing is being written.
 *   parked    stopped, and only a person can move it.
 *
 * **The ranking is a design claim and not a fallback order.** `saying` outranks `tooling`
 * because the two overlap constantly — the first message in this turn streams while three
 * calls are open — and of the two, words arriving is the state the reader is in. `parked`
 * outranks everything for #161's reason: it is the only one of the six that is a call to
 * act, so nothing may hide it.
 *
 * **What this does not do is insist all six be drawn.** A take is free to collapse five of
 * them into one and say so, which is round three's own finding carried forward: what was
 * rejected was the *word* `waiting`, spool's internal bookkeeping leaking into the rail. Six
 * states with six drawings is six vocabularies to learn. Each take declares its own set and
 * the dwell meter says what that set costs, because a distinction that is live for 300ms in a
 * 13s turn is not a distinction anybody reads.
 */

export type Work = "idle" | "sent" | "thinking" | "saying" | "tooling" | "parked";

/** the order they are printed in, which is the order they happen in */
export const WORK_ORDER: readonly Work[] = ["idle", "sent", "thinking", "saying", "tooling", "parked"];

export interface Wire {
	readonly state: Work;
	/**
	 * How much the wire has out: the request itself, plus every call still open. `--churn`
	 * used this for rate; here it is available to any take that wants amplitude instead.
	 */
	readonly load: number;
	/** a request is out and nothing has come back for it */
	readonly out: boolean;
	/** anything at all is happening, which is the one boolean round three had */
	readonly on: boolean;
}

export function wireNow(entries: readonly PlayEntry[], waits: readonly EdgeWait[], parked: boolean): Wire {
	const out = waits.some((wait) => wait.live);
	const open = entries.filter((entry) => entry.kind === "line" && entry.state === "running");
	const thinking = open.some((entry) => entry.kind === "line" && entry.quiet === true);
	const tooling = open.some((entry) => entry.kind === "line" && entry.quiet !== true);
	const saying = entries.some(
		(entry) => entry.kind === "prose" && entry.shown.length > 0 && entry.shown.length < entry.full.length,
	);
	const load = (out ? 1 : 0) + open.length;
	const on = load > 0 || saying || parked;
	const state: Work = parked
		? "parked"
		: out
			? "sent"
			: thinking
				? "thinking"
				: saying
					? "saying"
					: tooling
						? "tooling"
						: "idle";
	return { state, load, out, on };
}

export type Dwell = Readonly<Record<Work, number>>;

const NO_DWELL: Dwell = { idle: 0, sent: 0, thinking: 0, saying: 0, tooling: 0, parked: 0 };

/**
 * How long the turn actually spent in each of the six, measured rather than reasoned.
 *
 * This is the number that decides whether a take is allowed to draw six things. A state
 * that is live for a tenth of a second twice a turn cannot carry its own picture, however
 * good the picture is — the reader never sees it settle. So every frame on this row prints
 * its own dwell beside its own claim, and a take proposing a drawing for a 300ms state has
 * to survive its own meter.
 *
 * It accumulates in a ref and flushes to state five times a second, on `edge-shift.ts`'s
 * rule: a meter that re-rendered at its own sampling rate would be measuring the load it
 * was adding.
 */
export function useDwell(state: Work, run: number): Dwell {
	const [shown, setShown] = useState<Dwell>(NO_DWELL);
	const tally = useRef<Record<Work, number>>({ ...NO_DWELL });
	const since = useRef({ at: 0, state });

	useEffect(() => {
		tally.current = { ...NO_DWELL };
		since.current = { at: performance.now(), state };
		setShown(NO_DWELL);
		// biome-ignore lint/correctness/useExhaustiveDependencies: the run is the reset, not the state
	}, [run]);

	useEffect(() => {
		const now = performance.now();
		const was = since.current;
		tally.current[was.state] += now - was.at;
		since.current = { at: now, state };
	}, [state]);

	useEffect(() => {
		const flush = window.setInterval(() => {
			const now = performance.now();
			const live = { ...tally.current };
			live[since.current.state] += now - since.current.at;
			setShown(live);
		}, 200);
		return () => window.clearInterval(flush);
	}, []);

	return shown;
}

/** a dwell as the panel prints it: tenths, and the states that never happened left out */
export function dwellLine(dwell: Dwell): string {
	const parts = WORK_ORDER.filter((work) => dwell[work] > 120).map(
		(work) => `${work} ${(dwell[work] / 1000).toFixed(1)}s`,
	);
	return parts.length === 0 ? "nothing yet" : parts.join(" · ");
}
