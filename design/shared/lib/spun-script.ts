import { EDGE_ASK, EDGE_CHIP, EDGE_SAY, TTFT_MEASURED } from "./edge-wait-turn";
import type { Cue, PlayEntry, Question, Turn } from "./turn-play";
import { duration } from "./turn-play";

/**
 * The turn the line takes have to draw, and the five things it can be doing.
 *
 * `edge-wait-turn.ts` is the script round three ran and it is reused where it can be:
 * the human's words, the chip under them, the agent's first sentence and the measured
 * times to first token are all imported from it rather than retyped. What it cannot
 * give this round is the state it has no room for. Its four groups are request, work,
 * request, work — nothing in it **stops**, so a rail built on it can never show the one
 * distinction the brief says is worth drawing:
 *
 *   > something needs you versus it is working, because only one is a call to act.
 *
 * So this script adds a third group that parks on a real captured `AskUserQuestion` and
 * waits for a person. Everything else about it is the other script's shape.
 *
 * **What spool can tell apart, off the wire, without a word for any of it.** Five, and
 * they are not guesses:
 *
 *   out        the request is up and nothing has come back. `agent-transcript.ts:1123`.
 *   thinking   a thinking block is open. It carries a clock and a token estimate and
 *              **no text at all** — 346 blocks across six captures, every one
 *              `"thinking": ""` (claude-code#20127), so there is nothing to print and
 *              a mark is the only thing that can carry it.
 *   saying     words are arriving, and nothing else is open.
 *   doing      one or more tool calls are open.
 *   asking     the turn has stopped on a question. Only a person moves it.
 *
 * Precedence is fixed here rather than per take, so six frames cannot disagree about
 * what a moment *is*: asking, out, thinking, doing, saying. `doing` outranks `saying`
 * because words and an open call overlap for most of a group's life, and the honest
 * reading of that overlap is that work is running — a take that drew *saying* there
 * would be claiming the rail is quiet while two calls are out.
 *
 * **The clock.** The three waits are 1397, 1684 and 2682ms, the first three of
 * `claude-edits.json`'s own `ttft_ms` values, unsqueezed. The work between them is
 * squeezed the way this page squeezes everything else, and the long thinking block is
 * squeezed hardest: it counts the measured 18,000ms out over 3,000ms of drawn time,
 * printed on every frame as the ratio it is. The park releases itself after 2,600ms so
 * the frames loop, which is the one thing here that is a frame's convenience rather
 * than a capture's fact.
 */

/** the fifty measured times to first token, carried through so a frame can print them */
export { TTFT_MEASURED, EDGE_ASK, EDGE_CHIP };

/** the three this turn uses, in `claude-edits.json`'s own order */
const TTFT = [1397, 1684, 2682] as const;

/**
 * The agent's first sentence: the screenshot's own line, plus one written for this row.
 *
 * Said plainly because it is the only invented copy here. `EDGE_SAY` is 56 characters,
 * which at Opus 5's measured 170 a second streams for **330ms** — and one of the six
 * takes rests its whole argument on what the edge does while words are arriving, which
 * cannot be looked at in a third of a second. The second sentence takes the streaming
 * phase to 890ms. Nothing else about the copy is new.
 */
export const SPUN_SAY = `${EDGE_SAY} The patch runs off an SVG mask, so the last step lands whole instead of fading with the rest.`;

/** Opus 5's measured writing rate, off `say-pace.ts` */
const CHARS_PER_MS = 170 / 1000;

/**
 * The question, verbatim from `claude-mcp.json`, and the first two of its options with
 * their whole descriptions — which is what #197 settled a question draws in the log.
 */
const ASK: Question = {
	header: "Shot fix",
	question:
		"`spool shot` is blocked by the v0.3.0 CLI / v0.4.0 daemon split. How do you want the version gap closed?",
	multi: false,
	options: [
		{
			label: "Run `spool upgrade`",
			description:
				"I run it, which installs the latest release and restarts the daemon on it, then re-run `spool shot receipt` and report the render. Side effect: the daemon restarts under any canvas you currently have open.",
		},
		{
			label: "You fix it, I shoot",
			description:
				"You upgrade or re-auth yourself, then say go and I re-run `spool shot receipt` and `spool logs receipt` without touching your install.",
		},
	],
};

/** the measured length of the long thinking block, and the drawn time it is squeezed into */
export const THOUGHT_MS = 18_000;
const THOUGHT_DRAWN = 3_000;
/** how long the park holds before it releases itself, so the frames loop */
export const PARK_MS = 2_600;

interface RowSpec {
	readonly key: string;
	readonly verb: string;
	readonly subject: string;
	/** ms after the answer lands before the block opens */
	readonly opens: number;
	/** ms after `opens` before the argument has arrived */
	readonly names: number;
	/** ms after `opens` before the result lands */
	readonly runs: number;
	/** a thought has no subject; it counts a duration the capture measured */
	readonly thought?: number;
}

interface GroupSpec {
	readonly says: string | null;
	readonly asks: boolean;
	readonly rows: readonly RowSpec[];
}

const GROUPS: readonly GroupSpec[] = [
	{
		says: SPUN_SAY,
		asks: false,
		rows: [
			{ key: "read-door", verb: "read", subject: "site-punch-sheet--door-twice", opens: 900, names: 150, runs: 1200 },
			{ key: "run-libs", verb: "run", subject: "List shared libs and site frames", opens: 1100, names: 150, runs: 2000 },
		],
	},
	{
		says: null,
		asks: false,
		rows: [
			{ key: "think-long", verb: "thinking", subject: "", opens: 0, names: 0, runs: THOUGHT_DRAWN, thought: THOUGHT_MS },
			{ key: "read-press", verb: "read", subject: "site-punch-press.ts", opens: 3150, names: 130, runs: 900 },
		],
	},
	{
		says: null,
		asks: true,
		rows: [{ key: "edit-patch", verb: "edit", subject: "site-punch-sheet--patch", opens: 450, names: 140, runs: 950 }],
	},
];

interface Placed {
	readonly key: string;
	readonly verb: string;
	readonly subject: string;
	readonly opensAt: number;
	readonly namesAt: number;
	readonly doneAt: number;
	readonly thought: number | null;
	readonly countsFor: number;
}

interface PlacedSay {
	readonly key: string;
	readonly text: string;
	readonly opensAt: number;
	readonly fullAt: number;
}

interface PlacedAsk {
	readonly key: string;
	readonly opensAt: number;
	readonly liveAt: number;
	readonly doneAt: number;
}

interface PlacedWait {
	readonly key: string;
	readonly sentCue: string;
	readonly backCue: string;
	readonly sentAt: number;
	readonly ttft: number;
}

export interface SpunScript {
	readonly cues: readonly Cue[];
	readonly rows: readonly Placed[];
	readonly says: readonly PlacedSay[];
	readonly ask: PlacedAsk;
	readonly waits: readonly PlacedWait[];
	readonly total: number;
	/** the cue the turn parks on, which is the question going live */
	readonly hold: string;
	/** ms of the turn spent with a request out and nothing back */
	readonly waited: number;
}

/** how long the question takes to type itself in, on the capture's own eleven fragments */
const ASK_TYPES = 800;
/** ms after the ask block opens before the options have arrived */
const ASK_OPENS = 150;

function build(): SpunScript {
	const cues: Cue[] = [];
	const cue = (name: string, at: number) => {
		cues.push({ name, at });
		return name;
	};
	const rows: Placed[] = [];
	const says: PlacedSay[] = [];
	const waits: PlacedWait[] = [];
	let ask: PlacedAsk = { key: "ask", opensAt: 0, liveAt: 0, doneAt: 0 };
	let hold = "";

	let now = 0;
	GROUPS.forEach((group, index) => {
		const ttft = TTFT[index] ?? TTFT_MEASURED.median;
		const sentAt = now;
		const backAt = sentAt + ttft;
		waits.push({
			key: `wait:${index}`,
			sentCue: cue(`sent:${index}`, sentAt),
			backCue: cue(`back:${index}`, backAt),
			sentAt,
			ttft,
		});

		let ends = backAt;
		if (group.says !== null) {
			const fullAt = backAt + Math.round(group.says.length / CHARS_PER_MS);
			says.push({ key: `say:${index}`, text: group.says, opensAt: backAt, fullAt });
			cue(`open:say:${index}`, backAt);
			cue(`said:${index}`, fullAt);
			ends = Math.max(ends, fullAt);
		}
		if (group.asks) {
			const opensAt = backAt + ASK_OPENS;
			const liveAt = opensAt + ASK_TYPES;
			ask = { key: "ask", opensAt, liveAt, doneAt: liveAt + 250 };
			cue("open:ask", opensAt);
			hold = cue("live:ask", liveAt);
			cue("done:ask", ask.doneAt);
			ends = Math.max(ends, ask.doneAt);
		}
		for (const row of group.rows) {
			const from = group.asks ? ask.doneAt : backAt;
			const opensAt = from + row.opens;
			const placed: Placed = {
				key: row.key,
				verb: row.verb,
				subject: row.subject,
				opensAt,
				namesAt: opensAt + row.names,
				doneAt: opensAt + row.runs,
				thought: row.thought ?? null,
				countsFor: row.runs,
			};
			rows.push(placed);
			cue(`open:${row.key}`, placed.opensAt);
			cue(`name:${row.key}`, placed.namesAt);
			cue(`done:${row.key}`, placed.doneAt);
			ends = Math.max(ends, placed.doneAt);
		}
		now = ends;
	});

	return {
		cues,
		rows,
		says,
		ask,
		waits,
		total: now,
		hold,
		waited: waits.reduce((sum, wait) => sum + wait.ttft, 0),
	};
}

/** built once, because `useTurn` schedules off the identity of its cue list */
export const SPUN_SCRIPT = build();

/** the five the wire can tell apart, plus the rail sitting empty */
export type SpunState = "idle" | "out" | "thinking" | "saying" | "doing" | "asking";

export interface Spun {
	readonly state: SpunState;
	/** a live request plus every call still open: what the wire has away from us */
	readonly load: number;
	/** something is out there: a request up, or a call running */
	readonly out: boolean;
	/** something is coming back: words arriving, or a result landing */
	readonly back: boolean;
	/** the turn has stopped on a person */
	readonly parked: boolean;
	/** ms the current state has been the state, for a take that wants to escalate */
	readonly since: number;
}

const REST: Spun = { state: "idle", load: 0, out: false, back: false, parked: false, since: 0 };

/**
 * How long a result counts as coming back.
 *
 * A `tool_result` is an instant rather than a stretch, and one take spends *direction* on
 * the difference between something going out and something coming back — so the return
 * trip needs a length or it can never be drawn at all. 500ms is one pass of that take's
 * own stroke, which is the shortest window in which a direction is readable.
 */
const RETURN_MS = 500;

/**
 * The rate a pass is drawn at, on `say-pace.ts`'s own shape rather than on a timer.
 *
 *     ms per pass = max(FLOOR_PASS, DRAIN_PASS / load)
 *
 * Which is `min(rate ceiling, backlog-proportional rate)` written the other way up.
 * `say-pace.ts` paces characters against a 250ms drain window and an 83 c/s floor; a
 * stroke has one pass rather than 3,372 characters, so the two constants are the same
 * idea at the stroke's own scale: a pass never takes longer than `DRAIN_PASS` and never
 * finishes faster than `FLOOR_PASS`, whatever the backlog does.
 */
const DRAIN_PASS = 1800;
const FLOOR_PASS = 620;

export function passMs(load: number): number {
	if (load <= 0) return 0;
	return Math.max(FLOOR_PASS, DRAIN_PASS / load);
}

/**
 * The log at this instant, and what the wire is doing while it is drawn.
 *
 * One function for both, because a take reading the state and a transcript drawing the
 * rows have to be the same moment: a stroke that says *doing* while no row is open is
 * the whole defect this round is being measured for.
 */
export function spunLog(
	script: SpunScript,
	turn: Turn,
	elapsed: number,
): { readonly entries: readonly PlayEntry[]; readonly spun: Spun } {
	const entries: PlayEntry[] = [];
	if (turn.phase === "idle") return { entries, spun: REST };
	entries.push({ key: "user", kind: "user", text: turn.prompt, context: EDGE_CHIP });

	/** a request is up and nothing has come back yet */
	let live = false;
	let liveSince = 0;
	for (const wait of script.waits) {
		if (!turn.at(wait.sentCue)) continue;
		if (turn.at(wait.backCue)) continue;
		live = true;
		liveSince = wait.sentAt;
	}

	const ordered: { readonly key: string; readonly entry: PlayEntry }[] = [];
	let saying = false;
	let sayingSince = 0;

	for (const say of script.says) {
		if (!turn.at(`open:${say.key}`)) continue;
		const part = Math.max(0, Math.min(1, (elapsed - say.opensAt) / Math.max(1, say.fullAt - say.opensAt)));
		const shown = say.text.slice(0, Math.round(say.text.length * part));
		if (part < 1) {
			saying = true;
			sayingSince = say.opensAt;
		}
		ordered.push({ key: say.key, entry: { key: say.key, kind: "prose", full: say.text, shown } });
	}

	let open = 0;
	let openSince = 0;
	let thinking = false;
	let thinkingSince = 0;
	/** the last result to land, so a take can draw the return trip as well as the outward one */
	let landed = -1;
	for (const row of script.rows) {
		if (!turn.at(`open:${row.key}`)) continue;
		const named = turn.at(`name:${row.key}`);
		const done = turn.at(`done:${row.key}`);
		const part = Math.max(0, Math.min(1, (elapsed - row.opensAt) / Math.max(1, row.countsFor)));
		const subject = row.thought === null ? row.subject : duration(done ? row.thought : Math.round(row.thought * part));
		if (done) landed = Math.max(landed, row.doneAt);
		else if (row.thought === null) {
			open += 1;
			openSince = Math.max(openSince, row.opensAt);
		} else {
			thinking = true;
			thinkingSince = row.opensAt;
		}
		ordered.push({
			key: row.key,
			entry: {
				key: row.key,
				kind: "line",
				state: done ? "done" : "running",
				verb: row.verb,
				...(row.thought === null ? {} : { quiet: true }),
				...(named ? { subject } : {}),
			},
		});
	}

	const asked = turn.at(`open:${script.ask.key}`);
	const parked = turn.waiting;
	if (asked) {
		const part = Math.max(
			0,
			Math.min(1, (elapsed - script.ask.opensAt) / Math.max(1, script.ask.liveAt - script.ask.opensAt)),
		);
		const answerable = turn.at(script.hold);
		const done = turn.at("done:ask");
		ordered.push({
			key: script.ask.key,
			entry: {
				key: script.ask.key,
				kind: "ask",
				state: done ? "done" : "running",
				ask: ASK,
				shown: ASK.question.slice(0, Math.round(ASK.question.length * part)),
				live: answerable,
			},
		});
	}

	const order = [
		...script.says.map((say) => say.key),
		...script.rows.map((row) => row.key),
		script.ask.key,
	];
	ordered.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
	for (const item of ordered) entries.push(item.entry);

	const state: SpunState = parked
		? "asking"
		: live
			? "out"
			: thinking
				? "thinking"
				: open > 0
					? "doing"
					: saying
						? "saying"
						: "idle";
	const since = parked
		? 0
		: state === "out"
			? Math.max(0, elapsed - liveSince)
			: state === "thinking"
				? Math.max(0, elapsed - thinkingSince)
				: state === "doing"
					? Math.max(0, elapsed - openSince)
					: state === "saying"
						? Math.max(0, elapsed - sayingSince)
						: 0;

	return {
		entries,
		spun: {
			state,
			load: (live ? 1 : 0) + open,
			out: live || open > 0,
			back: saying || (landed >= 0 && elapsed - landed < RETURN_MS),
			parked,
			since,
		},
	};
}
