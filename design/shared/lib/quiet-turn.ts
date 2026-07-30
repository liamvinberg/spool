import { EDGE_ASK, EDGE_CHIP, EDGE_SAY } from "./edge-wait-turn";
import type { Cue, Turn } from "./turn-play";

/**
 * The screenshot's turn, and the same turn carrying on past it, built so both
 * clocks in it are visible at once.
 *
 * `edge-wait-turn.ts` already plays the screenshot and it is reused for its words —
 * the human's message, the chip and the agent's sentence are imported from it rather
 * than retyped, because they are a real screenshot's copy and this file has no right
 * to a second opinion about them. What is new here is length and honesty about time.
 *
 * **Length**, because the question is whether the log can lose two kinds of row, and a
 * turn that stops at the screenshot cannot show what the log looks like four requests
 * later. Eight requests are played rather than four, using `claude-edits.json`'s own
 * measured times to first token in its own order: 1397, 1684, 2682, 1809, 2484, 2142,
 * 2140, 2292. Twelve is what that capture actually holds; eight is where the run has
 * stopped changing shape.
 *
 * **Two clocks, and they must not be added together.** A capture holds no wall clock —
 * every line of all seven fixtures was checked and there is no timestamp on any of
 * them — so `claude-turn.ts` synthesises an arrival time per event and then squeezes
 * it to something watchable. A time to first token is different: the binary measures
 * it itself and sends it as `ttft_ms`, so a wait is a real number and is played
 * unsqueezed, which is the rule `edge-wait-turn.ts` set and this file keeps. That
 * leaves two timelines:
 *
 *   replay    what a person watching this frame experiences. Waits are real, work is
 *             squeezed, and it comes to about 29s.
 *   capture    what the turn cost the person it happened to. Waits are the same real
 *             numbers; a thought is the duration its own row prints, which is what
 *             ships today; work is the union of the tool intervals in each answer.
 *
 * Every percentage in these frames is capture time, and the frames say so, because a
 * receipt built on the replay clock would be a receipt for the replay.
 *
 * **What that arithmetic comes to, and it is the finding.** Over these eight requests:
 * 16.6s waiting, 22.2s thinking, 8.7s of tools, so **82% of a 47.6s turn is the two
 * beats under question** and 18% of it is work with a noun on it. Over the screenshot's
 * own four requests it is worse: 7.6s waiting and 18.0s thinking against 3.7s of
 * tools, which is 88%. The 56% figure the question came in with is the same fact read
 * off the replay clock, where a thought is squeezed and a wait is not.
 */

/* ---------- what the wire will and will not say ---------- */

/**
 * There is no thinking text, and it is not a design choice anybody made.
 *
 * Verified here rather than taken on trust, by walking every line of all seven
 * fixtures: **346 thinking blocks and deltas, every single one carrying
 * `"thinking": ""`**, and 58 of them carrying a populated `signature` beside the empty
 * string. `agent-events.ts:98` states the same thing in the code that reads it
 * ("Thinking deltas carry an empty string and an estimated token count, so `tokens` is
 * the running total and prose is not a field") and `agent-claude.ts:466` states it for
 * the settled block. So a thinking row can only ever print a clock. There is nothing
 * to disclose, nothing to summarise and nothing to search.
 */
export const THINKING_TEXT = { blocks: 346, withText: 0, withSignature: 58 } as const;

/**
 * How long the thoughts in the corpus actually are, counted in wire events.
 *
 * This is the number that decides the row, and it was not in the question. Counting
 * whole blocks rather than deltas — a `content_block_start` of type `thinking` through
 * to its own `content_block_stop` — the seven fixtures hold **36 thinking blocks**, and
 * the deltas inside them run:
 *
 *   0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,4,4,4,5,5,8,9,9,9,13,14,18,45,86
 *
 * **Seven of thirty-six carry no delta at all** — a block that opened and closed with
 * nothing between, which is exactly the `thinking 0.0s` in the screenshot. **Twenty-two
 * of thirty-six carry two deltas or fewer.** Two carry 45 and 86. So the row the whole
 * argument for keeping thinking rests on — a long, legible, worth-recording thought —
 * is two rows in thirty-six, and the ordinary case is a row that says nothing because
 * there was nothing.
 *
 * `claude-plan.json` on its own is the sharpest version: eleven thinking blocks, five
 * thinking deltas between them, seven blocks empty. A plan turn would draw eleven
 * thinking rows and seven of them would read `0.0s`.
 */
export const THOUGHT_SIZE = {
	blocks: 36,
	empty: 7,
	twoOrFewer: 22,
	longest: 86,
	planBlocks: 11,
	planEmpty: 7,
} as const;

/** the fifty-three measured times to first token across the seven fixtures */
export const TTFT = { count: 53, min: 878, median: 2051, max: 4043 } as const;

export { EDGE_ASK as QUIET_ASK, EDGE_CHIP as QUIET_CHIP, EDGE_SAY as QUIET_SAY };

/** Opus 5's measured writing rate, off `say-pace.ts` */
const CHARS_PER_MS = 170 / 1000;

/* ---------- the script ---------- */

interface RowSpec {
	readonly key: string;
	readonly verb: string;
	readonly subject: string;
	/** how many calls this one row collapsed (#135) */
	readonly count?: number;
	/** ms into its own answer before the block opens */
	readonly opens: number;
	/** ms after `opens` before the argument finishes arriving */
	readonly names: number;
	/** ms after `opens` before the result lands, on the replay clock */
	readonly runs: number;
	/** a thought has no subject and prints a clock: the duration in capture time */
	readonly thought?: number;
}

interface GroupSpec {
	/** the binary's own measurement of this request's wait */
	readonly ttft: number;
	/** an answer opens with a sentence only when it opens with one */
	readonly says: string | null;
	readonly rows: readonly RowSpec[];
}

/**
 * Eight requests, which is eight waits.
 *
 * The first four are the screenshot, row for row and word for word: `read` · `run` ·
 * `run` · `thinking 0.0s` · `read` · `read` · `thinking 18s`, with the last one live.
 * The four after it are the same five verbs and nothing new, and they are here because
 * a still run cannot answer whether a cap is needed. Their thoughts are 0.1s and 4.1s
 * rather than two more eighteens, because `THOUGHT_SIZE` says that is what a thought
 * usually is.
 */
const GROUPS: readonly GroupSpec[] = [
	{
		ttft: 1397,
		says: EDGE_SAY,
		rows: [
			{ key: "read-door", verb: "read", subject: "site-punch-sheet--door-twice", opens: 400, names: 150, runs: 1200 },
			{ key: "run-libs", verb: "run", subject: "List shared libs and site frames", opens: 580, names: 150, runs: 2000 },
			{ key: "run-instr", verb: "run", subject: "Read project instructions", opens: 760, names: 150, runs: 1600 },
		],
	},
	{
		ttft: 1684,
		says: null,
		rows: [
			// the row that is the whole argument: a block that opened and closed with
			// nothing in it, and still took a mark, a verb, a duration and 32px
			{ key: "think-none", verb: "thinking", subject: "", opens: 0, names: 0, runs: 300, thought: 40 },
			{ key: "read-patch", verb: "read", subject: "site-punch-sheet--patch", opens: 380, names: 130, runs: 800 },
		],
	},
	{
		ttft: 2682,
		says: null,
		rows: [{ key: "read-press", verb: "read", subject: "site-punch-press.ts", opens: 0, names: 130, runs: 700 }],
	},
	{
		ttft: 1809,
		says: null,
		// the screenshot's live edge, and the one thought in this turn worth a number
		rows: [{ key: "think-long", verb: "thinking", subject: "", opens: 0, names: 0, runs: 1375, thought: 18_000 }],
	},
	{
		ttft: 2484,
		says: null,
		rows: [
			{ key: "edit-press", verb: "edit", subject: "site-punch-press.ts", opens: 0, names: 140, runs: 900 },
			{ key: "shot-door", verb: "shot", subject: "site-punch-sheet--door-twice", opens: 980, names: 130, runs: 1500 },
		],
	},
	{
		ttft: 2142,
		says: null,
		rows: [{ key: "think-tiny", verb: "thinking", subject: "", opens: 0, names: 0, runs: 320, thought: 60 }],
	},
	{
		ttft: 2140,
		says: null,
		rows: [
			{ key: "edit-again", verb: "edit", subject: "site-punch-press.ts", count: 2, opens: 0, names: 140, runs: 1100 },
			{ key: "shot-again", verb: "shot", subject: "site-punch-sheet--door-twice", opens: 1180, names: 130, runs: 1400 },
		],
	},
	{
		ttft: 2292,
		says: null,
		rows: [{ key: "think-mid", verb: "thinking", subject: "", opens: 0, names: 0, runs: 900, thought: 4100 }],
	},
];

/** the cue the whole row is measured at: the instant the screenshot was taken */
export const SHOT_CUE = "open:think-long";

interface Placed {
	readonly key: string;
	readonly verb: string;
	readonly subject: string;
	readonly count: number | null;
	readonly opensAt: number;
	readonly namesAt: number;
	readonly doneAt: number;
	/** the clock a thought prints, in capture time; null on everything else */
	readonly thought: number | null;
	/**
	 * Which answer this row belongs to.
	 *
	 * Needed because a batch of three calls sent together costs the longest of the three
	 * rather than the sum, so the running split has to union per answer exactly the way
	 * the static one does. Without it, group one's three concurrent calls read as 4.8s of
	 * work where they cost 2.2s, and the percentage the whole row turns on is wrong.
	 */
	readonly group: number;
}

interface PlacedSay {
	readonly key: string;
	readonly text: string;
	readonly opensAt: number;
	readonly fullAt: number;
}

interface PlacedWait {
	readonly key: string;
	/** the entry this request is for, which is what the wait sits in front of */
	readonly before: string;
	readonly sentCue: string;
	readonly backCue: string;
	readonly sentAt: number;
	readonly ttft: number;
}

/** the turn's cost, in capture time, split the only three ways it can be split */
export interface Split {
	/** the request was out and nothing had come back */
	readonly waited: number;
	/** the model was composing a thinking block */
	readonly thought: number;
	/** a tool was running, unioned per answer because a batch runs at once */
	readonly worked: number;
	readonly total: number;
}

export interface QuietScript {
	readonly cues: readonly Cue[];
	readonly rows: readonly Placed[];
	readonly says: readonly PlacedSay[];
	readonly waits: readonly PlacedWait[];
	/** how long the replay lasts, which is not how long the turn cost */
	readonly total: number;
	/** the whole turn, in capture time */
	readonly split: Split;
	/** the screenshot's own four requests, in capture time */
	readonly shotSplit: Split;
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function build(): QuietScript {
	const cues: Cue[] = [];
	const cue = (name: string, at: number) => {
		cues.push({ name, at });
		return name;
	};
	const rows: Placed[] = [];
	const says: PlacedSay[] = [];
	const waits: PlacedWait[] = [];
	/** per group, in capture time, so a batch of three calls counts once */
	const worked: number[] = [];
	const thought: number[] = [];

	let now = 0;
	GROUPS.forEach((group, index) => {
		const sentAt = now;
		const backAt = sentAt + group.ttft;
		const first = group.says === null ? (group.rows[0]?.key ?? "") : `say:${index}`;
		waits.push({
			key: `wait:${index}`,
			before: first,
			sentCue: cue(`sent:${index}`, sentAt),
			backCue: cue(`back:${index}`, backAt),
			sentAt,
			ttft: group.ttft,
		});

		let ends = backAt;
		if (group.says !== null) {
			const fullAt = backAt + Math.round(group.says.length / CHARS_PER_MS);
			says.push({ key: first, text: group.says, opensAt: backAt, fullAt });
			cue(`open:${first}`, backAt);
			ends = Math.max(ends, fullAt);
		}
		// the union of this answer's tool intervals, which is what the batch really cost
		let toolFrom = Number.POSITIVE_INFINITY;
		let toolTo = 0;
		for (const row of group.rows) {
			const opensAt = backAt + row.opens;
			const placed: Placed = {
				key: row.key,
				verb: row.verb,
				subject: row.subject,
				count: row.count ?? null,
				opensAt,
				namesAt: opensAt + row.names,
				doneAt: opensAt + row.runs,
				thought: row.thought ?? null,
				group: index,
			};
			rows.push(placed);
			cue(`open:${row.key}`, placed.opensAt);
			cue(`name:${row.key}`, placed.namesAt);
			cue(`done:${row.key}`, placed.doneAt);
			ends = Math.max(ends, placed.doneAt);
			if (row.thought === undefined) {
				toolFrom = Math.min(toolFrom, row.opens);
				toolTo = Math.max(toolTo, row.opens + row.runs);
			} else {
				thought.push(row.thought);
			}
		}
		worked.push(toolTo > 0 ? toolTo - toolFrom : 0);
		now = ends;
	});

	const split = (upto: number): Split => {
		const waited = sum(GROUPS.slice(0, upto).map((group) => group.ttft));
		const thinking = sum(
			GROUPS.slice(0, upto).flatMap((group) => group.rows.map((row) => row.thought ?? 0)),
		);
		const work = sum(worked.slice(0, upto));
		return { waited, thought: thinking, worked: work, total: waited + thinking + work };
	};

	return {
		cues,
		rows,
		says,
		waits,
		total: now,
		split: split(GROUPS.length),
		// the screenshot is the first four requests, ending on the thought that is live in it
		shotSplit: split(4),
	};
}

/** built once, because `useTurn` schedules off the identity of its cue list */
export const QUIET_SCRIPT = build();

/* ---------- the log at one instant ---------- */

/** a thing in the log, whatever kind of thing it is */
export type QuietItem =
	| { readonly key: string; readonly kind: "asked"; readonly text: string; readonly chip: string }
	| { readonly key: string; readonly kind: "said"; readonly full: string; readonly shown: string }
	| {
			readonly key: string;
			readonly kind: "row" | "thought";
			readonly state: "running" | "done";
			readonly verb: string;
			/** what the verb acted on; a thought has none, which is the whole problem */
			readonly subject: string | null;
			readonly count: number | null;
			/** a thought's clock, in capture time, which is the only thing it can print */
			readonly ms: number | null;
	  }
	/** today's beat: an entry with no name on it, removed the moment an answer starts */
	| { readonly key: string; readonly kind: "wait"; readonly ms: number }
	/** one settled line per turn, which is the only receipt any of these takes offers */
	| { readonly key: string; readonly kind: "receipt"; readonly split: Split };

/** what the fixed line above the composer has to be able to say */
export type QuietState =
	| { readonly kind: "idle" }
	| { readonly kind: "waiting"; readonly ms: number }
	| { readonly kind: "thinking"; readonly ms: number }
	| { readonly kind: "working"; readonly ms: number }
	| { readonly kind: "settled"; readonly split: Split };

export interface QuietRead {
	readonly items: readonly QuietItem[];
	readonly state: QuietState;
	/** the turn's cost so far, in capture time */
	readonly spent: Split;
	/** the run's own want in rows, so a frame can print it without counting by hand */
	readonly rows: number;
}

/**
 * Read the log, once, for every take at once.
 *
 * Nothing here knows which take is asking. It returns the whole truth — the wait as an
 * item, the thoughts as items, the receipt as an item, and the state the fixed line
 * would show — and each take decides what to draw. That is what makes the five frames
 * a comparison rather than five separate designs: a difference you can see between two
 * of them is a difference somebody chose, not a different turn.
 */
export function quietLog(script: QuietScript, turn: Turn, elapsed: number): QuietRead {
	if (turn.phase === "idle")
		return { items: [], state: { kind: "idle" }, spent: { waited: 0, thought: 0, worked: 0, total: 0 }, rows: 0 };

	const items: QuietItem[] = [{ key: "asked", kind: "asked", text: turn.prompt, chip: EDGE_CHIP }];

	/** the one request that is out right now, if any */
	let live: { readonly before: string; readonly ms: number } | null = null;
	let waited = 0;
	for (const wait of script.waits) {
		if (!turn.at(wait.sentCue)) continue;
		if (turn.at(wait.backCue)) {
			waited += wait.ttft;
			continue;
		}
		const ms = Math.max(0, elapsed - wait.sentAt);
		waited += Math.min(ms, wait.ttft);
		live = { before: wait.before, ms };
	}

	const ordered: { readonly key: string; readonly item: QuietItem }[] = [];
	for (const say of script.says) {
		if (!turn.at(`open:${say.key}`)) continue;
		const part = Math.max(0, Math.min(1, (elapsed - say.opensAt) / Math.max(1, say.fullAt - say.opensAt)));
		ordered.push({
			key: say.key,
			item: { key: say.key, kind: "said", full: say.text, shown: say.text.slice(0, Math.round(say.text.length * part)) },
		});
	}

	let thought = 0;
	let thinkingNow: number | null = null;
	let working = false;
	/**
	 * Per answer rather than per row: the union of one batch's tool intervals, keyed by
	 * the group. Three calls sent together cost the span they cover, not the sum of
	 * three spans, and the sum is 2.6s wrong on this turn's first answer alone.
	 */
	const spans = new Map<number, { from: number; to: number }>();
	for (const row of script.rows) {
		if (!turn.at(`open:${row.key}`)) continue;
		const named = turn.at(`name:${row.key}`);
		const done = turn.at(`done:${row.key}`);
		const part = Math.max(0, Math.min(1, (elapsed - row.opensAt) / Math.max(1, row.doneAt - row.opensAt)));
		if (row.thought === null) {
			const to = done ? row.doneAt : Math.max(row.opensAt, elapsed);
			const span = spans.get(row.group);
			if (span === undefined) spans.set(row.group, { from: row.opensAt, to });
			else spans.set(row.group, { from: Math.min(span.from, row.opensAt), to: Math.max(span.to, to) });
			if (!done) working = true;
			ordered.push({
				key: row.key,
				item: {
					key: row.key,
					kind: "row",
					state: done ? "done" : "running",
					verb: row.verb,
					subject: named ? row.subject : null,
					count: named ? row.count : null,
					ms: null,
				},
			});
			continue;
		}
		const clock = done ? row.thought : Math.round(row.thought * part);
		thought += clock;
		if (!done) thinkingNow = clock;
		ordered.push({
			key: row.key,
			item: {
				key: row.key,
				kind: "thought",
				state: done ? "done" : "running",
				verb: row.verb,
				subject: null,
				count: null,
				ms: clock,
			},
		});
	}
	let worked = 0;
	for (const span of spans.values()) worked += Math.max(0, span.to - span.from);

	/* script order, which is the order the wire wrote them and the order the log holds */
	const order = [...script.says.map((say) => say.key), ...script.rows.map((row) => row.key)];
	ordered.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

	/** the wait goes in front of the entry its own request is for, which is what ships */
	const held = new Set(ordered.map((entry) => entry.key));
	for (const entry of ordered) {
		if (live !== null && live.before === entry.key) items.push({ key: "wait", kind: "wait", ms: live.ms });
		items.push(entry.item);
	}
	if (live !== null && !held.has(live.before)) items.push({ key: "wait", kind: "wait", ms: live.ms });

	const spent: Split = { waited, thought, worked, total: waited + thought + worked };
	const settled = turn.phase === "settled" || turn.phase === "stopped";
	if (settled) items.push({ key: "receipt", kind: "receipt", split: spent });

	const state: QuietState = settled
		? { kind: "settled", split: spent }
		: live !== null
			? { kind: "waiting", ms: live.ms }
			: thinkingNow !== null
				? { kind: "thinking", ms: thinkingNow }
				: working
					? { kind: "working", ms: 0 }
					: { kind: "idle" };

	return {
		items,
		state,
		spent,
		rows: ordered.filter((entry) => entry.item.kind === "row" || entry.item.kind === "thought").length,
	};
}

/** a split as one mono line, in the register the machine prints numbers in */
export function splitLine(split: Split): string {
	const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
	return `waited ${secs(split.waited)} · thought ${secs(split.thought)} · worked ${secs(split.worked)}`;
}

/** what share of a turn the two beats under question account for */
export function quietShare(split: Split): number {
	if (split.total === 0) return 0;
	return Math.round(((split.waited + split.thought) / split.total) * 100);
}
