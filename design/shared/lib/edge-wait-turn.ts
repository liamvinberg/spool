import type { Cue, PlayEntry, Turn } from "./turn-play";
import { duration } from "./turn-play";

/**
 * The turn the screenshot caught, as a script the page's own player can run.
 *
 * Every other frame on this page reads a capture out of `shared/fixtures/captures`.
 * This one cannot: the words being drawn are from a screenshot taken against the real
 * rail this week, and none of the seven captures holds them. So the copy is verbatim
 * and the *clock* is the captures' — which is the half that matters here, because the
 * thing under test is what happens at the instant a wait ends.
 *
 * **The waits are real numbers, not plausible ones.** `message_start` carries
 * `ttft_ms`, the measured time from the request going up to the first token coming
 * back, and the six captures hold fifty of them: 878ms at the fastest, 1,970ms at the
 * median, 4,043ms at the slowest. The four here are the first four in
 * `claude-edits.json`'s own order — 1397, 1684, 2682, 1809 — used unchanged and
 * unsqueezed, because a wait played at 1/2.4 of itself is not the wait anybody is
 * complaining about. The work between them is squeezed the way the page squeezes
 * everything else.
 *
 * **What falls out of that, and it is the number the whole question turns on:** the
 * four waits are 7,572ms of a 13,407ms turn. The rail spends **56% of this turn with
 * nothing running in it**, and twelve times in a full `claude-edits` session rather
 * than four. Whatever draws in that gap draws for more than half the time, and
 * whatever is done to it at the end of the gap is done twelve times.
 */

/** the fifty measured times to first token, across all six captures */
export const TTFT_MEASURED = { count: 50, min: 878, median: 1970, max: 4043 } as const;

/** the four this turn uses, in `claude-edits.json`'s own order */
const TTFT = [1397, 1684, 2682, 1809] as const;

/** verbatim, and it stays verbatim: the human's typing is not spool's to tidy */
export const EDGE_ASK =
	"so when the like shot patches or disappears its like patching effect i really like but the last like frame it doesnt smoothly dissappear the last part just instantly goes can you smoothen that out so its like better";

/** what #196 keeps under the human's words: the strip's own line, not a second chip */
export const EDGE_CHIP = "site-punch-sheet--door-twice";

/** the agent's first sentence, which is the entry the first wait precedes */
export const EDGE_SAY = "I'll look at the frame and the shot-patching code first.";

/** Opus 5's measured writing rate, off `say-pace.ts` — 55 characters is a third of a second */
const CHARS_PER_MS = 170 / 1000;

interface RowSpec {
	readonly key: string;
	readonly verb: string;
	readonly subject: string;
	/** ms into its own group before the block opens */
	readonly opens: number;
	/** ms after `opens` before the argument finishes arriving */
	readonly names: number;
	/** ms after `opens` before the result lands */
	readonly runs: number;
	/** a thought has no subject; it counts a duration the capture measured */
	readonly thought?: number;
}

interface GroupSpec {
	/** the message opens with a sentence, when it opens with one */
	readonly says: string | null;
	readonly rows: readonly RowSpec[];
}

/**
 * Four requests, which is four waits.
 *
 * The row order and the row text are the screenshot's. The offsets are the shape a
 * tool block has in every capture read here: the block opens with an empty input, the
 * argument arrives behind it in fragments, and the result lands later still. Three
 * calls in the first message overlap, because they were sent together.
 */
const GROUPS: readonly GroupSpec[] = [
	{
		says: EDGE_SAY,
		rows: [
			{ key: "read-door", verb: "read", subject: "site-punch-sheet--door-twice", opens: 400, names: 150, runs: 1200 },
			{ key: "run-libs", verb: "run", subject: "List shared libs and site frames", opens: 580, names: 150, runs: 2000 },
			{ key: "run-instr", verb: "run", subject: "Read project instructions", opens: 760, names: 150, runs: 1600 },
		],
	},
	{
		says: null,
		rows: [
			{ key: "think-fast", verb: "thinking", subject: "", opens: 0, names: 0, runs: 300, thought: 40 },
			{ key: "read-patch", verb: "read", subject: "site-punch-sheet--patch", opens: 380, names: 130, runs: 800 },
		],
	},
	{
		says: null,
		rows: [{ key: "read-press", verb: "read", subject: "site-punch-press.ts", opens: 0, names: 130, runs: 700 }],
	},
	{
		says: null,
		rows: [{ key: "think-long", verb: "thinking", subject: "", opens: 0, names: 0, runs: 1375, thought: 18_000 }],
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
	/** how long the drawn count takes to reach the measured duration */
	readonly countsFor: number;
}

interface PlacedSay {
	readonly key: string;
	readonly text: string;
	readonly opensAt: number;
	readonly fullAt: number;
}

interface PlacedWait {
	readonly key: string;
	/** the entry this wait sits in front of, which is the one the request is for */
	readonly before: string;
	readonly sentCue: string;
	readonly backCue: string;
	readonly sentAt: number;
	readonly backAt: number;
	readonly ttft: number;
}

export interface EdgeScript {
	readonly cues: readonly Cue[];
	readonly rows: readonly Placed[];
	readonly says: readonly PlacedSay[];
	readonly waits: readonly PlacedWait[];
	readonly total: number;
	/** ms of the turn spent with the request out and nothing back */
	readonly waited: number;
}

function build(): EdgeScript {
	const cues: Cue[] = [];
	const cue = (name: string, at: number) => {
		cues.push({ name, at });
		return name;
	};
	const rows: Placed[] = [];
	const says: PlacedSay[] = [];
	const waits: PlacedWait[] = [];

	let now = 0;
	GROUPS.forEach((group, index) => {
		const ttft = TTFT[index] ?? TTFT_MEASURED.median;
		const sentAt = now;
		const backAt = sentAt + ttft;
		const first = group.says === null ? (group.rows[0]?.key ?? "") : `say:${index}`;
		waits.push({
			key: `wait:${index}`,
			before: first,
			sentCue: cue(`sent:${index}`, sentAt),
			backCue: cue(`back:${index}`, backAt),
			sentAt,
			backAt,
			ttft,
		});

		let ends = backAt;
		if (group.says !== null) {
			const fullAt = backAt + Math.round(group.says.length / CHARS_PER_MS);
			says.push({ key: first, text: group.says, opensAt: backAt, fullAt });
			cue(`open:${first}`, backAt);
			cue(`said:${index}`, fullAt);
			ends = Math.max(ends, fullAt);
		}
		for (const row of group.rows) {
			const opensAt = backAt + row.opens;
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
		waits,
		total: now,
		waited: waits.reduce((sum, wait) => sum + wait.ttft, 0),
	};
}

/** built once, because `useTurn` schedules off the identity of its cue list */
export const EDGE_SCRIPT = build();

export interface EdgeWait {
	readonly key: string;
	/** the entry key the request was for */
	readonly before: string;
	/** the capture's own measured number for this one */
	readonly ttft: number;
	/** how long it has been out, or how long it took once it is over */
	readonly ms: number;
	readonly live: boolean;
}

/**
 * The log at this instant, and every wait that has happened in it.
 *
 * The waits come back whole rather than only the live one, because whether a finished
 * wait is still drawn is exactly the question the frames are asking. Each take reads
 * the same list and decides what to do with it, so nothing about the turn itself
 * differs between them.
 *
 * `ahead` is one take's own rule and it lives here rather than in the rail because it
 * changes what exists rather than where it is drawn: the entry the request is for is
 * created the moment the request goes out, empty, and fills in when the answer lands.
 */
export function edgeLog(
	script: EdgeScript,
	turn: Turn,
	elapsed: number,
	ahead = false,
): { readonly entries: readonly PlayEntry[]; readonly waits: readonly EdgeWait[] } {
	const entries: PlayEntry[] = [];
	if (turn.phase === "idle") return { entries, waits: [] };
	entries.push({ key: "user", kind: "user", text: turn.prompt, context: EDGE_CHIP });

	const waits: EdgeWait[] = script.waits
		.filter((wait) => turn.at(wait.sentCue))
		.map((wait) => {
			const live = !turn.at(wait.backCue);
			return {
				key: wait.key,
				before: wait.before,
				ttft: wait.ttft,
				ms: live ? Math.max(0, elapsed - wait.sentAt) : wait.ttft,
				live,
			};
		});
	/** the entry a live request is for, which `ahead` brings into being early */
	const early = new Set(ahead ? waits.filter((wait) => wait.live).map((wait) => wait.before) : []);

	const ordered: { readonly key: string; readonly entry: PlayEntry }[] = [];
	for (const say of script.says) {
		const open = turn.at(`open:${say.key}`);
		if (!open && !early.has(say.key)) continue;
		const part = Math.max(0, Math.min(1, (elapsed - say.opensAt) / Math.max(1, say.fullAt - say.opensAt)));
		ordered.push({
			key: say.key,
			entry: {
				key: say.key,
				kind: "prose",
				full: say.text,
				shown: open ? say.text.slice(0, Math.round(say.text.length * part)) : "",
			},
		});
	}
	for (const row of script.rows) {
		const opened = turn.at(`open:${row.key}`);
		if (!opened && !early.has(row.key)) continue;
		const named = turn.at(`name:${row.key}`);
		const done = turn.at(`done:${row.key}`);
		const part = Math.max(0, Math.min(1, (elapsed - row.opensAt) / Math.max(1, row.countsFor)));
		const subject =
			row.thought === null ? row.subject : duration(done ? row.thought : Math.round(row.thought * part));
		ordered.push({
			key: row.key,
			entry: {
				key: row.key,
				kind: "line",
				state: done ? "done" : "running",
				verb: opened ? row.verb : "",
				...(row.thought === null ? {} : { quiet: true }),
				...(opened && named ? { subject } : {}),
			},
		});
	}
	// script order, which is the order the wire wrote them and the order the log holds
	const order = [...script.says.map((say) => say.key), ...script.rows.map((row) => row.key)];
	ordered.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
	for (const item of ordered) entries.push(item.entry);
	return { entries, waits };
}
