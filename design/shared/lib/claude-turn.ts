import { useEffect, useMemo, useState } from "react";
import { drawnBy } from "shared/lib/say-pace";
import {
	type AskOption,
	type Connector,
	type Cue,
	duration,
	type Foreign,
	type Plan,
	type PlayEntry,
	type Question,
	type RowChild,
	type RowState,
	type ShotRef,
	type Turn,
} from "shared/lib/turn-play";

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

/** a tool's arguments, as an object on the wire and as text in the older fixtures */
type ToolInput = string | Readonly<Record<string, unknown>> | undefined;

interface Block {
	readonly type: string;
	readonly name?: string;
	readonly id?: string;
	readonly text?: string;
	readonly input?: string | Readonly<Record<string, unknown>>;
	readonly tool_use_id?: string;
	readonly source?: { readonly media_type?: string };
	readonly content?: string | readonly Block[];
	/** the call came back a failure: the server refused it, errored, or never ran it */
	readonly is_error?: boolean;
	/** how `ToolSearch` answers — a deferred tool it has now loaded, by wire name */
	readonly tool_name?: string;
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
	/**
	 * What the binary calls a tool that is not its own, per call (#142). Rides on the
	 * same `assistant` event as the `tool_use` block and is keyed by that block's id,
	 * so a call is foreign exactly when it has an entry here.
	 */
	readonly tool_use_meta?: readonly {
		readonly id: string;
		readonly display_name?: string;
		readonly server_display_name?: string;
		readonly icon_url?: string;
	}[];
	/**
	 * Why a result carries no execution. `permission-rule` means a rule refused the
	 * call and the server was never asked, which is a different fact from the server
	 * failing and is the one the developer caused.
	 */
	readonly tool_result_meta?: readonly { readonly id: string; readonly non_execution_kind?: string }[];
	/** a control command's answer; `mcp_status` is the only one this projection reads */
	readonly response?: {
		readonly response?: {
			readonly mcpServers?: readonly { readonly name: string; readonly status: string; readonly error?: string }[];
		};
	};
	/** what `init` thought the estate was, which #141 measured is racy and not the inventory */
	readonly mcp_servers?: readonly { readonly name: string; readonly status: string }[];
}

/**
 * The mock answers relative URLs out of shared/fixtures, so the capture is one
 * fetch away. The captures themselves are tracked at the repo's own
 * fixtures/captures/ and mirrored into shared/fixtures/captures/ by the checkout
 * entry, because the shipped test suite reads the same bytes this plays and must
 * not reach into the canvas for them. Their provenance is the README there.
 */
export function useCapture(name: string): readonly CaptureEvent[] | undefined {
	const [events, setEvents] = useState<readonly CaptureEvent[] | undefined>(undefined);
	useEffect(() => {
		let live = true;
		void fetch(`/api/captures/${name}`)
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
 *
 * A tool_use carries its input either way. On the wire it is an object, and the
 * two older fixtures hold it serialised because their splice serialised it — so
 * this takes both rather than making a third fixture pretend to be the first two.
 */
function field(raw: ToolInput, key: string): string | null {
	if (raw === undefined) return null;
	if (typeof raw !== "string") {
		const value = raw[key];
		return typeof value === "string" ? value : value === undefined ? null : JSON.stringify(value);
	}
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

/**
 * `plan` and `verify` are the two ends of claude-turn.json. `session` is the
 * whole of claude-plan.json — the same nine minutes with the middle left in,
 * which is the only window in the repo where a plan is written, worked and
 * ticked off rather than written and abandoned.
 */
export type Slice = "plan" | "verify" | "session" | "mcp" | "ask" | "say" | "stop";

/**
 * How much of a repeated act one row holds.
 *
 * Measured across both parent captures: 51 writes make 29 runs, and every run
 * longer than one call is a run of writes to a single frame — no run in either
 * capture ever spans two files, because the agent does not interleave. What ends
 * a run is not time. Within-run gaps reach 15.2s and the shortest gap between
 * two runs is 17.5s, so no threshold separates them; what actually sits in every
 * one of those gaps is the agent going and looking at what it just changed.
 *
 *   none  every call is a row, which is what the rail does today
 *   run   consecutive writes to one frame are one row, closed by the next row
 *   pass  the run swallows the `spool shot` and the look that close it, so one
 *         row is one make-it-and-look-at-it loop and the picture is its payload
 */
export type Collapse = "none" | "run" | "pass";

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
	/**
	 * The frame the subject names, or null when the subject is a file that is not one
	 * (#143). A run carries the frame all its calls touched, which is well defined
	 * because #135 measured that a run never spans two files.
	 */
	readonly frame: string | null;
	readonly subjectCue: string | null;
	readonly doneCue: string | null;
	/** the call the server was never asked to make, or made and failed (#142) */
	readonly failed: boolean;
	/** set when the tool belongs to a server that is not spool's, with every name the binary gave it */
	readonly foreign: Foreign | null;
	/**
	 * The row is the binary loading its own tools rather than work on the project.
	 *
	 * MCP tools are deferred — `init.tools` offers zero `mcp__*` entries against
	 * 58,732 tokens of them held back — so every foreign call is a two-step: a
	 * `ToolSearch` for the tool, then the tool. Whether that first step is a row is
	 * #142's second question, so the projection carries it either way and marks it.
	 */
	readonly finds: boolean;
	readonly detail: string | null;
	readonly shot: ShotRef | null;
	readonly children: readonly ScriptChild[];
	readonly openCue: string | null;
	/** the subject counts its children in, because a plan's size is not known until it is written */
	readonly counts: boolean;
	/**
	 * Several writes to one frame, drawn as one row that counts them.
	 *
	 * Same machinery as the plan — a child per call, so the count climbs off the
	 * capture's own cues rather than arriving whole — but the children are never
	 * listed. There is nothing to list: they are the same verb on the same frame,
	 * and the count is the entire difference between them.
	 */
	readonly runs: boolean;
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
	/**
	 * Every delta, as the cue that fires it and the moment it lands.
	 *
	 * `at` is redundant with the cue's own time and is carried anyway, because #149's pace
	 * needs the *spacing* between deltas rather than the fact that one has fired: the drain
	 * reads how far behind the edge is, which is arithmetic over arrival times. The cue
	 * survives alongside it so a held turn still gates the row (#145) — a parked clock must
	 * not drain prose it has not reached.
	 */
	readonly chunks: readonly { readonly cue: string; readonly at: number; readonly upto: number }[];
}

/**
 * The one row that is a question rather than a receipt (#145).
 *
 * Four beats, all of them measured: the block opens, the question's own sentence
 * arrives, the options arrive, and it resolves. The third and fourth are separate
 * because they are 84ms apart in the capture and would be minutes apart in front
 * of a person — that gap is the whole of the state this row exists to draw.
 */
export interface AskRow {
	readonly kind: "ask";
	readonly key: string;
	readonly cue: string;
	readonly ask: Question;
	/** the fragment that first carried the question's own sentence */
	readonly saidCue: string | null;
	/** the fragment that completed the option list, so there is something to press */
	readonly liveCue: string | null;
	readonly doneCue: string | null;
	/** nobody answered, and the binary said so */
	readonly dropped: boolean;
	/** the window the sentence types itself in over, on the replay's clock */
	readonly shownFrom: number;
	readonly shownFor: number;
}

export type ScriptRow = ToolRow | ThinkRow | ProseRow | AskRow;

export interface Script {
	readonly cues: readonly Cue[];
	readonly rows: readonly ScriptRow[];
	readonly total: number;
	/**
	 * The moment the capture's own interrupt landed (#165), on the replay's clock.
	 *
	 * Only the `stop` slice has one. It exists so a frame nobody touches still ends
	 * the way the recording ended — the turn cuts itself at 17.9s — while a press
	 * arriving sooner cuts it sooner, down the same path. Both are the same state,
	 * which is the point: where the stop lands is the person's, what it leaves is
	 * the capture's.
	 */
	readonly cut: string | null;
}

const EMPTY: Script = { cues: [], rows: [], total: 0, cut: null };

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
function label(tool: string, input: ToolInput): { verb: string; subject: string; frame: string | null } {
	if (tool === "Bash") {
		const command = field(input, "command") ?? "";
		// a compound command is several calls and it ends on its point, so the last spool
		// verb in it is the one worth a row: `spool status; ...; spool shot cart` went to look at cart
		const last = command.split(/\s*(?:&&|\|\||[;|])\s*/).filter((part) => /^spool\s/.test(part)).at(-1);
		const spool = last === undefined ? null : /^spool\s+(\w+)\s*(.*)$/.exec(last);
		if (spool !== null) {
			const verb = spool[1] ?? "run";
			const subject = (spool[2] ?? "").split(/\s*\d*>/)[0]?.trim() ?? "";
			return { verb, subject, frame: TAKES_FRAME.has(verb) && /^[\w-]+$/.test(subject) ? subject : null };
		}
		return { verb: "run", subject: field(input, "description") ?? "", frame: null };
	}
	if (tool === "Read" || tool === "Write" || tool === "Edit") {
		const path = field(input, "file_path") ?? "";
		const leaf = path.split("/").pop() ?? "";
		const frame = frameOf(path);
		if (tool === "Write") return { verb: "write", subject: nameOf(path), frame };
		if (tool === "Edit") return { verb: "edit", subject: nameOf(path), frame };
		return { verb: /\.(?:png|jpe?g|webp|gif|svg)$/i.test(leaf) ? "look" : "read", subject: nameOf(path), frame };
	}
	if (tool === "Agent") return { verb: "delegate", subject: field(input, "description") ?? "", frame: null };
	// the agent going to fetch a deferred tool before it can call it. Its own words are
	// the query, the way a Bash row's are its description — spool knows no better noun
	// for a search whose subject is a tool that is not spool's
	if (tool === "ToolSearch") return { verb: "find", subject: field(input, "query") ?? "", frame: null };
	return { verb: tool.toLowerCase(), subject: "", frame: null };
}

/**
 * A foreign call's row, in the one name of the three that reads like a place every
 * time (#142).
 *
 * `ask` because the row has to say the agent left the building, and the server is
 * where it went. The server name keeps the capital the binary sent it with: every
 * other subject on this rail is lowercase because it is spool's own noun, so a
 * capital is the whole of the mark that says this one is somebody else's and Spool
 * is quoting it. No icon and no badge — `icon_url` is a Google favicon service, and
 * a local-first canvas that fetches one per row tells a third party which
 * connectors the developer has.
 */
function askOf(meta: { readonly display_name?: string; readonly server_display_name?: string }, raw: string): Foreign {
	const parts = /^mcp__(.+?)__(.+)$/.exec(raw);
	return {
		server: meta.server_display_name ?? parts?.[1] ?? raw,
		tool: meta.display_name ?? parts?.[2] ?? raw,
		raw,
	};
}

/**
 * The read verbs whose one argument is a frame, from `spool skill`: `spool shot
 * <frame>`, `spool logs <frame>`, `spool url <frame>`. `selection` and `flows`
 * take none and `init`/`open` take a path, so a subject that came from those is
 * not a frame however much it looks like a name.
 */
const TAKES_FRAME = new Set(["shot", "logs", "url"]);

/**
 * The frame a path names, or null when the path is a file that is not one (#143).
 *
 * `nameOf` answers what to print and always answers something; this answers
 * whether the thing printed is a frame, which is a different question and the one
 * a row has to settle before it can offer to take you there. `pnpm-lock.yaml` and
 * `src/daemon/lifecycle.ts` print their leaf and name no frame at all.
 */
function frameOf(path: string): string | null {
	const frame = /(?:^|\/)frames\/([^/]+)\/frame\.(?:tsx|json)$/.exec(path);
	const shot = /(?:^|\/)\.spool\/verify\/(.+)\.png$/.exec(path);
	return frame?.[1] ?? shot?.[1] ?? null;
}

/**
 * What a path is called on this rail.
 *
 * A frame lives at `frames/<name>/frame.tsx` with its geometry in the sidecar
 * beside it, so both files are the frame and neither is worth saying `frame.tsx`
 * about — twelve rows in the fan-out capture would otherwise all read `write
 * frame.tsx`, which names nothing. A verify shot is the same frame from the other
 * end, which is #117's finding: 18 of 18 images in both parents came back from
 * `.spool/verify/<frame>.png`, so the rail never has to say `.png` either.
 * Everything else is a file and keeps its leaf.
 */
function nameOf(path: string): string {
	return frameOf(path) ?? path.split("/").pop() ?? "";
}

/**
 * The calls that change a file, which are the ones a run is made of.
 *
 * A run is not a run of `Edit`s. In the fan-out capture a delegate fixing one
 * frame goes `Edit, Edit, Write` and then `Edit, Write` — it switches to
 * rewriting the file whole partway through and that is still one act.
 */
const MUTATES = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

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
	/** the frame the subject names, when it names one */
	frame: string | null;
	subjectAt: number | null;
	doneAt: number | null;
	failed: boolean;
	foreign: Foreign | null;
	finds: boolean;
	detail: string | null;
	shot: ShotRef | null;
	children: ChildDraft[];
	steps: { at: number; text: string }[];
	openAt: number | null;
	counts: boolean;
	runs: boolean;
	block: Streamed | null;
	id: string | null;
}

type Draft =
	| ToolDraft
	| { kind: "think"; at: number; ended: number; ms: number }
	| { kind: "prose"; at: number; text: string; chunks: { at: number; upto: number }[] }
	| {
			kind: "ask";
			at: number;
			ask: Question;
			saidAt: number | null;
			liveAt: number | null;
			doneAt: number | null;
			dropped: boolean;
			id: string | null;
	  };

/**
 * A picture the agent read back, and which frame it is of.
 *
 * `spool shot` writes to `.spool/verify/<frame>.png` and that is where every
 * image in both parent captures came from — 18 of 18, no reference images, no
 * attachments, nothing from outside the project. So a picture in this rail is
 * always a picture of a frame that is on the canvas, and the path can always be
 * turned back into the frame's own name.
 */
function shotOf(path: string, media: string | undefined): ShotRef {
	const found = /(?:^|\/)\.spool\/verify\/(.+)\.png$/.exec(path);
	return { path, media: media ?? "image", frame: found?.[1] ?? null };
}

/**
 * The question out of an `AskUserQuestion` input (#145).
 *
 * The schema takes one to four questions per call and the capture's one call
 * carries one, so this reads the first and nothing pretends otherwise. A call
 * with two is undrawn rather than half-drawn.
 *
 * Nothing here supplies wording. `header`, `question`, every `label` and every
 * `description` are the agent's, and `multiSelect` is the agent's too — the rail
 * has no default to fall back on and does not want one.
 */
function askedOf(input: ToolInput): Question | null {
	const asked = input === undefined || input === null ? undefined : (input as { questions?: unknown }).questions;
	if (!Array.isArray(asked)) return null;
	const first = asked[0] as
		| { question?: unknown; header?: unknown; multiSelect?: unknown; options?: unknown }
		| undefined;
	if (first === undefined || typeof first.question !== "string") return null;
	const offered = Array.isArray(first.options) ? first.options : [];
	const options: AskOption[] = offered
		.filter((option): option is { label: string; description?: unknown } => typeof option?.label === "string")
		.map((option) => ({
			label: option.label,
			description: typeof option.description === "string" ? option.description : "",
		}));
	return {
		header: typeof first.header === "string" ? first.header : "",
		question: first.question,
		options,
		multi: first.multiSelect === true,
	};
}

/** an empty tool row, so the two projections open one the same way */
function toolDraft(at: number, verb: string, subject: string, frame: string | null = null): ToolDraft {
	return {
		kind: "tool",
		at,
		verb,
		subject,
		frame,
		subjectAt: null,
		doneAt: null,
		failed: false,
		foreign: null,
		finds: false,
		detail: null,
		shot: null,
		children: [],
		steps: [],
		openAt: null,
		counts: false,
		runs: false,
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
					chunks: draft.chunks.map((chunk, part) => ({
						cue: cue(`${key}:p${part}`, chunk.at),
						// shown time, not wall time. #149's pace compares this against the ticker's
						// `elapsed`, which counts from 0 at send; a raw capture timestamp is ~1.8e12,
						// so every delta tested as still in the future, `drawnBy` broke on the first
						// one and returned 0, and every agent message drew as a permanently empty
						// reserve. Every other field on this row already goes through `shownAt`.
						at: shownAt(chunk.at),
						upto: chunk.upto,
					})),
				});
				return;
			}
			if (draft.kind === "ask") {
				rows.push({
					kind: "ask",
					key,
					cue: cue(key, draft.at),
					ask: draft.ask,
					saidCue: draft.saidAt === null ? null : cue(`${key}:q`, draft.saidAt),
					liveCue: draft.liveAt === null ? null : cue(`${key}:l`, draft.liveAt),
					doneCue: draft.doneAt === null ? null : cue(`${key}:d`, draft.doneAt),
					dropped: draft.dropped,
					shownFrom: shownAt(draft.at),
					shownFor: Math.max(1, shownAt(draft.saidAt ?? draft.at) - shownAt(draft.at)),
				});
				return;
			}
			rows.push({
				kind: "tool",
				key,
				cue: cue(key, draft.at),
				verb: draft.verb,
				subject: draft.subject,
				frame: draft.frame,
				subjectCue: draft.subjectAt === null ? null : cue(`${key}:s`, draft.subjectAt),
				doneCue: draft.doneAt === null ? null : cue(`${key}:d`, draft.doneAt),
				failed: draft.failed,
				foreign: draft.foreign,
				finds: draft.finds,
				detail: draft.detail,
				shot: draft.shot,
				openCue: draft.openAt === null ? null : cue(`${key}:o`, draft.openAt),
				counts: draft.counts,
				runs: draft.runs,
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

export function projectTurn(events: readonly CaptureEvent[], slice: Slice, collapse: Collapse = "none"): Script {
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
	// the first reach outside spool, and the third foreign result to land after it. Three
	// is where the window has every state the question has: a call allowed and answered,
	// a call a rule refused, and a search for a tool that is not there to be found
	const searched = events.findIndex(
		(event) =>
			event.type === "assistant" && blocksOf(event).some((block) => block.type === "tool_use" && block.name === "ToolSearch"),
	);
	const outside = new Set(events.flatMap((event) => (event.tool_use_meta ?? []).map((meta) => meta.id)));
	const answered: number[] = [];
	events.forEach((event, index) => {
		if (event.type !== "user") return;
		for (const block of blocksOf(event))
			if (block.type === "tool_result" && outside.has(block.tool_use_id ?? "")) answered.push(index);
	});
	// the one question in either parent capture, and the beat after it. The window has to
	// reach past the unanswered result, because what the agent does next is the finding:
	// it does not stall and it does not retry, it picks the cautious option for you and
	// says so — `Understood, I'll leave your install alone.`
	const asked = events.findIndex(
		(event) =>
			event.type === "assistant" &&
			blocksOf(event).some((block) => block.type === "tool_use" && block.name === "AskUserQuestion"),
	);
	const recovered = events.findIndex(
		(event, index) =>
			index > asked &&
			asked >= 0 &&
			event.type === "assistant" &&
			fromParent(event) &&
			blocksOf(event).some((block) => block.type === "text"),
	);
	// the work, then the report on it (#148). The long message in this capture is
	// 3,372 characters and it is the last thing the agent says before it stops to
	// ask — every other window in this file ends before it, which is why the
	// question of how much room prose may take had never been drawn. It starts at
	// the first Write because a report is what closes a piece of work: three writes,
	// four verbs that all come back `spool: unauthenticated`, and then the agent
	// explaining what it built and why it could not check it.
	const wrote = events.findIndex(
		(event) =>
			event.type === "assistant" &&
			fromParent(event) &&
			blocksOf(event).some((block) => block.type === "tool_use" && block.name === "Write"),
	);
	const reported = events.findIndex(
		(event) =>
			event.type === "assistant" &&
			fromParent(event) &&
			blocksOf(event).some((block) => block.type === "text" && block.text !== undefined && block.text.length > 1000),
	);
	/**
	 * The stop, and the window is everything before it (#165).
	 *
	 * The marker is the binary's own and it is addressed to the model, not to the
	 * developer: `Jse({toolUse})` in 2.1.220 posts `[Request interrupted by user]`
	 * as a synthetic `user` text block so the agent's next turn knows why its work
	 * ends mid-sentence — `[Request interrupted by user for tool use]` is the same
	 * function's other branch, taken when the abort lands during the tool batch
	 * (`aborted_tools`) rather than while the model is still writing.
	 *
	 * Everything from the marker back to the last real wire event is the aftermath
	 * the binary *synthesises*, not the turn: the rejected `tool_result` and the
	 * control receipt. None of it is projected, because the rail derives the same
	 * state from where the clock stopped — which is the only way a press landing at
	 * an arbitrary second can leave the same thing behind as the capture's own.
	 */
	const marker = events.findIndex(
		(event) =>
			event.type === "user" &&
			blocksOf(event).some((block) => block.type === "text" && (block.text ?? "").startsWith("[Request interrupted by user")),
	);
	let inflight = marker - 1;
	while (inflight > 0 && wireOf(events[inflight] as CaptureEvent) === undefined) inflight -= 1;
	const bounds: Record<Slice, readonly [number, number]> = {
		plan: [0, firstText],
		verify: [request(shot), events.length - 1],
		session: [0, events.length - 1],
		mcp: [request(searched), answered[2] ?? -1],
		ask: [request(asked), recovered],
		say: [request(wrote), reported],
		stop: [0, marker < 0 ? -1 : inflight],
	};
	const [from, to] = bounds[slice];
	if (from < 0 || to < 0 || from > to) return EMPTY;

	const root = rootOf(events);
	const marks = new Set<number>();
	const mark = (value: number): number => {
		marks.add(value);
		return value;
	};
	// the capture's own stop, registered as a beat so the replay can land on it
	const cutAt = slice === "stop" && marker >= 0 ? mark(at[marker] as number) : null;

	const drafts: Draft[] = [];
	const streamed = new Map<number, Streamed>();
	let plan: ToolDraft | null = null;
	let prose: Extract<Draft, { kind: "prose" }> | null = null;
	/** the run of writes to one frame that is still open, if there is one */
	let run: ToolDraft | null = null;
	/** what each Read went to fetch, so an image result knows which file it is of */
	const read = new Map<string, string>();

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
				if (block.name === "TaskUpdate") {
					// A task starting or landing is the list changing, not a call worth a row
					// of its own — so it moves the plan and logs nothing. `taskId` is the
					// position in the list the creates wrote, counted from one.
					const which = Number.parseInt(field(block.input, "taskId") ?? "", 10);
					const child = plan?.children[which - 1];
					const status = field(block.input, "status");
					if (child !== undefined && status === "in_progress") child.runAt = mark(now);
					if (child !== undefined && status === "completed") child.doneAt = mark(now);
					continue;
				}
				// the turn stopping to ask (#145). Not a call the log is a receipt for, so it
				// never reaches label() and never becomes a line — the question is the object,
				// the same way the plan is
				if (block.name === "AskUserQuestion") {
					const question = askedOf(block.input);
					if (question !== null) {
						drafts.push({
							kind: "ask",
							at: mark(claimed?.at ?? now - pace),
							ask: question,
							saidAt: mark(lands(claimed, question.question) ?? now),
							// the options are the last thing in the payload, so the ask is answerable
							// exactly when its arguments have finished arriving
							liveAt: mark(claimed?.fragments.at(-1)?.at ?? now),
							doneAt: null,
							dropped: false,
							id: block.id ?? null,
						});
					}
					continue;
				}
				// a call is foreign exactly when the binary sent a name for it, so nothing here
				// parses `mcp__` to find out and nothing invents a noun for a server Spool has
				// never heard of
				const meta = (event.tool_use_meta ?? []).find((entry) => entry.id === block.id);
				const outsider = meta === undefined ? null : askOf(meta, block.name ?? "");
				const named =
					outsider === null
						? label(block.name ?? "", block.input)
						: { verb: "ask", subject: outsider.server, frame: null };
				const path = field(block.input, "file_path");
				const opened = mark(claimed?.at ?? now - pace);
				if (block.name === "Read" && path !== null) read.set(block.id ?? "", relative(path, root));

				const writes = collapse !== "none" && MUTATES.has(block.name ?? "") && named.subject !== "";
				const sameFrame = run !== null && named.subject === run.subject;

				// another write to the frame the open run is already about: the run counts it
				// and takes over its id, because the result that lands next is this call's
				if (run !== null && writes && sameFrame) {
					run.children.push({ text: named.verb, running: null, at: opened, runAt: null, doneAt: null, arrives: "done" });
					run.id = block.id ?? null;
					continue;
				}
				// a pass is the whole loop, so the shot and the look that close the run are
				// the run: the picture becomes its payload and the run ends on the look
				if (collapse === "pass" && run !== null && sameFrame && (named.verb === "shot" || named.verb === "look")) {
					run.id = block.id ?? null;
					if (named.verb === "look") run = null;
					continue;
				}

				run = null;
				const draft = toolDraft(opened, named.verb, named.subject, named.frame);
				// the raw request, one line, the way a path or a command is one line. For a
				// foreign call that is the wire name and not the arguments: #120 settled that
				// this disclosure is never payload, and the wire name is the whole of what the
				// receipt above it is standing in for
				draft.detail =
					outsider !== null
						? outsider.raw
						: block.name === "Bash"
							? (field(block.input, "command") ?? null)
							: path === null
								? null
								: relative(path, root);
				draft.foreign = outsider;
				draft.finds = block.name === "ToolSearch";
				draft.block = claimed;
				draft.id = block.id ?? null;
				const landed = lands(claimed, named.subject);
				if (landed !== null) draft.subjectAt = mark(landed);
				if (writes) {
					draft.runs = true;
					draft.children.push({ text: named.verb, running: null, at: opened, runAt: null, doneAt: null, arrives: "done" });
					run = draft;
				}
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
				// a question's result is the one result that is not a receipt for work: it is
				// either the answer or the binary saying nobody gave one
				const asking = drafts.find((draft) => draft.kind === "ask" && draft.id !== null && draft.id === block.tool_use_id);
				if (asking !== undefined && asking.kind === "ask") {
					asking.doneAt = mark(now);
					asking.dropped = text.startsWith("The user did not answer");
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
					// the agent read a shot of its own frame back; the payload is elided, the moment is not.
					// The path is the Read's own, not the row's: a pass row was opened by a write
					// and its detail is the source file, while the picture is the verify shot.
					owner.shot = shotOf(read.get(block.tool_use_id ?? "") ?? owner.detail ?? "", picture.source?.media_type);
					owner.openAt = mark(now);
				}
				// a search that loaded no tool is the only place a connector nobody has signed in
				// to is visible at all: it offers no failing tool, it offers no tool. So the count
				// is the answer, and none is a failure rather than a quiet zero
				if (owner.finds) {
					const loaded = Array.isArray(block.content)
						? block.content.filter((part) => part.type === "tool_reference").length
						: 0;
					owner.failed = loaded === 0;
					owner.detail = loaded === 0 ? (typeof block.content === "string" ? block.content : "nothing") : `${loaded} tools`;
				}
				// an errored result has always been in the capture and has always drawn a check.
				// Where a rule refused the call, the content is the developer's own sentence, and
				// it outranks the wire name the row was holding
				if (block.is_error === true) {
					owner.failed = true;
					const said = typeof block.content === "string" ? block.content.trim() : "";
					if (said !== "") owner.detail = said;
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
	const cut = cutAt === null ? null : shown.cue("cut", cutAt);
	return { cues: shown.cues, rows, total: shown.cues.reduce((last, entry) => Math.max(last, entry.at), 0), cut };
}

/** the projection, memoised against the capture so useTurn's cue array stays stable */
export function useTurnScript(events: readonly CaptureEvent[] | undefined, slice: Slice, collapse: Collapse = "none"): Script {
	return useMemo(() => (events === undefined ? EMPTY : projectTurn(events, slice, collapse)), [events, slice, collapse]);
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
					owner.shot = shotOf(owner.detail ?? "", picture.source?.media_type);
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
		// a fan-out has no stop in it: `claude-fanout.json` runs to completion
		cut: null,
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
export function railEntries(
	script: Script,
	turn: Turn,
	elapsed: number,
	context?: string,
	/** `lifted` leaves the plan's one line in the log and hands the list to the rail */
	plan: "log" | "lifted" = "log",
	/**
	 * Whether the search that loads a deferred tool is a row of its own (#142).
	 *
	 *   none   never. The log holds work on the project and a tool being loaded is
	 *          not that, so a foreign call is one row like every other call.
	 *   empty  only when it came back with nothing, which is the one case that is
	 *          not machinery: a connector nobody has signed in to offers no tool at
	 *          all, so an empty search is the only trace it leaves anywhere.
	 *   all    always, so the two-step reads as two steps.
	 */
	find: "none" | "empty" | "all" = "empty",
): PlayEntry[] {
	const entries: PlayEntry[] = [];
	if (turn.phase === "idle") return entries;
	/**
	 * The turn was stopped, so nothing that had not landed ever will (#165).
	 *
	 * This is the whole of the aftermath and it is derived rather than projected:
	 * every row still open when the clock stopped is a row that never finished, and
	 * which rows those are depends entirely on the second the person pressed. The
	 * capture cannot hold that, because in the recording the stop landed at 17.9s
	 * and here it lands wherever the hand does.
	 */
	const cut = turn.phase === "stopped";
	entries.push({ key: "user", kind: "user", text: turn.prompt, ...(context === undefined ? {} : { context }) });
	for (const row of script.rows) {
		if (!turn.at(row.cue)) continue;
		if (row.kind === "tool" && row.finds && (find === "none" || (find === "empty" && !row.failed))) continue;
		if (row.kind === "think") {
			const done = turn.at(row.doneCue);
			const part = Math.max(0, Math.min(1, (elapsed - row.shownAt) / row.shownMs));
			entries.push({
				key: row.key,
				kind: "line",
				quiet: true,
				state: done ? "done" : cut ? "stopped" : "running",
				verb: "thinking",
				subject: duration(done ? row.realMs : row.realMs * part),
			});
			continue;
		}
		if (row.kind === "prose") {
			/*
			 * #149's pace. A delta is not a step: the backlog sets the rate, so a chunk that
			 * lands whole is drawn out over the following frames — `min(83 c/s, 250ms ÷ pending)`,
			 * closed-form in `say-pace.ts`. What was here before drew each chunk the instant its
			 * cue fired, which measured 96% of frames with nothing on them and the rest carrying
			 * up to three lines each.
			 *
			 * The cue still gates which deltas exist, so a held turn (#145) cannot drain prose
			 * the clock has not reached; `elapsed` then paces the ones it has.
			 */
			const upto = drawnBy(
				row.chunks.filter((chunk) => turn.at(chunk.cue)),
				elapsed,
			);
			entries.push({ key: row.key, kind: "prose", full: row.text, shown: row.text.slice(0, upto) });
			continue;
		}
		if (row.kind === "ask") {
			// the question types itself in between the block opening and its arguments
			// finishing, which is the same three beats every tool call gets — so the ask
			// is not answerable for the beat where it is still arriving
			const said = row.saidCue !== null && turn.at(row.saidCue);
			const live = row.liveCue !== null && turn.at(row.liveCue);
			const settled = row.doneCue !== null && turn.at(row.doneCue);
			const part = said ? 1 : Math.max(0, Math.min(1, (elapsed - row.shownFrom) / Math.max(1, row.shownFor)));
			entries.push({
				key: row.key,
				kind: "ask",
				// a question nobody answered is not done, and the binary agrees: it comes back
				// `The user did not answer the questions.` rather than with an answer. A
				// dismissed one is neither: #162's deny means the tool never ran at all, which
				// is the same `user-rejected` stamp #165's interrupt leaves on the call it
				// caught — so the two share a state, and the turn ends either way
				state: settled ? (row.dropped ? "failed" : "done") : cut ? "stopped" : "running",
				ask: row.ask,
				shown: row.ask.question.slice(0, Math.round(row.ask.question.length * part)),
				live: live && !settled && !cut,
			});
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
		// a lifted plan still gets its line in the log, because the log's job is to say
		// what happened and writing the plan happened — it just no longer holds the list.
		// A run's children are never listed: they are the same verb on the same frame,
		// and the count in the subject is the whole of what tells them apart.
		const listed = (row.counts && plan === "lifted") || row.runs ? [] : children;
		const counted = row.runs
			? children.length > 1
				? `${row.subject} ×${children.length}`
				: row.subject
			: `${children.length} task${children.length === 1 ? "" : "s"}`;
		const shows = row.counts || row.runs ? children.length > 0 : row.subjectCue === null || turn.at(row.subjectCue);
		const settled = row.doneCue !== null && turn.at(row.doneCue);
		// a delegate's step is where it is, not where it has been, and once it lands
		// there is nothing more to say: the frame it wrote is out on the canvas
		const step = settled ? null : row.steps.reduce<string | null>((seen, on) => (turn.at(on.cue) ? on.text : seen), null);
		const detail = step ?? row.detail;
		entries.push({
			key: row.key,
			kind: "line",
			state: settled ? (row.failed ? "failed" : "done") : cut ? "stopped" : "running",
			verb: row.verb,
			...(row.foreign === null ? {} : { foreign: row.foreign }),
			...(shows ? { subject: row.counts || row.runs ? counted : row.subject } : {}),
			// the frame rides with the row whether or not the subject has landed yet: a
			// tool block opens with an empty input, so for a beat the row knows the frame
			// it is about before it can print it, and drawing a target with nothing under
			// it is worse than waiting
			...(row.frame === null || !shows ? {} : { frame: row.frame }),
			...(row.runs && children.length > 1 ? { count: children.length } : {}),
			...(detail === null ? {} : { detail }),
			...(row.shot === null ? {} : { shot: row.shot }),
			...(listed.length > 0 ? { children: listed } : {}),
			...(row.openCue !== null && turn.at(row.openCue) ? { open: true } : {}),
		});
	}
	/*
	 * Where the turn ended, in spool's own words rather than the binary's.
	 *
	 * #127's rule is to quote the binary where it can be, and this is the case where
	 * it cannot: `[Request interrupted by user]` is not a line the CLI shows anyone,
	 * it is a synthetic `user` block posted into the conversation so the *model*
	 * knows why its work ends mid-sentence. Echoing it back at the developer reports
	 * their own press to them as news, in the voice of the person who made it — and
	 * the rail draws the human's words with a 2px accent rail, so a message nobody
	 * typed would arrive wearing the human's own mark.
	 *
	 * It is a `rule` because a stop is a boundary and not a reply: everything above
	 * it happened, nothing below it did, and the next thing in the log is a new turn.
	 */
	if (cut) entries.push({ key: "cut", kind: "note", text: "stopped", rule: true });
	return entries;
}

/**
 * The developer's whole MCP estate, off `mcp_status` rather than off `init` (#142).
 *
 * Session state and not turn state, so it is read from the capture whole and has
 * nothing to do with which slice is playing — a connector's status is true before
 * the first keystroke and does not change because a row landed. `init.mcp_servers`
 * is the fallback and it is a bad one: in this capture it reports two servers
 * where `mcp_status` reports fifteen.
 */
export function connectorsOf(events: readonly CaptureEvent[] | undefined): readonly Connector[] {
	if (events === undefined) return [];
	const answered = events.find((event) => event.type === "control_response" && event.response?.response?.mcpServers !== undefined);
	const listed =
		answered?.response?.response?.mcpServers ?? events.find((event) => event.subtype === "init")?.mcp_servers ?? [];
	const known = new Set(["connected", "needs-auth", "failed", "pending"]);
	return listed.map((server) => ({
		name: server.name,
		status: (known.has(server.status) ? server.status : "pending") as Connector["status"],
		...("error" in server && typeof server.error === "string" ? { error: server.error } : {}),
	}));
}

/**
 * The plan, lifted out of the transcript.
 *
 * Same children the row would have shown, read at the same instant off the same
 * cues — the difference is only where they are drawn, which is the whole of what
 * this is for.
 */
export function planOf(script: Script, turn: Turn): Plan | null {
	if (turn.phase === "idle") return null;
	const row = script.rows.find((entry): entry is ToolRow => entry.kind === "tool" && entry.counts);
	if (row === undefined || !turn.at(row.cue)) return null;
	const children: RowChild[] = row.children
		.filter((child) => turn.at(child.cue))
		.map((child) => {
			const state = childState(child, turn.at);
			return { id: child.cue, name: state === "running" && child.running !== null ? child.running : child.text, state };
		});
	if (children.length === 0) return null;
	const running = children.find((child) => child.state === "running") ?? null;
	return {
		total: children.length,
		done: children.filter((child) => child.state === "done").length,
		running: running === null ? null : running.name,
		children,
	};
}
