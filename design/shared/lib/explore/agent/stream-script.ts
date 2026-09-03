import { drawnBy, type Landed } from "shared/lib/explore/agent/say-pace";
import { duration } from "shared/lib/spool/turn-play";

/**
 * One turn, scripted, for the two motion questions under `explore/agent/say` and
 * `explore/agent/log`: how words arrive, and how the log moves when something lands.
 *
 * It is the turn in the screenshot that opened the question: tidy the receipt, shoot it,
 * look, think, say what is wrong, edit six times, look again, correct the overshoot. The
 * rows are hand-placed and the timings compressed to a 22 second loop, but the numbers
 * that matter for motion are the measured ones from #149: a text delta carries about 80
 * characters and the gaps between deltas swing from 300ms to 700ms rather than keeping a
 * beat. What is being compared here is what a row and a word do in the frame they land,
 * and that is the same whichever capture supplied them.
 *
 * Every frame on both pages reads the same script off the same wall clock, so the takes
 * play in step with each other across the canvas rather than each on its own loop.
 */

export interface Delta {
	/** ms from the prose row's own start */
	readonly at: number;
	readonly text: string;
}

export type ScriptRow =
	| { readonly key: string; readonly kind: "user"; readonly at: number; readonly text: string; readonly context: string }
	| {
			readonly key: string;
			readonly kind: "line";
			readonly at: number;
			readonly verb: string;
			readonly subject: string;
			/** the subject lands a beat after the verb: a tool block opens with an empty input */
			readonly subjectAt: number;
			/** null while the turn is still inside it when the loop ends */
			readonly doneAt: number | null;
			/** the row opened to the picture it read back */
			readonly shot?: boolean;
			/** a run of calls on one frame: the cue at which each call joins the count */
			readonly counts?: readonly number[];
			/** the row has a line behind its disclosure */
			readonly detail?: boolean;
	  }
	| { readonly key: string; readonly kind: "think"; readonly at: number; readonly doneAt: number; readonly realMs: number }
	| { readonly key: string; readonly kind: "prose"; readonly at: number; readonly deltas: readonly Delta[] };

export interface Script {
	readonly rows: readonly ScriptRow[];
	/** how long the turn plays before the log fades and starts over */
	readonly turnMs: number;
	/** the settled picture, held so it can be read before the loop restarts */
	readonly holdMs: number;
}

export function periodOf(script: Script): number {
	return script.turnMs + script.holdMs;
}

const TURN_ROWS: readonly ScriptRow[] = [
	{ key: "user", kind: "user", at: 0, text: "tidy the receipt and shoot it", context: "cart" },
	{ key: "think-1", kind: "think", at: 380, doneAt: 600, realMs: 200 },
	{ key: "write", kind: "line", at: 700, verb: "write", subject: "home", subjectAt: 940, doneAt: 2600, detail: true },
	{ key: "shot", kind: "line", at: 2720, verb: "shot", subject: "home", subjectAt: 2900, doneAt: 4200, detail: true },
	{ key: "look-1", kind: "line", at: 4320, verb: "look", subject: "home", subjectAt: 4500, doneAt: 4950, shot: true },
	{ key: "think-2", kind: "think", at: 5050, doneAt: 7400, realMs: 5500 },
	{
		key: "say-1",
		kind: "prose",
		at: 7500,
		deltas: [
			{ at: 0, text: "Home renders correctly and all numbers reconcile. One real problem: about" },
			{ at: 420, text: " 130px of dead space above the CTA, because `rows` grows to fill and the button is" },
			{ at: 1080, text: " pinned below it.\n\nAbsorbing that into row height keeps the rhythm: each row gets" },
			{ at: 1440, text: " 4px more and the CTA lands on the grid." },
		],
	},
	{
		key: "edit-1",
		kind: "line",
		at: 9800,
		verb: "edit",
		subject: "home",
		subjectAt: 10_000,
		doneAt: 12_400,
		detail: true,
		counts: [10_000, 10_500, 10_900, 11_350, 11_800, 12_200],
	},
	{ key: "think-3", kind: "think", at: 12_520, doneAt: 13_600, realMs: 2200 },
	{ key: "logs", kind: "line", at: 13_700, verb: "logs", subject: "home", subjectAt: 13_880, doneAt: 14_600, detail: true },
	{ key: "look-2", kind: "line", at: 14_720, verb: "look", subject: "home", subjectAt: 14_900, doneAt: 15_400, shot: true },
	{ key: "think-4", kind: "think", at: 15_500, doneAt: 16_800, realMs: 2600 },
	{
		key: "say-2",
		kind: "prose",
		at: 16_900,
		deltas: [
			{ at: 0, text: "I misread the first shot's scale (the PNG is 2×), so I overshot." },
			{ at: 560, text: " Trimming back about 28px." },
		],
	},
	{
		key: "edit-2",
		kind: "line",
		at: 18_500,
		verb: "edit",
		subject: "home",
		subjectAt: 18_700,
		doneAt: null,
		detail: true,
		counts: [18_700, 19_250, 19_800, 20_400],
	},
];

/** the whole turn, for the `log` question: rows landing under rows */
export const TURN: Script = { rows: TURN_ROWS, turnMs: 22_000, holdMs: 3_000 };

/**
 * One message and nothing else, for the `say` question.
 *
 * The turn above spends most of its 22 seconds on rows, and the words are on screen for
 * about three of them. A frame about how words arrive wants the words arriving the moment
 * you look at it, so this loop is a lead of one row and then a long message: eight deltas
 * over 3.3 seconds, gaps swinging between 300ms and 700ms, the drain clearing about a
 * second after the last one.
 */
export const SAY: Script = {
	turnMs: 5_400,
	holdMs: 1_900,
	rows: [
		{ key: "user", kind: "user", at: 0, text: "tidy the receipt and shoot it", context: "cart" },
		{ key: "think-1", kind: "think", at: 200, doneAt: 560, realMs: 300 },
		{
			key: "say",
			kind: "prose",
			at: 700,
			deltas: [
				{ at: 0, text: "Home renders correctly and all numbers reconcile against the cart. One real" },
				{ at: 460, text: " problem: about 130px of dead space above the CTA, because `rows` grows to fill" },
				{ at: 820, text: " and the button is pinned below it.\n\nAbsorbing that into row height keeps the" },
				{ at: 1400, text: " rhythm: each row gets 4px more, the divider stays on the 8px grid, and the CTA" },
				{ at: 1750, text: " lands where the thumb already is. I also tightened the receipt header so the" },
				{ at: 2350, text: " order number and the date sit on one line.\n\nShooting again to check the scale" },
				{ at: 2900, text: " before I touch anything else." },
			],
		},
	],
};

export type Entry =
	| { readonly key: string; readonly kind: "user"; readonly text: string; readonly context: string }
	| {
			readonly key: string;
			readonly kind: "line";
			readonly verb: string;
			readonly subject: string | null;
			readonly state: "running" | "done";
			readonly quiet: boolean;
			readonly shot: boolean;
			readonly detail: boolean;
			readonly count: number | null;
	  }
	| {
			readonly key: string;
			readonly kind: "prose";
			/** every character the wire has delivered */
			readonly landed: string;
			/** how many of them the pace allows on screen */
			readonly upto: number;
			/** the whole message, which the wire will eventually deliver */
			readonly full: string;
	  };

/** the log at `elapsed` ms into the turn; `Infinity` is the settled turn */
export function entriesAt(elapsed: number, script: Script = TURN): Entry[] {
	const entries: Entry[] = [];
	for (const row of script.rows) {
		if (row.at > elapsed) continue;
		if (row.kind === "user") {
			entries.push({ key: row.key, kind: "user", text: row.text, context: row.context });
			continue;
		}
		if (row.kind === "think") {
			const done = elapsed >= row.doneAt;
			const part = Math.max(0, Math.min(1, (elapsed - row.at) / (row.doneAt - row.at)));
			entries.push({
				key: row.key,
				kind: "line",
				verb: "thinking",
				subject: duration(done ? row.realMs : row.realMs * part),
				state: done ? "done" : "running",
				quiet: true,
				shot: false,
				detail: false,
				count: null,
			});
			continue;
		}
		if (row.kind === "prose") {
			const schedule: Landed[] = [];
			let upto = 0;
			for (const delta of row.deltas) {
				upto += delta.text.length;
				schedule.push({ at: delta.at, upto });
			}
			const since = elapsed - row.at;
			const landed = row.deltas
				.filter((delta) => delta.at <= since)
				.map((delta) => delta.text)
				.join("");
			entries.push({
				key: row.key,
				kind: "prose",
				landed,
				upto: drawnBy(schedule, since),
				full: row.deltas.map((delta) => delta.text).join(""),
			});
			continue;
		}
		const shows = elapsed >= row.subjectAt;
		const count = row.counts === undefined ? null : row.counts.filter((cue) => cue <= elapsed).length;
		entries.push({
			key: row.key,
			kind: "line",
			verb: row.verb,
			subject: shows && (count === null || count > 0) ? row.subject : null,
			state: row.doneAt !== null && elapsed >= row.doneAt ? "done" : "running",
			quiet: false,
			shot: row.shot === true && shows,
			detail: row.detail === true,
			count: count !== null && count > 1 ? count : null,
		});
	}
	return entries;
}
