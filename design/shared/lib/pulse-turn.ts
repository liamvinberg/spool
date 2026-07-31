import type { EdgeScript } from "./edge-wait-turn";
import { EDGE_ASK, EDGE_CHIP, EDGE_SAY } from "./edge-wait-turn";
import type { Cue } from "./turn-play";

/**
 * Round four's turn, and the only thing that changed is where the wait ends.
 *
 * Round three measured the wait from the request going out to the *first token back*,
 * which is what `ttft_ms` reports and what the receipt shipped counting. Round four
 * measures it to the first thing the log actually **draws**. On a plain answer those are
 * the same instant. On a reasoning answer they are not remotely the same instant, and the
 * gap between them is this page.
 *
 * **What the gap is, measured.** A message that begins by thinking reaches `message_start`
 * at its own time to first token and then streams thinking deltas that carry an empty
 * string and an estimated token count. The seven captures hold 27 such messages. Their
 * token counts, largest first: 9,500 · 1,750 · 1,450 · 1,200 · 1,200 · 1,050 · 1,000 ·
 * 900 · 600 · 550 · 500 … down to 50.
 *
 * **What a token costs in seconds, measured.** The four sequential captures report
 * 91,219 output tokens against 1,526,007ms of API time: **16.7ms a token**, 60 a second.
 * (`claude-fanout`'s second result is excluded and it is the only exclusion: 1,344,034ms
 * against 3,784 tokens is four delegates' wall clock billed to one turn's counter, and it
 * would put the rate out by a factor of twenty.)
 *
 * **So the silence the old anchor did not cover:** 1,750 tokens is 29 seconds. 9,500 is
 * **two minutes thirty-nine**. Under the shipped anchor the receipt settled at the top of
 * every one of them and the rail then had nothing at all to say for the rest.
 *
 * The human's sentence, the chip and the agent's first line are round three's, unchanged
 * and verbatim, so a frame here can be put beside a frame from `agent-load--*` and the
 * only difference in the picture is the one under test.
 */

/** the sequential output rate the four clean captures report, in ms a token */
export const MS_A_TOKEN = 16.7;

/** every thinking message in the seven captures, by estimated tokens, largest first */
export const THINKING_MEASURED = [
	9500, 1750, 1450, 1200, 1200, 1050, 1000, 900, 600, 550, 500, 350, 350, 300, 200, 146, 129, 111, 100, 100, 100, 100,
	100, 100, 100, 50, 50,
] as const;

/** the largest one, in ms: `claude-mcp`'s 9,500-token block, and the worst case on this page */
export const WORST_THOUGHT = Math.round(9500 * MS_A_TOKEN);

/**
 * The four requests, each as one wait the reader has to sit through.
 *
 * `ttft` is the capture's own `ttft_ms` and `tokens` is a real thinking block from the
 * same fixtures. The wait is their sum, because after the fix that is one receipt: the
 * request goes out, the model thinks, and the line stops when there is something to read.
 *
 * The four are picked to span the range rather than to flatter it — an answer that starts
 * talking at once, two ordinary thoughts, and the long one. 1,750 tokens rather than 9,500
 * for the long one, because 159 seconds cannot be played in a frame anybody will watch and
 * a number this page has to be honest about is better carried by the readout than faked by
 * the clock. `WORST_THOUGHT` is printed on every frame for that reason.
 */
const REQUESTS = [
	{ ttft: 1397, tokens: 0 },
	{ ttft: 1684, tokens: 100 },
	{ ttft: 2682, tokens: 350 },
	{ ttft: 1809, tokens: 1750 },
] as const;

/** Opus 5's measured writing rate, off `say-pace.ts` */
const CHARS_PER_MS = 170 / 1000;

interface RowSpec {
	readonly key: string;
	readonly verb: string;
	readonly subject: string;
	readonly opens: number;
	readonly names: number;
	readonly runs: number;
}

interface GroupSpec {
	readonly says: string | null;
	readonly rows: readonly RowSpec[];
}

/**
 * Round three's own groups with the thinking rows taken out of them.
 *
 * They are gone because after the fix they are not rows. A thought is the wait, and
 * drawing it twice — once as the receipt counting and once as a `thinking 18s` line of its
 * own underneath — is the double-count the anchor move exists to remove.
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
	{ says: null, rows: [{ key: "read-patch", verb: "read", subject: "site-punch-sheet--patch", opens: 0, names: 130, runs: 800 }] },
	{ says: null, rows: [{ key: "read-press", verb: "read", subject: "site-punch-press.ts", opens: 0, names: 130, runs: 700 }] },
	{
		says: null,
		rows: [{ key: "edit-press", verb: "wrote", subject: "site-punch-press.ts", opens: 0, names: 140, runs: 900 }],
	},
];

function build(): EdgeScript {
	const cues: Cue[] = [];
	const cue = (name: string, at: number) => {
		cues.push({ name, at });
		return name;
	};
	const rows: EdgeScript["rows"][number][] = [];
	const says: EdgeScript["says"][number][] = [];
	const waits: EdgeScript["waits"][number][] = [];

	let now = 0;
	GROUPS.forEach((group, index) => {
		const spec = REQUESTS[index] ?? REQUESTS[0];
		const ttft = spec.ttft + Math.round(spec.tokens * MS_A_TOKEN);
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
			const placed = {
				key: row.key,
				verb: row.verb,
				subject: row.subject,
				opensAt,
				namesAt: opensAt + row.names,
				doneAt: opensAt + row.runs,
				thought: null,
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

	return { cues, rows, says, waits, total: now, waited: waits.reduce((sum, wait) => sum + wait.ttft, 0) };
}

/** built once, because `useTurn` schedules off the identity of its cue list */
export const PULSE_SCRIPT = build();

/** the longest wait this turn actually plays, which is what the takes are tuned against */
export const PULSE_LONGEST = PULSE_SCRIPT.waits.reduce((worst, wait) => Math.max(worst, wait.ttft), 0);

export { EDGE_ASK, EDGE_CHIP };
