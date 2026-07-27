import { useEffect, useMemo, useState } from "react";
import { type Cue, duration, type PlayEntry, type RowChild, type RowState, type ShotRef, type Turn } from "./turn-play";

/**
 * Replaying a real Claude Code session.
 *
 * Two captures, both from `claude -p --output-format stream-json
 * --include-partial-messages --verbose` during actual spool design sessions:
 *
 *   claude-turn.json    236 events, a from-scratch build of a habit tracker
 *                       called Streak. One agent, one thing at a time.
 *   claude-fanout.json  425 events, three sub-agents authoring three variants
 *                       of one frame in parallel in a coffee-shop project
 *                       called kaffe. See the fan-out section below.
 *
 * This module is the projection from those events to the rail's vocabulary.
 * Nothing here is authored — the ordering, the intervals, the tool names, the
 * task wording and the sub-agents' progress are all read off the captures, and
 * where a capture is silent this file says so out loud.
 *
 * Three things the capture settled that the hand-written cue lists had wrong:
 *
 *   prose is a preamble, not a summary. In the real message the blocks arrive
 *   thinking, then text, then tool_use — the agent says what it is about to do
 *   and then does it. It also arrives in two chunks 376ms apart, not word by word
 *   at reading pace.
 *
 *   a tool row's argument lands late because the block genuinely opens empty.
 *   Every content_block_start for a tool is followed by a zero-length
 *   input_json_delta, and the argument arrives in uneven fragments behind it.
 *
 *   a thinking line has nothing to show. thinking_delta carries an empty string
 *   and an estimated token count, so a duration is the honest whole of it — and
 *   the durations are not the ones anyone would guess: 1.4s once, 3:38 once.
 *
 * Timing. The capture timestamps whole messages, not stream events, so stream
 * events are placed inside the timestamps they sit between: forward from the last
 * one at the capture's own median stream pace when the gap is small enough to
 * explain, backwards from the next one when it is not, because an unexplainable
 * gap is an elision and the elided work happened before the events that follow
 * it. `status: requesting` raises a request, `message_start` carries the real
 * ttft_ms, and the wait between them is the wait the frame plays.
 */

/* ---------- the capture ---------- */

interface Delta {
	readonly type: string;
	readonly text?: string;
	readonly partial_json?: string;
	readonly estimated_tokens?: number;
}

interface StreamEvent {
	readonly type: string;
	readonly index?: number;
	readonly delta?: Delta;
	readonly content_block?: { readonly type: string; readonly name?: string };
}

interface Block {
	readonly type: string;
	readonly name?: string;
	readonly id?: string;
	readonly text?: string;
	readonly input?: string;
	readonly tool_use_id?: string;
	readonly source?: { readonly media_type?: string };
	readonly content?: string | readonly Block[];
}

export interface CaptureEvent {
	readonly type: string;
	readonly subtype?: string;
	readonly status?: string;
	readonly timestamp?: string;
	readonly ttft_ms?: number;
	readonly parent_tool_use_id?: string | null;
	readonly event?: StreamEvent;
	readonly message?: { readonly content?: string | readonly Block[] };
	readonly description?: string;
	readonly tool_use_id?: string;
	readonly patch?: { readonly status?: string; readonly end_time?: number };
	readonly summary?: string;
	/** init names the project root, which is how a path becomes project-relative */
	readonly cwd?: string;
	/** the runtime's own id for a delegated task; task_updated arrives carrying only this */
	readonly task_id?: string;
}

/** the mock answers relative URLs out of shared/fixtures, so the capture is one fetch away */
export function useCapture(name: string): readonly CaptureEvent[] | undefined {
	const [events, setEvents] = useState<readonly CaptureEvent[] | undefined>(undefined);
	useEffect(() => {
		let live = true;
		void fetch(`/api/${name}`)
			.then((response) => response.json() as Promise<readonly CaptureEvent[]>)
			.then((body) => {
				if (live) setEvents(body);
			})
			// a missing or malformed fixture must name itself in the frame's console
			.catch((reason: unknown) => console.error(`capture ${name} did not load`, reason));
		return () => {
			live = false;
		};
	}, [name]);
	return events;
}

/* ---------- reading events ---------- */

const wireOf = (event: CaptureEvent): StreamEvent | undefined => (event.type === "stream_event" ? event.event : undefined);

const blocksOf = (event: CaptureEvent): readonly Block[] =>
	Array.isArray(event.message?.content) ? event.message.content : [];

const isRequest = (event: CaptureEvent): boolean =>
	event.type === "system" && event.subtype === "status" && event.status === "requesting";

const fromParent = (event: CaptureEvent): boolean => (event.parent_tool_use_id ?? null) === null;

/**
 * A field out of a tool's input. The capture elides long values, which leaves
 * some inputs invalid JSON, so this reads the string by hand rather than parsing
 * and losing the whole call.
 */
function field(raw: string | undefined, key: string): string | null {
	if (raw === undefined) return null;
	const quoted = `"${key}"`;
	const found = raw.indexOf(quoted);
	if (found < 0) return null;
	let index = raw.indexOf('"', found + quoted.length + 1);
	if (index < 0) return null;
	let value = "";
	for (index += 1; index < raw.length; index += 1) {
		const char = raw[index];
		if (char === "\\") {
			index += 1;
			const next = raw[index];
			value += next === "n" ? "\n" : next === "t" ? "\t" : (next ?? "");
			continue;
		}
		if (char === '"') break;
		value += char;
	}
	return value;
}

/**
 * The capture's paths are absolute and long; behind a disclosure the
 * project-relative form is the useful one. The root is not guessed — `init`
 * carries the session's cwd, which is the project the agent was standing in.
 */
const rootOf = (events: readonly CaptureEvent[]): string => {
	const cwd = events.find((event) => event.subtype === "init" && typeof event.cwd === "string")?.cwd;
	return cwd === undefined ? "" : `${cwd}/`;
};

const relative = (path: string, root: string): string => (root !== "" && path.startsWith(root) ? path.slice(root.length) : path);

/* ---------- placing the events in time ---------- */

interface Placed {
	readonly at: readonly number[];
	readonly pace: number;
	readonly ttft: readonly number[];
}

function place(events: readonly CaptureEvent[]): Placed {
	const anchor: (number | null)[] = events.map((event) =>
		typeof event.timestamp === "string" ? Date.parse(event.timestamp) : null,
	);
	// a finished sub-agent stamps its own end, and its launch rides the tool result that reports it
	const resultAt = new Map<string, number>();
	events.forEach((event, index) => {
		if (event.type !== "user") return;
		for (const block of blocksOf(event)) if (block.type === "tool_result") resultAt.set(block.tool_use_id ?? "", index);
	});
	events.forEach((event, index) => {
		if (event.subtype === "task_updated" && typeof event.patch?.end_time === "number")
			anchor[index] = event.patch.end_time;
		if (event.subtype === "task_started") {
			const landed = anchor[resultAt.get(event.tool_use_id ?? "") ?? -1];
			if (landed !== undefined && landed !== null) anchor[index] = landed;
		}
	});
	events.forEach((event, index) => {
		if (event.subtype !== "task_notification") return;
		for (let back = index - 1; back >= 0; back -= 1) {
			if (events[back]?.subtype === "task_updated" && anchor[back] !== null) {
				anchor[index] = anchor[back];
				return;
			}
		}
	});

	// runs of unplaced events, cut wherever a new request is raised
	const runs: { from: number; to: number }[] = [];
	let open = -1;
	for (let index = 0; index <= events.length; index += 1) {
		const event = events[index];
		const cut = event === undefined || anchor[index] !== null || isRequest(event);
		if (cut) {
			if (open >= 0 && index > open) runs.push({ from: open, to: index - 1 });
			open = event !== undefined && anchor[index] === null ? index : -1;
		} else if (open < 0) open = index;
	}

	// the capture's own stream pace, from the runs whose surrounding gap explains them
	const samples: number[] = [];
	for (const run of runs) {
		const before = anchor[run.from - 1];
		const after = anchor[run.to + 1];
		if (before === undefined || before === null || after === undefined || after === null) continue;
		const gap = after - before;
		if (gap <= 3000) samples.push(gap / (run.to - run.from + 2));
	}
	samples.sort((a, b) => a - b);
	const pace = Math.round(samples[samples.length >> 1] ?? 100);

	const at = anchor.slice();
	for (const run of runs) {
		const before = run.from > 0 ? at[run.from - 1] : null;
		let ahead = run.to + 1;
		while (ahead < events.length && at[ahead] === null) ahead += 1;
		const after = ahead < events.length ? at[ahead] : null;
		const count = run.to - run.from + 1;
		let start = -1;
		let request = -1;
		for (let index = run.from; index <= run.to; index += 1) {
			const event = events[index] as CaptureEvent;
			if (wireOf(event)?.type === "message_start") start = index;
			if (isRequest(event)) request = index;
		}
		const ttft = start >= 0 ? (events[start]?.ttft_ms ?? null) : null;
		const fresh = start >= 0 || request >= 0;
		const explains = (ttft ?? 0) + (count - (ttft === null ? 0 : 1)) * pace;
		const gap = before !== null && after !== null ? after - before : null;
		const forward = before !== null && (!fresh || gap === null || gap <= explains * 2.5);
		if (forward) {
			const step = after === null ? pace : Math.min(pace, (after - before) / (count + 1));
			let cursor = before;
			for (let index = run.from; index <= run.to; index += 1) {
				const event = events[index] as CaptureEvent;
				if (index === start && ttft !== null) cursor = (request >= 0 ? (at[request] as number) : cursor) + ttft;
				else if (isRequest(event)) cursor = before;
				else cursor += step;
				at[index] = after === null ? cursor : Math.min(cursor, after);
			}
		} else {
			let cursor = after as number;
			for (let index = run.to; index >= run.from; index -= 1) at[index] = (cursor -= pace);
			if (start >= 0 && ttft !== null && request >= 0)
				at[request] = Math.max(before ?? 0, (at[start] as number) - ttft);
		}
		// a message whose request was raised in an earlier run still owes it the ttft
		if (start >= 0 && ttft !== null && request < 0) {
			for (let back = start - 1; back >= 0; back -= 1) {
				if (!isRequest(events[back] as CaptureEvent)) continue;
				const raised = at[back];
				if (raised !== null && raised !== undefined) at[start] = Math.max(at[start] as number, raised + ttft);
				break;
			}
		}
	}

	return {
		at: at.map((value) => value ?? 0),
		pace,
		ttft: events.flatMap((event) => (typeof event.ttft_ms === "number" ? [event.ttft_ms] : [])),
	};
}

/* ---------- thinking ----------
 * A thought is measured from the block opening to the message that carries it.
 * Two of this capture's thoughts never get that message: one runs while a
 * sub-agent works and is only ever sampled, the other is where the capture was
 * cut off. Both still report estimated tokens, so a thought lasts at least what
 * its tokens come to at the pace of the thoughts that did finish. */

interface Thought {
	readonly at: number;
	readonly ms: number;
}

function thoughts(events: readonly CaptureEvent[], at: readonly number[]): Map<number, Thought> {
	interface Live {
		readonly index: number;
		readonly at: number;
		tokens: number;
		last: number;
	}
	const raw: { key: number; at: number; observed: number; tokens: number; whole: boolean }[] = [];
	let live: Live | null = null;
	const shut = (ended: number, whole: boolean) => {
		if (live === null) return;
		raw.push({ key: live.index, at: live.at, observed: Math.max(0, ended - live.at), tokens: live.tokens, whole });
		live = null;
	};
	events.forEach((event, index) => {
		const now = at[index] as number;
		const wire = wireOf(event);
		if (wire?.type === "content_block_start") {
			if (live !== null) shut(live.last, false);
			if (wire.content_block?.type === "thinking") live = { index, at: now, tokens: 0, last: now };
			return;
		}
		if (wire?.type === "content_block_delta" && live !== null) {
			if (wire.delta?.type === "thinking_delta") live.tokens += wire.delta.estimated_tokens ?? 0;
			live.last = now;
			return;
		}
		if (isRequest(event) && live !== null) shut(live.last, false);
		if (event.type === "assistant" && fromParent(event) && blocksOf(event).some((block) => block.type === "thinking"))
			shut(now, true);
	});
	if (live !== null) shut(live.last, false);

	const whole = raw.filter((thought) => thought.whole && thought.observed > 0);
	const tokens = whole.reduce((sum, thought) => sum + thought.tokens, 0);
	const spent = whole.reduce((sum, thought) => sum + thought.observed, 0);
	const rate = tokens > 0 && spent > 0 ? tokens / spent : 0.03;
	return new Map(raw.map((thought) => [thought.key, { at: thought.at, ms: Math.max(thought.observed, thought.tokens / rate) }]));
}

/* ---------- compressing the timeline ----------
 * Real minutes have to become a watchable turn, and the fixture's own numbers are
 * the point, so nothing is replaced with a round one. Every interval between two
 * beats is divided by the same factor up to a gate, and only the part beyond the
 * gate is collapsed further — by one factor, so long waits stay in proportion to
 * each other and the uneven ones stay uneven. The gate sits just above its
 * capture's slowest time to first token, so every wait the fixture actually
 * measured plays at the same rate as the work; it is the elisions and the minutes
 * spent waiting on a sub-agent that get squeezed.
 *
 * The two captures need different numbers because they are shaped differently.
 * The linear turn is thirteen minutes of mostly-idle stream with a few long
 * elisions. The fan-out is under seven, but three sub-agents fill it with beats,
 * so the same fast factor would leave it a minute and a half long. */

const squeezeBy =
	(gate: number, fast: number, slow: number) =>
	(span: number): number =>
		span <= gate ? span / fast : gate / fast + (span - gate) / slow;

const squeeze = squeezeBy(3000, 2.4, 120);

/* the fan-out's own: gate above its slowest ttft (3625ms), and both factors
 * raised because three agents beat far more often than one */
const squeezeFanout = squeezeBy(3700, 9, 34);

/**
 * The shown timeline: one squeeze rule between every pair of beats, and the cue
 * list that comes out of it. Both projections build their cues through this, so
 * a row resolving in the rail and a frame landing on the canvas can be the same
 * instant rather than two guesses.
 */
function timeline(marks: ReadonlySet<number>, origin: number, rule: (span: number) => number) {
	const shown = new Map<number, number>();
	let carried = 0;
	let previous = origin;
	for (const beat of [...marks].sort((a, b) => a - b)) {
		carried += rule(beat - previous);
		previous = beat;
		shown.set(beat, Math.round(carried));
	}
	const cues: Cue[] = [];
	const shownAt = (value: number): number => shown.get(value) ?? 0;
	return {
		cues,
		shownAt,
		cue: (key: string, value: number): string => {
			cues.push({ name: key, at: shownAt(value) });
			return key;
		},
	};
}

type Timeline = ReturnType<typeof timeline>;

/* ---------- the script ---------- */

export type Slice = "plan" | "verify";

export interface ScriptChild {
	readonly key: string;
	readonly cue: string;
	/** the settled phrasing the agent supplied */
	readonly text: string;
	/** the present-participle phrasing the agent supplied for while it runs */
	readonly running: string | null;
	readonly runCue: string | null;
	readonly doneCue: string | null;
	readonly arrives: RowState;
}

export interface ToolRow {
	readonly kind: "tool";
	readonly key: string;
	readonly cue: string;
	readonly verb: string;
	readonly subject: string;
	readonly subjectCue: string | null;
	readonly doneCue: string | null;
	readonly detail: string | null;
	readonly shot: ShotRef | null;
	readonly children: readonly ScriptChild[];
	readonly openCue: string | null;
	/** the subject counts its children in, because a plan's size is not known until it is written */
	readonly counts: boolean;
	/**
	 * A delegated task's live step. task_progress is a snapshot rather than a log
	 * entry, so the row holds the step it is on and drops it the moment the task
	 * lands — one line that changes, never a growing list.
	 */
	readonly steps: readonly { readonly cue: string; readonly text: string }[];
}

export interface ThinkRow {
	readonly kind: "think";
	readonly key: string;
	readonly cue: string;
	readonly doneCue: string;
	readonly realMs: number;
	readonly shownAt: number;
	readonly shownMs: number;
}

export interface ProseRow {
	readonly kind: "prose";
	readonly key: string;
	readonly cue: string;
	readonly text: string;
	readonly chunks: readonly { readonly cue: string; readonly upto: number }[];
}

export type ScriptRow = ToolRow | ThinkRow | ProseRow;

export interface Script {
	readonly cues: readonly Cue[];
	readonly rows: readonly ScriptRow[];
	readonly total: number;
}

const EMPTY: Script = { cues: [], rows: [], total: 0 };

/**
 * A frame a sub-agent wrote, and everything the capture knows about it after
 * that. Four separate moments, because they are four separate moments in the
 * capture and the invented version collapsed them into one.
 */
export interface Take {
	readonly name: string;
	/** its frame.tsx first being written; the geometry sidecar written before it makes a folder, not a frame */
	readonly arriveCue: string;
	/** the frame's own `spool shot` coming back: the document booted, so it can paint */
	readonly paintCue: string | null;
	/** every later write of the same file — arriving is not finishing */
	readonly changeCues: readonly string[];
	/** the task that owns it reporting completed, which two of these three never do */
	readonly doneCue: string | null;
}

export interface FanoutScript extends Script {
	/** in name order, which is the canvas order; the cues say who got there first */
	readonly takes: readonly Take[];
}

const EMPTY_FANOUT: FanoutScript = { ...EMPTY, takes: [] };

/**
 * A tool row's verb and subject, in spool's nouns rather than the filesystem's.
 * `spool shot home` is already a spool verb and a frame name, so the row is that
 * and nothing else. Everything else falls back to the agent's own words for what
 * it is doing, because the capture supplies those and inventing friendlier ones
 * would be putting words in its mouth.
 */
function label(tool: string, input: string | undefined): { verb: string; subject: string } {
	if (tool === "Bash") {
		const command = field(input, "command") ?? "";
		// a compound command is several calls and it ends on its point, so the last spool
		// verb in it is the one worth a row: `spool status; ...; spool shot cart` went to look at cart
		const last = command.split(/\s*(?:&&|\|\||[;|])\s*/).filter((part) => /^spool\s/.test(part)).at(-1);
		const spool = last === undefined ? null : /^spool\s+(\w+)\s*(.*)$/.exec(last);
		if (spool !== null) return { verb: spool[1] ?? "run", subject: (spool[2] ?? "").split(/\s*\d*>/)[0]?.trim() ?? "" };
		return { verb: "run", subject: field(input, "description") ?? "" };
	}
	if (tool === "Read" || tool === "Write") {
		const leaf = (field(input, "file_path") ?? "").split("/").pop() ?? "";
		if (tool === "Write") return { verb: "write", subject: leaf };
		return { verb: /\.(?:png|jpe?g|webp|gif|svg)$/i.test(leaf) ? "look" : "read", subject: leaf };
	}
	if (tool === "Agent") return { verb: "delegate", subject: field(input, "description") ?? "" };
	return { verb: tool.toLowerCase(), subject: "" };
}

interface Streamed {
	readonly index: number;
	readonly at: number;
	tool: string | null;
	claimed: boolean;
	fragments: { at: number; text: string }[];
}

interface ChildDraft {
	text: string;
	running: string | null;
	at: number;
	runAt: number | null;
	doneAt: number | null;
	arrives: RowState;
}

interface ToolDraft {
	kind: "tool";
	at: number;
	verb: string;
	subject: string;
	subjectAt: number | null;
	doneAt: number | null;
	detail: string | null;
	shot: ShotRef | null;
	children: ChildDraft[];
	steps: { at: number; text: string }[];
	openAt: number | null;
	counts: boolean;
	block: Streamed | null;
	id: string | null;
}

type Draft =
	| ToolDraft
	| { kind: "think"; at: number; ended: number; ms: number }
	| { kind: "prose"; at: number; text: string; chunks: { at: number; upto: number }[] };

/** an empty tool row, so the two projections open one the same way */
function toolDraft(at: number, verb: string, subject: string): ToolDraft {
	return {
		kind: "tool",
		at,
		verb,
		subject,
		subjectAt: null,
		doneAt: null,
		detail: null,
		shot: null,
		children: [],
		steps: [],
		openAt: null,
		counts: false,
		block: null,
		id: null,
	};
}

/** the streamed block a whole tool_use message is the completion of */
function claim(streamed: Map<number, Streamed>, tool: string | undefined): Streamed | null {
	const found =
		[...streamed.values()].find((candidate) => !candidate.claimed && (candidate.tool === null || candidate.tool === tool)) ??
		null;
	if (found !== null) found.claimed = true;
	return found;
}

/** the fragment that first carries the subject, or the last one when the capture elided it */
function lands(block: Streamed | null, subject: string): number | null {
	if (block === null) return null;
	let carried = "";
	for (const fragment of block.fragments) {
		carried += fragment.text;
		if (subject !== "" && carried.includes(subject)) return fragment.at;
	}
	return block.fragments.at(-1)?.at ?? null;
}

/** the drafts, in the order they opened, as the rows the rail reads */
function emitRows(drafts: readonly Draft[], shown: Timeline): ScriptRow[] {
	const rows: ScriptRow[] = [];
	const { cue, shownAt } = shown;
	drafts
		.map((draft, order) => ({ draft, order }))
		.sort((a, b) => a.draft.at - b.draft.at || a.order - b.order)
		.forEach(({ draft }, order) => {
			const key = `r${order}`;
			if (draft.kind === "think") {
				rows.push({
					kind: "think",
					key,
					cue: cue(key, draft.at),
					doneCue: cue(`${key}:d`, draft.ended),
					realMs: Math.round(draft.ms),
					shownAt: shownAt(draft.at),
					shownMs: Math.max(1, shownAt(draft.ended) - shownAt(draft.at)),
				});
				return;
			}
			if (draft.kind === "prose") {
				rows.push({
					kind: "prose",
					key,
					cue: cue(key, draft.at),
					text: draft.text,
					chunks: draft.chunks.map((chunk, part) => ({ cue: cue(`${key}:p${part}`, chunk.at), upto: chunk.upto })),
				});
				return;
			}
			rows.push({
				kind: "tool",
				key,
				cue: cue(key, draft.at),
				verb: draft.verb,
				subject: draft.subject,
				subjectCue: draft.subjectAt === null ? null : cue(`${key}:s`, draft.subjectAt),
				doneCue: draft.doneAt === null ? null : cue(`${key}:d`, draft.doneAt),
				detail: draft.detail,
				shot: draft.shot,
				openCue: draft.openAt === null ? null : cue(`${key}:o`, draft.openAt),
				counts: draft.counts,
				steps: draft.steps.map((step, part) => ({ cue: cue(`${key}:t${part}`, step.at), text: step.text })),
				children: draft.children
					.filter((child) => child.at > 0)
					.map((child, part) => ({
						key: `${key}:c${part}`,
						cue: cue(`${key}:c${part}`, child.at),
						text: child.text,
						running: child.running,
						runCue: child.runAt === null ? null : cue(`${key}:c${part}:r`, child.runAt),
						doneCue: child.doneAt === null ? null : cue(`${key}:c${part}:d`, child.doneAt),
						arrives: child.arrives,
					})),
			});
		});
	return rows;
}

export function projectTurn(events: readonly CaptureEvent[], slice: Slice): Script {
	if (events.length === 0) return EMPTY;
	const { at, pace, ttft } = place(events);
	const thought = thoughts(events, at);

	/* landmarks, so a slice is named by what happens in it rather than by an index */
	const firstText = events.findIndex(
		(event) => event.type === "assistant" && fromParent(event) && blocksOf(event).some((block) => block.type === "text"),
	);
	const shot = events.findIndex(
		(event) =>
			event.type === "assistant" &&
			blocksOf(event).some(
				(block) => block.type === "tool_use" && (field(block.input, "command") ?? "").startsWith("spool shot"),
			),
	);
	const request = (index: number): number => {
		for (let back = index; back >= 0; back -= 1) if (isRequest(events[back] as CaptureEvent)) return back;
		return 0;
	};
	const bounds: Record<Slice, readonly [number, number]> = {
		plan: [0, firstText],
		verify: [request(shot), events.length - 1],
	};
	const [from, to] = bounds[slice];
	if (from < 0 || to < 0 || from > to) return EMPTY;

	const root = rootOf(events);
	const marks = new Set<number>();
	const mark = (value: number): number => {
		marks.add(value);
		return value;
	};

	const drafts: Draft[] = [];
	const streamed = new Map<number, Streamed>();
	let plan: ToolDraft | null = null;
	let prose: Extract<Draft, { kind: "prose" }> | null = null;

	for (let index = from; index <= to; index += 1) {
		const event = events[index] as CaptureEvent;
		const now = at[index] as number;
		const wire = wireOf(event);

		// the wait is a beat of its own: the request goes up, the first token comes back
		if (isRequest(event) || wire?.type === "message_start") mark(now);

		if (wire?.type === "content_block_start") {
			const kind = wire.content_block?.type ?? "";
			if (kind === "tool_use")
				streamed.set(wire.index ?? 0, {
					index: wire.index ?? 0,
					at: now,
					tool: wire.content_block?.name ?? null,
					claimed: false,
					fragments: [],
				});
			if (kind === "thinking") {
				const measured = thought.get(index);
				// the thought's end is a beat of its own, so whatever happens inside it
				// still divides the time the clock has to climb through
				if (measured !== undefined)
					drafts.push({ kind: "think", at: mark(measured.at), ended: mark(measured.at + measured.ms), ms: measured.ms });
			}
			if (kind === "text") {
				prose = { kind: "prose", at: mark(now), text: "", chunks: [] };
				drafts.push(prose);
			}
			continue;
		}

		if (wire?.type === "content_block_delta") {
			const slot = wire.index ?? 0;
			if (wire.delta?.type === "input_json_delta") {
				// the capture can open mid-block, so a fragment with no start of its own opens one
				const block =
					streamed.get(slot) ??
					(() => {
						const made: Streamed = { index: slot, at: now - pace, tool: null, claimed: false, fragments: [] };
						streamed.set(slot, made);
						return made;
					})();
				block.fragments.push({ at: now, text: wire.delta.partial_json ?? "" });
			}
			if (wire.delta?.type === "text_delta" && prose !== null) {
				prose.text += wire.delta.text ?? "";
				prose.chunks.push({ at: mark(now), upto: prose.text.length });
			}
			continue;
		}

		if (event.type === "assistant" && fromParent(event)) {
			for (const block of blocksOf(event)) {
				if (block.type === "text") prose = null;
				if (block.type !== "tool_use") continue;
				const claimed = claim(streamed, block.name);
				if (block.name === "TaskCreate") {
					// seven creates in a row are one plan, not seven rows: the tool call is
					// ceremony, the list is the object, and it outlives the turn that wrote it
					if (plan === null) {
						plan = toolDraft(mark(claimed?.at ?? now - pace), "plan", "");
						plan.counts = true;
						drafts.push(plan);
					}
					plan.children.push({
						text: field(block.input, "subject") ?? "",
						running: field(block.input, "activeForm"),
						at: 0,
						runAt: null,
						doneAt: null,
						arrives: "pending",
					});
					continue;
				}
				const named = label(block.name ?? "", block.input);
				const path = field(block.input, "file_path");
				const draft = toolDraft(mark(claimed?.at ?? now - pace), named.verb, named.subject);
				draft.detail =
					block.name === "Bash" ? (field(block.input, "command") ?? null) : path === null ? null : relative(path, root);
				draft.block = claimed;
				draft.id = block.id ?? null;
				const landed = lands(claimed, named.subject);
				if (landed !== null) draft.subjectAt = mark(landed);
				drafts.push(draft);
			}
			continue;
		}

		if (event.type === "user" && fromParent(event)) {
			for (const block of blocksOf(event)) {
				if (block.type !== "tool_result") continue;
				const text = typeof block.content === "string" ? block.content : "";
				if (plan !== null && /^Task #\d+/.test(text)) {
					const waiting = plan.children.find((child) => child.at === 0);
					if (waiting !== undefined) waiting.at = mark(now);
					plan.openAt ??= waiting?.at ?? null;
					plan.doneAt = mark(now);
					continue;
				}
				const owner =
					drafts.find(
						(draft): draft is ToolDraft => draft.kind === "tool" && draft.id !== null && draft.id === block.tool_use_id,
					) ?? null;
				if (owner === null) continue;
				const picture = Array.isArray(block.content)
					? block.content.find((part) => part.type === "image")
					: undefined;
				if (picture !== undefined) {
					// the agent read a shot of its own frame back; the payload is elided, the moment is not
					owner.shot = { path: owner.detail ?? "", media: picture.source?.media_type ?? "image" };
					owner.openAt = mark(now);
				}
				owner.doneAt = mark(now);
			}
			continue;
		}
	}

	// the plan turn's own message_start is before the capture opens, so its wait is the capture's median
	const median = [...ttft].sort((a, b) => a - b)[ttft.length >> 1] ?? 0;
	const first = [...marks].sort((a, b) => a - b)[0] ?? 0;
	const shown = timeline(marks, first - (slice === "plan" ? median : 0), squeeze);
	const rows = emitRows(drafts, shown);
	return { cues: shown.cues, rows, total: shown.cues.reduce((last, entry) => Math.max(last, entry.at), 0) };
}

/** the projection, memoised against the capture so useTurn's cue array stays stable */
export function useTurnScript(events: readonly CaptureEvent[] | undefined, slice: Slice): Script {
	return useMemo(() => (events === undefined ? EMPTY : projectTurn(events, slice)), [events, slice]);
}

/* ---------- the fan-out ----------
 * claude-fanout.json is the capture the canvas was waiting for. The first one's
 * sub-agent wrote a document, so nothing ever landed out there and the arrival
 * mechanic had no data behind it. This one fans out: three sub-agents, all
 * `subagent_type: "designer"`, authoring three real variants of one frame at the
 * same time in a project with real `cart` and `menu` frames.
 *
 * Four things it settles that a hand-written version had wrong:
 *
 *   concurrency is not a sequence. Three tasks run at once and their
 *   task_progress events interleave in the stream, sixty-seven of them, so there
 *   are three live rows and each carries its own step.
 *
 *   arrival is uneven, and out of order. The three frame.tsx files are first
 *   written at 20:42:35, 20:45:40 and 20:46:43 — `--c` before `--b`, over four
 *   minutes of stagger, no two gaps alike. Whoever finishes first arrives first;
 *   nothing here is sorted, and the middle column sits empty for a while.
 *
 *   arriving is not finishing. Every designer writes its frame, shoots it, reads
 *   the PNG back and then keeps editing. `cart--empty` is written once and
 *   rewritten four more times while it is already on the canvas, so the canvas
 *   re-renders under the human — which is what spool really does when a source
 *   file changes.
 *
 *   and two of the three never report. One task_updated lands inside the window,
 *   so the turn ends with one row checked, two still turning, and the last frame
 *   still an empty socket four seconds after it appeared. That is the honest end
 *   of a fan-out, not a tidy one.
 *
 * Deliberately unrendered though the fixture carries them: `init`, `result`,
 * `rate_limit_event`, `background_tasks_changed`, the per-task token counts and
 * durations on every task_progress, and the finished task's own written report —
 * one of three agents reporting would make the other two look silent when they
 * are only unfinished.
 */

/** a progress line held for less than this in shown time would be a flicker, not a step */
const STEP_HOLD = 900;

interface TakeDraft {
	name: string;
	arriveAt: number;
	paintAt: number | null;
	changeAts: number[];
	task: string | null;
}

/**
 * What landed on the canvas.
 *
 * Which file a Write touched cannot be read off the write itself: the capture
 * elides every tool input at 160 characters and these paths are longer than
 * that, so `frame.json` and `frame.tsx` truncate to the same string. The
 * runtime's own progress line is where the whole path survives — `Writing
 * design/frames/cart--empty/frame.tsx` — so that is what the canvas is read
 * from. It follows the write it describes immediately, which is how a failed
 * edit is told from a real one: the tool_result on the write just before it says
 * `<tool_use_error>` and the file did not change, so nothing re-renders.
 *
 * Every write in this window is a delegate's. A frame the parent wrote itself
 * would have no progress line and would need its own reading.
 */
function landings(events: readonly CaptureEvent[], at: readonly number[], mark: (value: number) => number) {
	const broken = new Set<string>();
	const shots = new Map<string, string>();
	for (const event of events) {
		for (const block of blocksOf(event)) {
			if (block.type === "tool_result" && typeof block.content === "string" && block.content.startsWith("<tool_use_error>"))
				broken.add(block.tool_use_id ?? "");
			if (block.type !== "tool_use" || block.name !== "Bash") continue;
			const target = /(?:^|[;&|]\s*)spool\s+shot\s+([\w-]+)/.exec(field(block.input, "command") ?? "");
			if (target !== null) shots.set(block.id ?? "", target[1] ?? "");
		}
	}

	const takes = new Map<string, TakeDraft>();
	const pending = new Map<string, string>();
	events.forEach((event, index) => {
		const now = at[index] as number;
		const task = event.parent_tool_use_id ?? event.tool_use_id ?? "";
		for (const block of blocksOf(event)) {
			if (block.type === "tool_use" && (block.name === "Write" || block.name === "Edit")) pending.set(task, block.id ?? "");
			if (block.type !== "tool_result") continue;
			// a shot coming back is the capture's evidence that the document booted
			const shot = takes.get(shots.get(block.tool_use_id ?? "") ?? "");
			if (shot !== undefined && shot.paintAt === null && now >= shot.arriveAt) shot.paintAt = mark(now);
		}
		if (event.subtype !== "task_progress") return;
		const wrote = /^(?:Writing|Editing) design\/frames\/(.+)\/frame\.tsx$/.exec(event.description ?? "");
		if (wrote === null || broken.has(pending.get(task) ?? "")) return;
		const name = wrote[1] ?? "";
		const known = takes.get(name);
		if (known === undefined) takes.set(name, { name, arriveAt: mark(now), paintAt: null, changeAts: [], task });
		else known.changeAts.push(mark(now));
	});
	return [...takes.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function projectFanout(events: readonly CaptureEvent[]): FanoutScript {
	if (events.length === 0) return EMPTY_FANOUT;
	const { at, pace, ttft } = place(events);
	const thought = thoughts(events, at);
	const root = rootOf(events);

	const marks = new Set<number>();
	const mark = (value: number): number => {
		marks.add(value);
		return value;
	};

	const takes = landings(events, at, mark);
	const drafts: Draft[] = [];
	const streamed = new Map<number, Streamed>();
	/** the delegate rows, by the tool_use_id their task answers to */
	const tasks = new Map<string, ToolDraft>();
	/** task_updated arrives with the runtime's task id and nothing else, so task_started ties the two */
	const named = new Map<string, string>();
	let prose: Extract<Draft, { kind: "prose" }> | null = null;
	/** the paragraph the rail shows is a window on the whole block, not the whole of it */
	let whole = "";

	for (let index = 0; index < events.length; index += 1) {
		const event = events[index] as CaptureEvent;
		const now = at[index] as number;
		const wire = wireOf(event);

		if (isRequest(event) || wire?.type === "message_start") mark(now);

		if (wire?.type === "content_block_start") {
			const kind = wire.content_block?.type ?? "";
			if (kind === "tool_use")
				streamed.set(wire.index ?? 0, {
					index: wire.index ?? 0,
					at: now,
					tool: wire.content_block?.name ?? null,
					claimed: false,
					fragments: [],
				});
			if (kind === "thinking") {
				const measured = thought.get(index);
				if (measured !== undefined)
					drafts.push({ kind: "think", at: mark(measured.at), ended: mark(measured.at + measured.ms), ms: measured.ms });
			}
			if (kind === "text") {
				prose = { kind: "prose", at: mark(now), text: "", chunks: [] };
				whole = "";
				drafts.push(prose);
			}
			continue;
		}

		if (wire?.type === "content_block_delta") {
			const slot = wire.index ?? 0;
			if (wire.delta?.type === "input_json_delta") {
				// the capture opens mid-block here: the first delegation is already streaming
				const block =
					streamed.get(slot) ??
					(() => {
						const made: Streamed = { index: slot, at: now - pace, tool: null, claimed: false, fragments: [] };
						streamed.set(slot, made);
						return made;
					})();
				block.fragments.push({ at: now, text: wire.delta.partial_json ?? "" });
			}
			if (wire.delta?.type === "text_delta" && prose !== null) {
				// this parent narrates at length — a status table, three paragraphs of brief —
				// and a 420px rail is not where a transcript goes. The rail takes the opening
				// paragraph, which is where the agent says the thing, and stops there.
				whole += wire.delta.text ?? "";
				const stop = whole.indexOf("\n\n");
				const opening = (stop < 0 ? whole : whole.slice(0, stop)).replace(/`/g, "");
				if (opening.length > prose.text.length) {
					prose.text = opening;
					prose.chunks.push({ at: mark(now), upto: opening.length });
				}
			}
			continue;
		}

		if (event.type === "assistant" && fromParent(event)) {
			for (const block of blocksOf(event)) {
				if (block.type === "text") prose = null;
				if (block.type !== "tool_use") continue;
				const claimed = claim(streamed, block.name);
				// the plan this moves a task in was written before the window opens, so a row
				// for it would be bookkeeping with nothing to keep books on
				if (block.name === "TaskUpdate") continue;
				const named = label(block.name ?? "", block.input);
				const path = field(block.input, "file_path");
				const draft = toolDraft(mark(claimed?.at ?? now - pace), named.verb, named.subject);
				draft.detail =
					block.name === "Bash" ? (field(block.input, "command") ?? null) : path === null ? null : relative(path, root);
				draft.block = claimed;
				draft.id = block.id ?? null;
				const landed = lands(claimed, named.subject);
				if (landed !== null) draft.subjectAt = mark(landed);
				drafts.push(draft);
				// three of these, and each one's row is the task rather than the launch
				if (block.name === "Agent" && block.id !== undefined) tasks.set(block.id, draft);
			}
			continue;
		}

		if (event.type === "user" && fromParent(event)) {
			for (const block of blocksOf(event)) {
				if (block.type !== "tool_result") continue;
				const owner =
					drafts.find(
						(draft): draft is ToolDraft => draft.kind === "tool" && draft.id !== null && draft.id === block.tool_use_id,
					) ?? null;
				if (owner === null) continue;
				const picture = Array.isArray(block.content) ? block.content.find((part) => part.type === "image") : undefined;
				if (picture !== undefined) {
					owner.shot = { path: owner.detail ?? "", media: picture.source?.media_type ?? "image" };
					owner.openAt = mark(now);
				}
				// the Agent tool returns the instant the sub-agent is launched, and the task
				// outlives that by minutes, so the row does not settle on its own result
				if (!tasks.has(owner.id ?? "")) owner.doneAt = mark(now);
			}
			continue;
		}

		if (event.subtype === "task_started" && event.task_id !== undefined && event.tool_use_id !== undefined)
			named.set(event.task_id, event.tool_use_id);
		const task = tasks.get(event.tool_use_id ?? named.get(event.task_id ?? "") ?? "");
		if (task === undefined) continue;
		if (event.subtype === "task_started") {
			// the sub-agent is away, so the row opens itself to show what it is on
			task.openAt = mark(now);
			continue;
		}
		if (event.subtype === "task_progress") {
			task.steps.push({ at: mark(now), text: event.description ?? "" });
			continue;
		}
		if (event.subtype === "task_updated" && event.patch?.status === "completed") task.doneAt = mark(now);
	}

	// the first delegation's block opened before the capture did, so the turn's own
	// wait is the capture's median time to first token, as the plan slice's is
	const median = [...ttft].sort((a, b) => a - b)[ttft.length >> 1] ?? 0;
	const first = [...marks].sort((a, b) => a - b)[0] ?? 0;
	const shown = timeline(marks, first - median, squeezeFanout);

	// sixty-seven steps in seven real minutes is a comfortable read; the same
	// sixty-seven inside a compressed turn is a flicker. So a step is dropped when
	// the compression would show it on top of the one before it — never reordered,
	// never reworded, and the one a task is on when it lands is always kept.
	for (const task of tasks.values()) {
		let held = Number.NEGATIVE_INFINITY;
		task.steps = task.steps.filter((step) => {
			if (shown.shownAt(step.at) - held < STEP_HOLD) return false;
			held = shown.shownAt(step.at);
			return true;
		});
	}

	const rows = emitRows(drafts, shown);
	return {
		cues: shown.cues,
		rows,
		takes: takes.map((take) => ({
			name: take.name,
			arriveCue: shown.cue(`${take.name}:in`, take.arriveAt),
			paintCue: take.paintAt === null ? null : shown.cue(`${take.name}:paint`, take.paintAt),
			changeCues: take.changeAts.map((change, part) => shown.cue(`${take.name}:e${part}`, change)),
			doneCue: (() => {
				const owner = take.task === null ? undefined : tasks.get(take.task);
				return owner?.doneAt === undefined || owner.doneAt === null ? null : shown.cue(`${take.name}:done`, owner.doneAt);
			})(),
		})),
		total: shown.cues.reduce((last, entry) => Math.max(last, entry.at), 0),
	};
}

/** the fan-out projection, memoised the same way so the cue array stays stable */
export function useFanoutScript(events: readonly CaptureEvent[] | undefined): FanoutScript {
	return useMemo(() => (events === undefined ? EMPTY_FANOUT : projectFanout(events)), [events]);
}

/* ---------- the transcript ---------- */

function childState(child: ScriptChild, at: (cue: string) => boolean): RowState {
	if (child.doneCue !== null && at(child.doneCue)) return "done";
	if (child.runCue !== null && at(child.runCue)) return "running";
	return child.arrives;
}

/**
 * The rows a turn has got to. One line per tool call, the plan and the
 * delegation's steps behind their own disclosure, prose in the chunks it really
 * arrived in, and a thinking line carrying the duration the capture measured
 * rather than the duration the replay took.
 */
export function railEntries(script: Script, turn: Turn, elapsed: number, context?: string): PlayEntry[] {
	const entries: PlayEntry[] = [];
	if (turn.phase === "idle") return entries;
	entries.push({ key: "user", kind: "user", text: turn.prompt, ...(context === undefined ? {} : { context }) });
	for (const row of script.rows) {
		if (!turn.at(row.cue)) continue;
		if (row.kind === "think") {
			const done = turn.at(row.doneCue);
			const part = Math.max(0, Math.min(1, (elapsed - row.shownAt) / row.shownMs));
			entries.push({
				key: row.key,
				kind: "line",
				quiet: true,
				state: done ? "done" : "running",
				verb: "thinking",
				subject: duration(done ? row.realMs : row.realMs * part),
			});
			continue;
		}
		if (row.kind === "prose") {
			const upto = row.chunks.reduce((seen, chunk) => (turn.at(chunk.cue) ? chunk.upto : seen), 0);
			entries.push({ key: row.key, kind: "prose", full: row.text, shown: row.text.slice(0, upto) });
			continue;
		}
		const children: RowChild[] = row.children
			.filter((child) => turn.at(child.cue))
			.map((child) => {
				const state = childState(child, turn.at);
				return {
					id: child.cue,
					name: state === "running" && child.running !== null ? child.running : child.text,
					state,
				};
			});
		const counted = `${children.length} task${children.length === 1 ? "" : "s"}`;
		const shows = row.counts ? children.length > 0 : row.subjectCue === null || turn.at(row.subjectCue);
		const settled = row.doneCue !== null && turn.at(row.doneCue);
		// a delegate's step is where it is, not where it has been, and once it lands
		// there is nothing more to say: the frame it wrote is out on the canvas
		const step = settled ? null : row.steps.reduce<string | null>((seen, on) => (turn.at(on.cue) ? on.text : seen), null);
		const detail = step ?? row.detail;
		entries.push({
			key: row.key,
			kind: "line",
			state: settled ? "done" : "running",
			verb: row.verb,
			...(shows ? { subject: row.counts ? counted : row.subject } : {}),
			...(detail === null ? {} : { detail }),
			...(row.shot === null ? {} : { shot: row.shot }),
			...(children.length > 0 ? { children } : {}),
			...(row.openCue !== null && turn.at(row.openCue) ? { open: true } : {}),
		});
	}
	return entries;
}
