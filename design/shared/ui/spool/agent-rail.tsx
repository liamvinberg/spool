import { motion, useReducedMotion } from "motion/react";
import { cn } from "shared/lib/utils";
import { RailTabs } from "shared/ui/spool/canvas-chrome";
import { CloseIcon } from "shared/ui/spool/icons";

/**
 * The agent rail: spool talking to the human's own Claude Code, spawned as a
 * child process, logged in by the machine's own subscription. Third tab on the
 * right rail, beside elements and connections.
 *
 * The mechanic the rail exists for: what the human last pointed at is already
 * attached. The chip above the composer is the selection spool already tracks
 * (frame, source path, line range, selector), pushed into the prompt instead of
 * pulled by `spool selection`. "make this sticky" resolves because the element
 * is the context.
 *
 * Every agent tool arrives normalized to one shape — { tool, label, state,
 * detail } — so this is a renderer, not a switch over Claude's tool list. Four
 * kinds earn more than the generic row: read and edit carry a path, edit carries
 * a diff count, bash carries a command, and a sub-agent carries a nested run.
 *
 * Two densities of the same language. `narrow` is the rail at its shipped 300
 * and every tool is one line: path and count fit, results do not. `wide` is the
 * rail at 420 and the same tool becomes a cell with its result under it. What
 * the extra 120 buys is legible by holding the two side by side.
 */

/* ---------- the event vocabulary ---------- */

export type ToolState = "activity" | "running" | "completed";

/** the selection, as the composer wears it */
export interface AgentContext {
	frame: string;
	element: string;
	lines: string;
}

export type AgentEvent =
	| { kind: "user"; text: string; context?: AgentContext }
	| { kind: "assistant"; text: string; streaming?: boolean }
	| { kind: "thinking"; text: string }
	/** the context window folded; the token count rides along, since it is why */
	| { kind: "compaction"; text: string; usage: string }
	| {
			kind: "tool";
			tool: string;
			label: string;
			state: ToolState;
			/** the result, wide only: line counts, scope, the frame that repainted */
			detail?: string;
			/** edit and write only */
			diff?: { added: number; removed: number };
			/** the frame this edit repainted; wide draws the tie to the canvas */
			repainted?: string;
			/** narrow's right column, where a detail line will not fit */
			meta?: string;
	  }
	| { kind: "error"; tool: string; label: string; message: string }
	| { kind: "task"; label: string; state: ToolState; runs: readonly { name: string; state: ToolState }[] }
	| { kind: "approval"; tool: string; command: string };

/* ---------- motion ----------
 * Two ambient loops and nothing else. Both are slow enough to read as breathing
 * rather than blinking, and both hold still under reduced motion so a frame
 * shot at any moment shows the same state. */

const BREATHE = { duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" as const };

/* ---------- state marks ----------
 * The mark column is the whole state language: motion says running, colour says
 * something needs you. Nothing else earns the thread. */

/**
 * A row's ending, in one element.
 *
 * `pending` is the ring with the arc taken off it and nothing turning, so a list
 * at rest has no motion in it at all. The stroke has to be mounted before it
 * draws — a dash offset only animates on an element that was already there — so
 * a row that is still running holds the check's geometry at zero length, and
 * whichever ending arrives replaces the path in place and lets it draw.
 *
 * `src/ui/canvas/agent-rail.tsx` names five states; the three this rail's cells
 * speak are the same marks under the older names.
 */

export type RowState = "pending" | "running" | "done" | "failed" | "stopped";

const CHECK = "m3.4 7.2 2.4 2.4 4.8-5.2";

const STROKES: Record<RowState, readonly [string, string | null]> = {
	pending: [CHECK, null],
	running: [CHECK, null],
	done: [CHECK, null],
	failed: ["M4.2 4.2l5.6 5.6", "M9.8 4.2l-5.6 5.6"],
	stopped: ["M4.4 7h5.2", null],
};

/** the cells' own names for three of those five */
const AS_ROW: Record<ToolState | "error", RowState> = {
	activity: "pending",
	running: "running",
	completed: "done",
	error: "failed",
};

export function StateMark({ state, className }: { state: ToolState | "error" | RowState; className?: string }) {
	const row: RowState = state in AS_ROW ? AS_ROW[state as ToolState | "error"] : (state as RowState);
	const turning = row === "running";
	const ringed = turning || row === "pending";
	const settled = !ringed;
	const [first, second] = STROKES[row];
	const strokes: { key: string; d: string; drawn: boolean; delay: number }[] = [
		{ key: "one", d: first, drawn: settled, delay: 75 },
		{ key: "two", d: second ?? first, drawn: settled && second !== null, delay: 135 },
	];
	return (
		<span className={cn("relative flex h-3.5 w-3.5 shrink-0", className)}>
			<span
				className={cn(
					"absolute inset-0 transition-[opacity,transform] duration-200 ease-in motion-reduce:transition-none",
					ringed ? "opacity-100" : "scale-[0.62] opacity-0",
				)}
			>
				<svg
					viewBox="0 0 14 14"
					className={cn(turning ? "text-text/60" : "text-text/35", "h-full w-full", turning && "animate-agent-spin")}
					fill="none"
					aria-hidden="true"
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					{turning ? (
						<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					) : null}
				</svg>
			</span>
			<svg viewBox="0 0 14 14" className="absolute inset-0 h-full w-full text-muted" fill="none" aria-hidden="true">
				{strokes.map((stroke) => (
					// `pathLength` normalises the stroke to 1 unit, so the dash offset draws it
					// without anything having to measure the geometry first
					<path
						key={stroke.key}
						d={stroke.d}
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						pathLength={1}
						className="transition-[stroke-dashoffset,opacity] duration-300 ease-out motion-reduce:transition-none"
						style={{
							strokeDasharray: 1,
							strokeDashoffset: stroke.drawn ? 0 : 1,
							opacity: stroke.drawn ? 1 : 0,
							// the second stroke of a cross follows the first rather than racing it
							transitionDelay: `${stroke.delay}ms`,
						}}
					/>
				))}
			</svg>
		</span>
	);
}

/* ---------- the rail ---------- */

export interface AgentRailProps {
	density: "narrow" | "wide";
	/**
	 * What stands above the session strip. The tab row is what this rail was
	 * drawn with, and it is what the rail lost: #144 took the tabs away and
	 * `properties-rail.tsx` shipped without them. `null` is that rail, and a node
	 * is a proposal's own header.
	 */
	head?: React.ReactNode | undefined;
	events: readonly AgentEvent[];
	context?: AgentContext | undefined;
	/** the token count the session is carrying right now */
	usage: string;
	/** a turn is in flight: the session mark goes live and the composer offers stop */
	working?: boolean | undefined;
}

export function AgentRail({ density, events, context, usage, working = false, head }: AgentRailProps) {
	const wide = density === "wide";
	return (
		<>
			{head === undefined ? <RailTabs tabs={["elements", "connections", "agent"]} active="agent" /> : head}
			<SessionStrip usage={usage} working={working} wide={wide} />
			{/* bottom-anchored, and nothing shrinks: a long turn clips at the top the
			    way a scrolled transcript does, and the live end stays whole */}
			<div
				className={cn(
					"flex min-h-0 flex-1 flex-col justify-end overflow-hidden pt-4 pb-3 [&>*]:shrink-0",
					wide ? "gap-3.5 px-3.5" : "gap-3 px-3",
				)}
			>
				{groupRuns(events).map((group, index) => (
					<div key={index} className="flex flex-col gap-1 [&>*]:shrink-0">
						{group.map((event, inner) => (
							<Event key={inner} event={event} wide={wide} />
						))}
					</div>
				))}
			</div>
			<Composer context={context} wide={wide} working={working} />
		</>
	);
}

/** consecutive tool traffic reads as one run, so it clusters at gap-1 */
function groupRuns(events: readonly AgentEvent[]): AgentEvent[][] {
	const groups: AgentEvent[][] = [];
	for (const event of events) {
		const runnable = event.kind === "tool" || event.kind === "error" || event.kind === "task";
		const last = groups[groups.length - 1];
		if (runnable && last !== undefined && last[0] !== undefined) {
			const head = last[0];
			if (head.kind === "tool" || head.kind === "error" || head.kind === "task") {
				last.push(event);
				continue;
			}
		}
		groups.push([event]);
	}
	return groups;
}

function SessionStrip({ usage, working, wide }: { usage: string; working: boolean; wide: boolean }) {
	return (
		<div
			className={cn(
				"flex h-7 shrink-0 items-center justify-between border-border border-b",
				wide ? "px-3.5" : "px-3",
			)}
		>
			<span className="flex items-center gap-2">
				<StateMark state={working ? "running" : "completed"} />
				<span className="font-mono text-2xs text-muted leading-3">claude code</span>
			</span>
			<span className="font-mono text-2xs text-muted/60 leading-3">{usage}</span>
		</div>
	);
}

/* ---------- events ---------- */

function Event({ event, wide }: { event: AgentEvent; wide: boolean }) {
	if (event.kind === "user") return <UserTurn event={event} />;
	if (event.kind === "assistant") return <AssistantTurn event={event} />;
	if (event.kind === "thinking") return <ActivityRow text={event.text} />;
	if (event.kind === "compaction") return <Compaction event={event} />;
	if (event.kind === "error") return <ErrorRow event={event} wide={wide} />;
	if (event.kind === "task") return <TaskCell event={event} wide={wide} />;
	if (event.kind === "approval") return <Approval event={event} wide={wide} />;
	return <ToolCell event={event} wide={wide} />;
}

/**
 * The human's own turns carry the thread, the same 2px spine the active page
 * wears in the Pages rail: it is the line you drew through the work.
 */
function UserTurn({ event }: { event: Extract<AgentEvent, { kind: "user" }> }) {
	return (
		<div className="relative flex flex-col gap-1.5 pl-3">
			<span className="absolute top-0.5 bottom-0.5 left-0 w-[2px] rounded-full bg-thread" />
			<p className="text-base text-text leading-base">{event.text}</p>
			{event.context === undefined ? null : (
				<span className="truncate font-mono text-2xs text-muted/60 leading-3">
					{`${event.context.frame} · ${event.context.element} · ${event.context.lines}`}
				</span>
			)}
		</div>
	);
}

function AssistantTurn({ event }: { event: Extract<AgentEvent, { kind: "assistant" }> }) {
	const still = useReducedMotion() === true;
	return (
		<p className="text-base text-text/90 leading-base">
			{event.text}
			{event.streaming === true ? (
				<motion.span
					className="ml-1 inline-block h-3 w-[2px] translate-y-[1px] rounded-full bg-text align-baseline"
					animate={still ? undefined : { opacity: [1, 0.15, 1] }}
					transition={still ? undefined : BREATHE}
				/>
			) : null}
		</p>
	);
}

/** thinking, and anything else the agent is doing that is not a tool */
function ActivityRow({ text }: { text: string }) {
	return (
		<div className="flex items-center gap-2">
			<StateMark state="activity" />
			<span className="font-mono text-2xs text-muted/70 leading-3">{text}</span>
		</div>
	);
}

/** the context window folding: a rule you scroll past, with what it cost */
function Compaction({ event }: { event: Extract<AgentEvent, { kind: "compaction" }> }) {
	return (
		<div className="flex items-center gap-2.5">
			<span className="font-mono text-2xs text-muted/60 leading-3">{event.text}</span>
			<span className="h-px min-w-2 flex-1 bg-border" />
			<span className="font-mono text-2xs text-muted/45 leading-3">{event.usage}</span>
		</div>
	);
}

/* ---------- tool cells ----------
 * One row at 300, one cell at 420. The row is the cell with its result line
 * taken away, which is the honest cost of the narrow rail: you keep the path
 * and the count, you lose what came back. */

export const TOOL_W = 30;

export function CellShell({ wide, children }: { wide: boolean; children: React.ReactNode }) {
	return (
		<div
			className={cn(
				"flex min-w-0 items-start gap-2",
				wide ? "rounded-sm bg-surface px-2.5 py-2" : "h-6 items-center",
			)}
		>
			{children}
		</div>
	);
}

export function ToolName({ name }: { name: string }) {
	return (
		<span
			className="shrink-0 font-mono text-2xs text-muted leading-4"
			style={{ minWidth: TOOL_W }}
		>
			{name}
		</span>
	);
}

export function ToolCell({ event, wide }: { event: Extract<AgentEvent, { kind: "tool" }>; wide: boolean }) {
	const detail = event.repainted === undefined ? event.detail : undefined;
	return (
		<CellShell wide={wide}>
			<StateMark state={event.state} className={wide ? "mt-0.5" : undefined} />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex min-w-0 items-baseline gap-2">
					<ToolName name={event.tool} />
					<span className="min-w-0 flex-1 truncate font-mono text-text/85 text-xs leading-4">{event.label}</span>
					{event.diff === undefined ? (
						event.meta === undefined || wide ? null : (
							<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{event.meta}</span>
						)
					) : (
						<span className="shrink-0 font-mono text-2xs leading-3">
							<span className="text-text/80">+{event.diff.added}</span>{" "}
							<span className="text-muted">-{event.diff.removed}</span>
						</span>
					)}
				</div>
				{!wide ? null : event.repainted !== undefined ? (
					<span className="flex items-center gap-1.5" style={{ paddingLeft: TOOL_W + 8 }}>
						<span className="h-1 w-1 shrink-0 rounded-full bg-thread" />
						<span className="truncate font-mono text-2xs text-muted leading-3">{event.repainted} repainted</span>
					</span>
				) : detail === undefined ? null : (
					<span
						className="truncate font-mono text-2xs text-muted/55 leading-3"
						style={{ paddingLeft: TOOL_W + 8 }}
					>
						{detail}
					</span>
				)}
			</div>
		</CellShell>
	);
}

function ErrorRow({ event, wide }: { event: Extract<AgentEvent, { kind: "error" }>; wide: boolean }) {
	return (
		<CellShell wide={wide}>
			<StateMark state="error" className={wide ? "mt-0.5" : undefined} />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex min-w-0 items-baseline gap-2">
					<ToolName name={event.tool} />
					<span className="min-w-0 flex-1 truncate font-mono text-muted text-xs leading-4">{event.label}</span>
					{wide ? null : (
						<span className="shrink-0 font-mono text-2xs text-thread/80 leading-3">{event.message}</span>
					)}
				</div>
				{wide ? (
					<span
						className="truncate font-mono text-2xs text-thread/80 leading-3"
						style={{ paddingLeft: TOOL_W + 8 }}
					>
						{event.message}
					</span>
				) : null}
			</div>
		</CellShell>
	);
}

/**
 * A sub-agent: one nested run, collapsed to its summary. At 420 its children
 * are three rows on the Pages rail's own tree hairline, each with its own state,
 * because parallel work finishes out of order. At 300 the count is all there is
 * room for, and the names only exist out on the canvas.
 */
export function TaskCell({ event, wide }: { event: Extract<AgentEvent, { kind: "task" }>; wide: boolean }) {
	return (
		<CellShell wide={wide}>
			<StateMark state={event.state} className={wide ? "mt-0.5" : undefined} />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex min-w-0 items-baseline gap-2">
					<ToolName name="task" />
					<span className="min-w-0 flex-1 truncate font-mono text-text/85 text-xs leading-4">{event.label}</span>
					<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{event.runs.length} frames</span>
				</div>
				{wide ? (
					<div className="relative flex flex-col pt-0.5" style={{ paddingLeft: TOOL_W + 8 }}>
						<span
							className="absolute top-0 bottom-2 w-px bg-border-raised"
							style={{ left: TOOL_W + 8 }}
						/>
						{event.runs.map((run) => (
							<span key={run.name} className="flex h-[18px] items-center gap-2 pl-2.5">
								<StateMark state={run.state} className="h-2.5 w-2.5" />
								<span className="truncate font-mono text-2xs text-muted leading-3">{run.name}</span>
							</span>
						))}
					</div>
				) : null}
			</div>
		</CellShell>
	);
}

/**
 * A destructive command, waiting. It stays in the transcript rather than taking
 * a dialog, and because the transcript is bottom-anchored it lands right above
 * the hands that have to answer it. Allow and Deny carry the same weight: an
 * `rm -rf` is not the moment to make one button prettier than the other.
 */
export function Approval({ event, wide }: { event: Extract<AgentEvent, { kind: "approval" }>; wide: boolean }) {
	return (
		<div className="relative overflow-hidden rounded-sm bg-surface pr-3 pl-3.5">
			<span className="absolute inset-y-0 left-0 w-[2px] bg-thread" />
			<div className="flex flex-col gap-2.5 py-2.5">
				<div className="flex items-baseline gap-2">
					<span className="font-mono text-2xs text-thread leading-3">approval needed</span>
					<span className="ml-auto font-mono text-2xs text-muted/60 leading-3">{event.tool}</span>
				</div>
				<span
					className={cn(
						"truncate rounded-xs bg-bg px-2 py-1.5 font-mono text-text text-xs leading-4",
						wide ? null : "text-2xs",
					)}
				>
					{event.command}
				</span>
				<div className="flex items-center gap-2">
					<RailButton>Allow</RailButton>
					<RailButton>Deny</RailButton>
				</div>
			</div>
		</div>
	);
}

function RailButton({ children }: { children: React.ReactNode }) {
	return (
		<span className="flex h-[26px] items-center rounded-sm border border-border-raised bg-raised px-3 font-medium text-sm text-text leading-none">
			{children}
		</span>
	);
}

/* ---------- composer ---------- */

function Composer({
	context,
	wide,
	working,
}: {
	context: AgentContext | undefined;
	wide: boolean;
	working: boolean;
}) {
	return (
		<div className={cn("flex shrink-0 flex-col gap-2 border-border border-t", wide ? "p-3.5" : "p-3")}>
			{context === undefined ? null : <ContextChip context={context} />}
			<Field focused={!working} />
			<div className="flex h-5 items-center justify-between">
				<span className="font-mono text-2xs text-muted/50 leading-3">⏎ to send</span>
				{working ? <StopButton /> : null}
			</div>
		</div>
	);
}

/**
 * The chip. This is the whole idea: the selection spool already holds, sitting
 * in the composer, going out with the next message without being asked for. The
 * thread spine is the same accent the selected element wears on the canvas, so
 * the chip and the outline out there are one object.
 */
function ContextChip({ context }: { context: AgentContext }) {
	return (
		<span className="flex h-6 w-fit max-w-full items-center gap-2 overflow-hidden rounded-sm border border-border-raised bg-surface pr-1 pl-2">
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

function Field({ focused }: { focused: boolean }) {
	const still = useReducedMotion() === true;
	return (
		<span
			className={cn(
				"flex h-[34px] items-center gap-px rounded-md border bg-surface px-2.5",
				focused ? "border-border-raised" : "border-border",
			)}
		>
			{focused ? (
				<motion.span
					className="h-3.5 w-[1.5px] shrink-0 rounded-full bg-text"
					animate={still ? undefined : { opacity: [1, 0.1, 1] }}
					transition={still ? undefined : BREATHE}
				/>
			) : null}
			<span className={cn("truncate text-base text-muted/70 leading-base", focused && "pl-1.5")}>
				say what to change
			</span>
		</span>
	);
}

/** a turn in flight has to be interruptible, so stop lives where send would be */
function StopButton() {
	return (
		<span className="flex h-6 items-center gap-2 rounded-sm border border-border-raised bg-raised pr-2 pl-2">
			<span className="h-2 w-2 shrink-0 rounded-[1px] bg-text" />
			<span className="font-mono text-2xs text-text leading-3">stop</span>
			<span className="font-mono text-2xs text-muted/60 leading-3">⎋</span>
		</span>
	);
}
