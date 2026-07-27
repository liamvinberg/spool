import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import {
	type AgentContext,
	type AgentEvent,
	Approval,
	CellShell,
	StateMark,
	TaskCell,
	TOOL_W,
	ToolCell,
	ToolName,
} from "./spool-agent-rail";
import { RailTabs } from "./spool-canvas-chrome";
import { ChevronIcon, CloseIcon } from "./spool-icons";

/**
 * The agent rail as one turn plays through it, from submit to settled.
 *
 * It extends the settled rail rather than forking it: the tool cell, the
 * sub-agent cell and the approval come straight from spool-agent-rail, so a
 * read row here and a read row there are the same object. What is new is only
 * what the shipped rail had no beat for.
 *
 * Two tabs, not three. Elements is gone, so the right rail is agent and
 * connections, and the agent tab runs at 420 because the transcript is the one
 * thing in this app that is read rather than arranged.
 *
 * Everything here is drawn against a real capture of
 * `claude -p --output-format stream-json --include-partial-messages`, which
 * settles three things the design has to obey:
 *
 *   thinking has no text     thinking_delta carries an empty string and a token
 *                            estimate. So a thinking cell is a climbing number
 *                            and the cadence of the deltas, never prose.
 *   a tool exists before its
 *   arguments do             content_block_start names the tool with input {}.
 *                            The path then arrives as partial JSON that splits
 *                            mid-token, so the row is named and pathless first
 *                            and the path types itself in after.
 *   the window is real       rate_limit_event reports a five-hour window and
 *                            its utilization. The pitch is that this runs on
 *                            your own subscription, so the window is standing
 *                            state and lives in the session strip, stated
 *                            plainly and never dressed as an alarm.
 */

/* ---------- the event vocabulary ---------- */

type ToolEvent = Extract<AgentEvent, { kind: "tool" }>;
type TaskEvent = Extract<AgentEvent, { kind: "task" }>;
type ApprovalEvent = Extract<AgentEvent, { kind: "approval" }>;

export type TurnEvent =
	/** awaiting keeps the turn open: the thread runs on past the message */
	| { kind: "user"; text: string; context?: AgentContext; awaiting?: boolean }
	| { kind: "assistant"; text: string }
	/** thinking, finished: the count is all it ever had */
	| { kind: "thought"; tokens: string; seconds: string }
	/** thinking, live: the count climbs and the deltas leave a trace */
	| { kind: "thinking" }
	/** text_delta arriving while a tool_use block opens beneath it */
	| { kind: "stream"; tool: string }
	/** the result event, rendered */
	| { kind: "result" }
	| ToolEvent
	| TaskEvent
	| ApprovalEvent;

/* ---------- the one timer ----------
 * Every animation in these frames is a step through a real sequence, so one
 * stepper drives all of them: index 0 to steps, one step every stepMs, resting
 * at the top for holdMs before it starts over.
 *
 * `start` is the index it mounts at, and it matters more than it looks. A frame
 * is one beat, so it should already be standing in that beat the instant it
 * appears and then keep playing; starting every loop from zero would mean every
 * thumbnail, every headless shot and every first glance caught the beat before
 * it had happened. Under reduced motion it never runs at all and reports the
 * top, so nothing moves for someone who asked for nothing to move. */

function useStep(steps: number, stepMs: number, holdMs: number, start = 0): number {
	const still = useReducedMotion() === true;
	const [index, setIndex] = useState(start);
	useEffect(() => {
		if (still) return;
		let timer = 0;
		let current = start;
		const schedule = (wait: number) => {
			timer = window.setTimeout(() => {
				current = current >= steps ? 0 : current + 1;
				setIndex(current);
				schedule(current >= steps ? holdMs : stepMs);
			}, wait);
		};
		schedule(start >= steps ? holdMs : stepMs);
		return () => window.clearTimeout(timer);
	}, [steps, stepMs, holdMs, start, still]);
	return still ? steps : index;
}

/** a text caret blinks square, never fades */
export function Caret({ className }: { className?: string }) {
	const still = useReducedMotion() === true;
	return (
		<motion.span
			className={cn("inline-block h-[12px] w-[2px] translate-y-[1px] rounded-[1px] bg-text align-baseline", className)}
			animate={still ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }}
			transition={
				still
					? undefined
					: { duration: 1.06, times: [0, 0.49, 0.5, 1], repeat: Number.POSITIVE_INFINITY, ease: "linear" }
			}
		/>
	);
}

/* ---------- the rail ---------- */

export interface ComposerState {
	/** what is in the field; empty means resting on the placeholder */
	value: string;
	placeholder: string;
	context?: AgentContext | undefined;
}

export function AgentTurnRail({
	events,
	usage,
	composer,
	working = false,
}: {
	events: readonly TurnEvent[];
	usage: string;
	composer: ComposerState;
	working?: boolean;
}) {
	return (
		<>
			<RailTabs tabs={["agent", "connections"]} active="agent" />
			<SessionStrip usage={usage} working={working} />
			<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
				{/* bottom-anchored: a turn grows downward and the session above it
				    clips at the top, the way a scrolled transcript does */}
				<div className="flex min-h-0 flex-1 flex-col justify-end gap-3.5 overflow-hidden px-3.5 pt-5 pb-3.5 [&>*]:shrink-0">
					{groupRuns(events).map((group, index) => (
						<div key={index} className="flex flex-col gap-1 [&>*]:shrink-0">
							{group.map((event, inner) => (
								<Event key={inner} event={event} />
							))}
						</div>
					))}
				</div>
				<span className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-bg to-transparent" />
			</div>
			<Composer composer={composer} working={working} />
		</>
	);
}

/** consecutive machine work reads as one run, so it clusters at gap-1 */
function groupRuns(events: readonly TurnEvent[]): TurnEvent[][] {
	const clusters = new Set(["tool", "task", "thought"]);
	const groups: TurnEvent[][] = [];
	for (const event of events) {
		const last = groups[groups.length - 1];
		const head = last?.[0];
		if (clusters.has(event.kind) && head !== undefined && clusters.has(head.kind)) {
			last?.push(event);
			continue;
		}
		groups.push([event]);
	}
	return groups;
}

function Event({ event }: { event: TurnEvent }) {
	if (event.kind === "user") return <UserTurn event={event} />;
	if (event.kind === "assistant") return <p className="text-base text-text/90 leading-base">{event.text}</p>;
	if (event.kind === "thought") return <ThoughtCell tokens={event.tokens} seconds={event.seconds} />;
	if (event.kind === "thinking") return <ThinkingCell />;
	if (event.kind === "stream") return <StreamBlock tool={event.tool} />;
	if (event.kind === "result") return <ResultCell />;
	if (event.kind === "task") return <TaskCell event={event} wide />;
	if (event.kind === "approval") return <Approval event={event} wide />;
	return <ToolCell event={event} wide />;
}

/* ---------- the session strip ----------
 * Who is running, what it is carrying, and how much of your own five-hour
 * window is left. The window is the honest cost of "no API key, your own
 * subscription": if it stays invisible the agent just stops one day and nobody
 * knows why. So it is always on screen, in the same muted grey as everything
 * else, because 90% of a window is a fact and not an emergency. */

function SessionStrip({ usage, working }: { usage: string; working: boolean }) {
	return (
		<div className="flex shrink-0 flex-col gap-2 border-border border-b px-3.5 py-2.5">
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-2">
					<StateMark state={working ? "running" : "completed"} />
					<span className="font-mono text-muted text-xs leading-3">claude code</span>
				</span>
				<span className="font-mono text-muted/60 text-xs leading-3">{usage}</span>
			</div>
			<div className="flex items-center gap-2.5">
				<span className="font-mono text-2xs text-muted/70 leading-3">5h window</span>
				<span className="h-[3px] w-[72px] shrink-0 overflow-hidden rounded-full bg-border-raised">
					<span className="block h-full w-[90%] rounded-full bg-muted" />
				</span>
				<span className="font-mono text-2xs text-muted leading-3">90%</span>
				<span className="ml-auto font-mono text-2xs text-muted/45 leading-3">resets 19:20</span>
			</div>
		</div>
	);
}

/* ---------- the human's turn ----------
 * The 2px thread spine is the line you drew through the work. While the request
 * is out it does not stop at the message: it runs on into the empty space under
 * it with a light travelling down it, ending at the mark. Waiting then reads as
 * the thread being followed rather than as nothing happening. */

function UserTurn({ event }: { event: Extract<TurnEvent, { kind: "user" }> }) {
	const still = useReducedMotion() === true;
	const awaiting = event.awaiting === true;
	return (
		<div className="relative flex flex-col gap-1.5 pl-3.5">
			<span
				className={cn(
					"absolute top-1 bottom-1 left-0 w-[2px] overflow-hidden rounded-full",
					awaiting ? "bg-thread/35" : "bg-thread",
				)}
			>
				{awaiting ? (
					<motion.span
						className="absolute inset-x-0 top-0 block h-1/3 rounded-full bg-thread"
						animate={still ? { y: "200%" } : { y: ["-100%", "300%"] }}
						transition={
							still ? undefined : { duration: 2.1, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
						}
					/>
				) : null}
			</span>
			<p className="text-base text-text leading-base">{event.text}</p>
			{event.context === undefined ? null : (
				<span className="truncate font-mono text-2xs text-muted/60 leading-3">
					{`${event.context.frame} · ${event.context.element} · ${event.context.lines}`}
				</span>
			)}
			{awaiting ? <RequestingRow /> : null}
		</div>
	);
}

/**
 * The emptiest beat in the turn: the request is out and nothing has come back.
 * The only honest signals are the status itself, a clock that is moving, and
 * what `init` already told us about the session it opened. Three small true
 * things beat one spinner, because together they say the pipe is open and this
 * is what went down it.
 */
function RequestingRow() {
	const step = useStep(18, 100, 600, 12);
	return (
		<div className="flex flex-col gap-1 pt-2">
			<div className="flex items-center gap-2">
				<StateMark state="running" />
				<span className="font-mono text-muted text-xs leading-4">requesting</span>
				<span className="ml-auto font-mono text-muted/60 text-xs tabular-nums leading-4">
					{(step / 10).toFixed(1)}s
				</span>
			</div>
			<span className="pl-5 font-mono text-2xs text-muted/50 leading-3">opus-5 · 30 tools · your subscription</span>
		</div>
	);
}

/* ---------- thinking ----------
 * There is nothing to read. thinking_delta carries an empty string; only the
 * token estimate is real. So the cell is the number, climbing, plus the shape
 * of how it climbed: one tick per delta, its height the size of that delta.
 * That trace is the whole of what the model actually sent, drawn honestly, and
 * it is what makes a redacted block feel like something rather than a stall. */

const DELTAS = [50, 70, 64, 88, 52, 96, 71, 110, 83, 67, 94, 58, 102, 76, 99] as const;
const TICK_W = 4;
const TICK_GAP = 3;
const TRACE_W = DELTAS.length * TICK_W + (DELTAS.length - 1) * TICK_GAP;
const TRACE_H = 18;

function tickHeight(delta: number): number {
	return Math.round(5 + Math.min(1, Math.max(0, (delta - 50) / 60)) * 13);
}

function ThinkingCell() {
	const still = useReducedMotion() === true;
	const step = useStep(DELTAS.length, 300, 3500, 7);
	const tokens = DELTAS.slice(0, step).reduce((sum, delta) => sum + delta, 0);
	return (
		<CellShell wide>
			<StateMark state="running" className="mt-0.5" />
			<div className="flex min-w-0 flex-1 flex-col gap-2.5">
				<div className="flex min-w-0 items-baseline gap-2">
					<ToolName name="think" />
					<span className="min-w-0 flex-1 font-mono text-sm text-text tabular-nums leading-4">
						{tokens.toLocaleString("en-US")}
						<span className="text-muted/70 text-xs"> tokens</span>
					</span>
					<span className="shrink-0 font-mono text-2xs text-muted/60 tabular-nums leading-3">
						{(step * 0.3).toFixed(1)}s
					</span>
				</div>
				{/* the deltas, one tick each, as tall as the delta was. This trace is
				    the entire content of a redacted block, drawn without pretending
				    there were words in it. */}
				<div className="relative" style={{ marginLeft: TOOL_W + 8, width: TRACE_W, height: TRACE_H }}>
					<span className="absolute inset-x-0 bottom-0 h-px bg-border-raised" />
					<div className="absolute inset-0 flex items-end" style={{ gap: TICK_GAP }} aria-hidden="true">
						{DELTAS.slice(0, step).map((delta, index) => (
							<motion.span
								key={index}
								className="block shrink-0 rounded-[1px] bg-muted"
								style={{ width: TICK_W, height: tickHeight(delta), transformOrigin: "bottom" }}
								initial={still ? false : { scaleY: 0, opacity: 0 }}
								animate={{ scaleY: 1, opacity: 1 }}
								transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
							/>
						))}
					</div>
				</div>
				<span className="font-mono text-2xs text-muted/50 leading-3" style={{ paddingLeft: TOOL_W + 8 }}>
					the model sends a count, not the words
				</span>
			</div>
		</CellShell>
	);
}

/** the same block once it closed: the count is all it ever had to give */
function ThoughtCell({ tokens, seconds }: { tokens: string; seconds: string }) {
	return (
		<CellShell wide>
			<StateMark state="completed" className="mt-0.5" />
			<div className="flex min-w-0 flex-1 items-baseline gap-2">
				<ToolName name="think" />
				<span className="min-w-0 flex-1 truncate font-mono text-muted text-xs leading-4">{tokens} tokens</span>
				<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{seconds}</span>
			</div>
		</CellShell>
	);
}

/* ---------- text and arguments, arriving together ----------
 * One timeline, because they are one block sequence on the wire: prose streams,
 * a tool_use block opens under it carrying a name and an empty input, and the
 * path then arrives as partial JSON that splits mid-token. The caret moves from
 * the sentence into the argument slot, which is exactly where the model's
 * attention went. */

const NARRATION = [
	"R",
	"ead",
	"ing",
	" the",
	" c",
	"art",
	" frame",
	" and",
	" the",
	" sh",
	"ared",
	" bar",
	",",
	" then",
	" branch",
	"ing",
] as const;

/** the fragments land the way the capture split them, mid-token and uneven */
const PATH_CHUNKS = ["frames/a", "frames/app/cart/fra", "frames/app/cart/frame.tsx"] as const;

const STREAM_STEPS = 36;
const TOOL_IN = 14;
const PATH_AT = [19, 23, 27] as const;
const RUN_AT = 31;

function StreamBlock({ tool }: { tool: string }) {
	const step = useStep(STREAM_STEPS, 90, 4200, RUN_AT);
	const text = NARRATION.slice(0, Math.min(step, NARRATION.length)).join("");
	const landed = PATH_AT.filter((at) => step >= at).length;
	const path = landed === 0 ? "" : (PATH_CHUNKS[landed - 1] ?? "");
	const running = step >= RUN_AT;
	return (
		<div className="flex flex-col gap-2.5">
			<p className="text-base text-text/90 leading-base">
				{text}
				<Caret className="ml-1" />
			</p>
			{step >= TOOL_IN ? (
				<CellShell wide>
					<StateMark state={running ? "running" : "activity"} className="mt-0.5" />
					<div className="flex min-w-0 flex-1 items-baseline gap-2">
						<ToolName name={tool} />
						<span className="min-w-0 flex-1 truncate font-mono text-text/85 text-xs leading-4">
							{path}
							{running ? null : <Caret className={path === "" ? undefined : "ml-[3px]"} />}
						</span>
					</div>
				</CellShell>
			) : null}
		</div>
	);
}

/* ---------- the result ----------
 * The turn's receipt, printed once it lands: what it cost in time, turns,
 * tokens and money. The numbers arrive left to right the way a receipt prints,
 * which is the only motion the settled beat has and the right amount of it. */

const STATS = [
	{ value: "2", unit: "turns" },
	{ value: "183", unit: "out" },
	{ value: "46.9k", unit: "cached" },
	{ value: "$0.19", unit: "" },
] as const;

function ResultCell() {
	const still = useReducedMotion() === true;
	const step = useStep(STATS.length + 1, 110, 6000, STATS.length + 1);
	return (
		<CellShell wide>
			<StateMark state="completed" className="mt-0.5" />
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex min-w-0 items-baseline gap-2">
					<ToolName name="done" />
					<span className="min-w-0 flex-1 font-mono text-muted/60 text-xs leading-4">this turn</span>
					<motion.span
						className="shrink-0 font-mono text-text/85 text-xs tabular-nums leading-4"
						animate={{ opacity: still || step >= 1 ? 1 : 0, y: still || step >= 1 ? 0 : 4 }}
						transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
					>
						6.1s
					</motion.span>
				</div>
				<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ paddingLeft: TOOL_W + 8 }}>
					{STATS.map((stat, index) => {
						const shown = still || step >= index + 2;
						return (
							<motion.span
								key={stat.value}
								className="font-mono text-xs tabular-nums leading-4"
								animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 4 }}
								transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
							>
								<span className="text-text/85">{stat.value}</span>
								{stat.unit === "" ? null : <span className="text-muted/70"> {stat.unit}</span>}
							</motion.span>
						);
					})}
				</div>
			</div>
		</CellShell>
	);
}

/* ---------- composer ----------
 * The complaint about the shipped rail was that the composer is a slot when the
 * thing you do here is write. So it is a field: three rows at rest, growing to
 * eight and then scrolling inside itself, with the selection chip living inside
 * the same bounded box rather than floating above it. Chip and prompt are one
 * message, so they are one object. */

const ROW = 20;
const MIN_ROWS = 3;
const MAX_ROWS = 8;

function Composer({ composer, working }: { composer: ComposerState; working: boolean }) {
	return (
		<div className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			<div className="flex flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5">
				{composer.context === undefined ? null : <TurnChip context={composer.context} />}
				<div className="overflow-y-auto" style={{ minHeight: MIN_ROWS * ROW, maxHeight: MAX_ROWS * ROW }}>
					{composer.value === "" ? (
						<p className="flex items-center text-base text-muted/55 leading-base">
							<Caret className="mr-1.5" />
							{composer.placeholder}
						</p>
					) : (
						<p className="text-base text-text leading-base">
							{composer.value}
							<Caret className="ml-1" />
						</p>
					)}
				</div>
			</div>
			<div className="flex h-[26px] items-center justify-between">
				<ModelPill />
				{working ? (
					<StopButton />
				) : (
					<span className="font-mono text-2xs text-muted/50 leading-3">⏎ to send</span>
				)}
			</div>
		</div>
	);
}

/**
 * The chip, and the whole idea under it: the selection spool already holds,
 * sitting in the composer, going out with the next message without being asked
 * for. Frame, nearest named row, line range — the three things spool actually
 * knows about what you pointed at, and no invented component name.
 */
function TurnChip({ context }: { context: AgentContext }) {
	return (
		<span className="flex h-6 w-fit max-w-full items-center gap-2 overflow-hidden rounded-sm border border-border-raised bg-raised pr-1 pl-2">
			<span className="h-3 w-[2px] shrink-0 rounded-full bg-thread" />
			<span className="min-w-0 truncate font-mono text-xs leading-4">
				<span className="text-text">{context.frame}</span>
				<span className="text-muted/45"> · </span>
				<span className="text-text/80">{context.element}</span>
				<span className="text-muted/45"> · </span>
				<span className="text-muted">{context.lines}</span>
			</span>
			<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/60">
				<CloseIcon className="h-2 w-2" />
			</span>
		</span>
	);
}

/** the model the session opened with, straight off init */
function ModelPill() {
	return (
		<span className="flex h-[26px] items-center gap-1.5 rounded-sm border border-border-raised bg-raised pr-1.5 pl-2">
			<span className="font-mono text-text text-xs leading-3">opus-5</span>
			<ChevronIcon open className="h-2.5 w-2.5 text-muted/60" />
		</span>
	);
}

/** a turn in flight has to be interruptible, so stop lives where send would be */
function StopButton() {
	return (
		<span className="flex h-[26px] items-center gap-2 rounded-sm border border-border-raised bg-raised pr-2 pl-2">
			<span className="h-2 w-2 shrink-0 rounded-[1px] bg-text" />
			<span className="font-mono text-text text-xs leading-3">stop</span>
			<span className="font-mono text-2xs text-muted/60 leading-3">⎋</span>
		</span>
	);
}
