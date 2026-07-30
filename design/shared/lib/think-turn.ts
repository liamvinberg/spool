import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The turn in the screenshot, and the same run carrying on past it.
 *
 * Every word in the first seven steps is the developer's own, copied off the rail
 * as it drew them: a message, one selection chip, one sentence back, and then
 * `read` · `run` · `run` · `thinking 0.0s` · `read` · `read` · `thinking 18s`,
 * with the last one live. That is the complaint drawn exactly — seven consecutive
 * machine rows between the agent's sentence and the live edge, and no end in
 * sight.
 *
 * Steps eight to twelve are not in the screenshot. They are here because the
 * complaint is about growth and a still run cannot show growth: the frame opens on
 * the screenshot and the run keeps going in front of you, so a cap has something to
 * do and a fold has something to fold. They are the same five verbs the first seven
 * use and nothing new is introduced by them.
 *
 * **What a thought is allowed to know.** `agent-events.ts:98` is explicit: a
 * thinking delta carries an empty string and an estimated token count, and
 * `agent-claude.ts:466` says the settled block carries an empty string and a
 * signature. There is no prose on the wire at any point, so a beat can hold a clock
 * and a count and nothing else. It is worse than that in the code that ships: the
 * transcript's `Beat` is `{ key, state, verb, since, until }` and the token count is
 * dropped where it arrives, so today a thinking beat knows only a clock. Every token
 * figure in this file is therefore a field that exists on the wire and is currently
 * thrown away, which is a one-line change and is stated rather than assumed.
 *
 * The counts themselves are shaped off `claude-turn.ts`'s own measured rate: it
 * falls back to `0.03` estimated tokens per millisecond when a capture holds no
 * finished thought to divide, which is thirty a second. 18s at thirty a second is
 * 540, and that is where the live thought starts.
 */

/** what the developer typed, verbatim, including its own spelling */
export const SAID =
	"so when the like shot patches or disappears its like patching effect i really like but the last like frame it doesnt smoothly dissappear the last part just instantly goes can you smoothen that out so its like better";

/** the one thing the hands were pointing at when they said it */
export const CHIP = "site-punch-sheet--door-twice";

/** the agent's whole reply so far, which is one sentence and then six minutes of work */
export const LEDE = "I'll look at the frame and the shot-patching code first.";

/**
 * The sentence every one of these frames has to carry, because it is the fact that
 * decides the question and it is invisible in the interface.
 */
export const WIRE_NOTE =
	"A thinking block never carries its words. The wire sends an empty string and a token estimate while it runs, and an empty string and a signature when it settles, so a beat can only know a clock and a count.";

/** estimated tokens a second, which is `claude-turn.ts`'s own fallback rate */
export const TOKEN_RATE = 0.03;

export interface ThinkStep {
	readonly key: string;
	readonly kind: "tool" | "think";
	/** spool's own verb, lowercase, the way every row in this rail prints one */
	readonly verb: string;
	/** what the verb acted on. A thought has none, because a thought has no subject. */
	readonly subject?: string;
	/** how many calls one row collapsed (#135) */
	readonly count?: number;
	/** when it arrives on the frame's clock, in ms */
	readonly at: number;
	/** how long it stays live before the next thing lands, in ms */
	readonly runs: number;
	/** what is already on a thought's clock when the frame boots */
	readonly from?: number;
	/** the estimate the wire had already reported by then */
	readonly tokens?: number;
}

/**
 * The seven rows of the screenshot, then five more.
 *
 * The first seven all arrive at 0 because the frame opens on the screenshot rather
 * than playing up to it: the live thought is already at 18s and keeps counting from
 * there, so a still taken the moment this boots is the picture the complaint is
 * about.
 */
export const SCRIPT: readonly ThinkStep[] = [
	{ key: "s1", kind: "tool", verb: "read", subject: "site-punch-sheet--door-twice", at: 0, runs: 0 },
	{ key: "s2", kind: "tool", verb: "run", subject: "List shared libs and site frames", at: 0, runs: 0 },
	{ key: "s3", kind: "tool", verb: "run", subject: "Read project instructions", at: 0, runs: 0 },
	// the row that is the whole argument: a thinking block that opened and closed
	// with nothing in it, and still took a line in the log
	{ key: "s4", kind: "think", verb: "thinking", at: 0, runs: 0, from: 0, tokens: 0 },
	{ key: "s5", kind: "tool", verb: "read", subject: "site-punch-sheet--patch", at: 0, runs: 0 },
	{ key: "s6", kind: "tool", verb: "read", subject: "site-punch-press.ts", at: 0, runs: 0 },
	{ key: "s7", kind: "think", verb: "thinking", at: 0, runs: 6000, from: 18_000, tokens: 540 },
	{ key: "s8", kind: "tool", verb: "edit", subject: "site-punch-press.ts", at: 6000, runs: 1400 },
	{ key: "s9", kind: "tool", verb: "shot", subject: "site-punch-sheet--door-twice", at: 7400, runs: 1600 },
	{ key: "s10", kind: "think", verb: "thinking", at: 9000, runs: 4100, from: 0, tokens: 0 },
	{ key: "s11", kind: "tool", verb: "edit", subject: "site-punch-press.ts", count: 2, at: 13_100, runs: 1800 },
	{ key: "s12", kind: "tool", verb: "shot", subject: "site-punch-sheet--door-twice", at: 14_900, runs: 1700 },
];

const ENDS = SCRIPT.reduce((last, step) => Math.max(last, step.at + step.runs), 0);

export interface DrawnStep {
	readonly key: string;
	readonly kind: "tool" | "think";
	readonly verb: string;
	readonly subject: string | null;
	readonly count: number | null;
	readonly state: "running" | "done";
	/** a thought's clock in ms, and null on everything that is not a thought */
	readonly ms: number | null;
	/** the running estimate, which climbs while the thought does and then stops */
	readonly tokens: number | null;
}

export interface ThinkTurn {
	readonly elapsed: number;
	readonly steps: readonly DrawnStep[];
	readonly running: boolean;
	readonly replay: () => void;
}

/**
 * The clock. Ninety milliseconds, because the only thing on screen that moves
 * faster than a second is a duration printed in tenths, and a thought's tenth is
 * the finest thing this frame prints.
 */
const TICK = 90;

export function useThinkTurn(script: readonly ThinkStep[] = SCRIPT): ThinkTurn {
	const [run, setRun] = useState(0);
	const [elapsed, setElapsed] = useState(0);
	const from = useRef(0);

	useEffect(() => {
		from.current = performance.now();
		setElapsed(0);
		const id = window.setInterval(() => {
			const now = performance.now() - from.current;
			setElapsed(now);
			if (now > ENDS + 400) window.clearInterval(id);
		}, TICK);
		return () => window.clearInterval(id);
	}, [run]);

	const steps: DrawnStep[] = script
		.filter((step) => elapsed >= step.at)
		.map((step) => {
			const live = elapsed < step.at + step.runs;
			const spent = live ? elapsed - step.at : step.runs;
			return {
				key: step.key,
				kind: step.kind,
				verb: step.verb,
				subject: step.subject ?? null,
				count: step.count ?? null,
				state: live ? "running" : "done",
				ms: step.kind === "think" ? (step.from ?? 0) + spent : null,
				tokens: step.kind === "think" ? Math.round((step.tokens ?? 0) + spent * TOKEN_RATE) : null,
			};
		});

	return {
		elapsed,
		steps,
		running: elapsed < ENDS,
		replay: useCallback(() => setRun((n) => n + 1), []),
	};
}

/** the estimate, printed the way a count of tokens is printed anywhere else */
export function tokenCount(tokens: number): string {
	if (tokens < 1000) return `${tokens}`;
	return `${(tokens / 1000).toFixed(1)}k`;
}
