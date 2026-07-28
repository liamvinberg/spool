import { motion, useReducedMotion } from "motion/react";
import type { Life, Thread } from "../lib/agent-threads";
import { cn } from "../lib/utils";
import { AgentIcon, BackIcon, ConnectionsIcon, PanelCaret } from "./spool-icons";
import { ThreadStrip } from "./spool-thread-strip";

/**
 * The rail's two panes, said in marks rather than words (#144).
 *
 * The row this replaces spends 44px of a 420px column on the words `agent` and
 * `connections`, neither of which ever changes, while #117, #136 and #127 all want
 * the shelf directly under it. So the words go and the marks stay, and the room
 * that frees is the whole point.
 *
 * **The two signals are not the same kind of thing, and that is the answer to
 * separating them.** Connections is a count — the selected frame's outbound links,
 * a number that sits still and is absent when nothing is selected. The agent is
 * liveness — something is turning, something finished and nobody has read it, or
 * nothing. #136 already owns that vocabulary and it is deliberately colourless:
 * motion for working, a solid dot for unread, nothing once read, and never the
 * accent, which belongs to the selection. So the tabs need no new language at all:
 * one carries a number, the other carries a life.
 *
 * **The life is not a second object.** Hung under the glyph as its own small mark it
 * was two things pretending to be one, and it was rejected on sight. The state is the
 * ring *around* the glyph instead: absent at rest, a turning arc while any thread
 * works, a closed circle once something is finished and unread. One measurement
 * forces that geometry — #136's mark is a 9px ring in a 14px box, which is about the
 * floor at which turning still reads as turning, so a state folded into a 3px dot
 * inside the glyph cannot be seen. The candidates and the losers are on the sheet at
 * `agent-nav-marks`; the glyphs that won are the rail drawn as itself and the two
 * frames a connection joins.
 *
 * **Only one of them is ever a number, and that was the complaint.** The count on
 * the rail today is the link count, and it is the only thing a shut rail says, so
 * the agent arriving next to it must not be a second number: two digits stacked in
 * a 44px strip is the one-number-two-jobs problem moved rather than fixed. Drawn
 * that way it read as `2` and `2`. So the agent never counts — its mark says
 * working, unread or nothing, and how many is what the threads strip is for. The
 * links count shows whenever its own list is not the open pane, because the list is
 * the only other place it is said.
 *
 * What this does *not* draw: a fourth life for a turn waiting on an approval.
 * #121 settled that nobody is notified of one, and inventing a badge here would
 * quietly reopen it — but with the agent's mark on screen while the connections
 * pane is open, a thread stopped on a question and a thread working look the same,
 * and that gap is real.
 */

export type Pane = "agent" | "connections";

/** what the two marks have to say for themselves, which is not the same thing twice */
export interface NavSignal {
	/** the deck's aggregate: something turning anywhere, something unread, or nothing */
	readonly life: Life;
	/** the selected frame's outbound links; null is nothing selected, which is a real state */
	readonly links: number | null;
}

/**
 * The deck as one mark. Anything turning wins, because motion is the thing you
 * would want to know from across the room; unread only speaks once everything has
 * stopped. Read is nothing, the same as it is per row.
 */
export function deckSignal(threads: readonly Thread[], links: number | null): NavSignal {
	const working = threads.some((thread) => thread.life === "streaming" || thread.life === "running");
	const unread = threads.some((thread) => thread.life === "unread");
	return { life: working ? "running" : unread ? "unread" : "read", links };
}

const SPIN = { duration: 1.15, repeat: Number.POSITIVE_INFINITY, ease: "linear" as const };

/** the number a cell carries, in the mono the rest of the rail counts in */
function Count({ value }: { value: number }) {
	return <span className="font-mono text-2xs text-muted tabular-nums leading-3">{value}</span>;
}

/**
 * The agent's glyph wearing its own state.
 *
 * A 22px box holding a 12px glyph, with the ring in the 10px of margin that leaves.
 * Nothing at rest, so a quiet rail is quiet; a turning arc while any thread works,
 * which is the same arc, the same speed and the same grey #136's mark turns at; a
 * closed circle once something has finished and nobody has read it, because a shut
 * loop reads as something sitting there and the accent is not available.
 */
export function AgentOrbit({ life }: { life: Life }) {
	const still = useReducedMotion() === true;
	const turning = life === "streaming" || life === "running";
	const held = life === "unread";
	return (
		<span className="relative flex h-[22px] w-[22px] items-center justify-center">
			<AgentIcon className="h-3 w-3" />
			{turning || held ? (
				<motion.svg
					viewBox="0 0 22 22"
					className="absolute inset-0 h-full w-full"
					fill="none"
					aria-hidden="true"
					animate={still || !turning ? undefined : { rotate: 360 }}
					transition={still || !turning ? undefined : SPIN}
				>
					<circle
						cx="11"
						cy="11"
						r="9.6"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeOpacity={turning ? 0.24 : 0.85}
					/>
					{turning ? (
						<path d="M11 1.4A9.6 9.6 0 0 1 20.6 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					) : null}
				</motion.svg>
			) : null}
		</span>
	);
}

/**
 * One pane, as a cell.
 *
 * Which one is open is said in the language of wherever the cell is standing. In
 * the edge strip nothing else claims a bar, so the open pane takes one against the
 * panel it opens, exactly as the word tabs did. In a row it cannot: #136's threads
 * live there and the open thread already owns the bar, so two of them at the same
 * height would say two different things in one gesture. There the cell borrows the
 * tool bar's chip instead — a pane is a mode, and that is how spool already draws
 * a mode being on.
 *
 * The count sits beside its glyph rather than under it, in both orientations, which
 * is where `inspector.tsx:151` already keeps it. Under is where a *state* was tried
 * and rejected; a label is a different thing and does not need its own line.
 *
 * The two cells are deliberately different weights. The agent's is a 22px orbit and
 * connections' is a 14px glyph and a digit, because one of them is a live thing and
 * the other is a fact about whatever is selected.
 */
export function NavCell({
	pane,
	active,
	axis,
	signal,
	onPick,
}: {
	pane: Pane;
	active: boolean;
	/** `row` shares a strip with the threads; `column` stands in the edge strip */
	axis: "row" | "column";
	signal: NavSignal;
	onPick: () => void;
}) {
	const agent = pane === "agent";
	return (
		<button
			type="button"
			aria-label={pane}
			aria-pressed={active}
			onClick={onPick}
			className={cn(
				"relative flex shrink-0 items-center justify-center gap-1 transition-colors duration-150",
				active ? "text-text" : "text-muted/60 hover:text-muted",
				axis === "row" ? cn("h-7 rounded-sm px-1.5", active && "bg-raised") : "h-11 w-11",
			)}
		>
			{agent ? (
				<AgentOrbit life={signal.life} />
			) : (
				<>
					<ConnectionsIcon className="h-3.5 w-3.5" />
					{active || signal.links === null ? null : <Count value={signal.links} />}
				</>
			)}
			{active && axis === "column" ? (
				<span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-thread" />
			) : null}
		</button>
	);
}

/** the caret that shuts the panel, where the word tabs used to keep it */
function ShutCaret({ onShut }: { onShut: () => void }) {
	return (
		<button
			type="button"
			aria-label="Collapse rail"
			onClick={onShut}
			className="flex w-7 shrink-0 items-center justify-center text-muted/60 transition-colors duration-150 hover:text-text"
		>
			<PanelCaret dir="right" className="h-3.5 w-2.5" />
		</button>
	);
}

/**
 * Both panes and every thread in one row (#144).
 *
 * The two rows collapse into one: the panes take the left of it as marks, the
 * threads keep the rest, and the 44px the words were using is the 44px the icons
 * need, so the saving is the whole of #136's strip rather than half of it.
 *
 * The cost is horizontal and it is measured. Two cells, a divider, the plus and the
 * caret leave 250px for names where #136's strip on its own leaves 383, and a name
 * floors at 112, so the strip that carried three carries two. The other cost has no
 * pixels: the threads cannot leave, because they are welded to the tabs. Look at
 * connections and the agent's conversations are still on screen above it, naming
 * something the pane below has nothing to do with.
 */
export function NavRow({
	threads,
	open,
	onOpen,
	pane,
	signal,
	onPane,
	onShut,
}: {
	threads: readonly Thread[];
	open: string;
	onOpen: (id: string) => void;
	pane: Pane;
	signal: NavSignal;
	onPane: (pane: Pane) => void;
	onShut: () => void;
}) {
	return (
		<ThreadStrip
			threads={threads}
			open={open}
			onOpen={onOpen}
			height={44}
			before={
				<div className="flex shrink-0 items-center gap-1 border-border border-r pr-2.5 pl-3">
					<NavCell pane="agent" axis="row" active={pane === "agent"} signal={signal} onPick={() => onPane("agent")} />
					<NavCell
						pane="connections"
						axis="row"
						active={pane === "connections"}
						signal={signal}
						onPick={() => onPane("connections")}
					/>
				</div>
			}
			after={<ShutCaret onShut={onShut} />}
		/>
	);
}

/**
 * The rail is the agent, and connections is somewhere you go (#144).
 *
 * Nothing is a tab. `elements` died and the agent moved into its place, so the two
 * survivors are not peers: the agent is where the work happens and connections is
 * a property of whichever frame is selected, already drawn on the canvas as arrows.
 * So the threads keep their own row at their own height, connections is one mark at
 * the end of it carrying its count, and pressing it pushes a pane over everything
 * with a way back — which is the navigation answer rather than the tab answer.
 *
 * It is the cheapest of the three: one 34px row where there were two rows and 78px,
 * no new furniture, and the panel is undivided. It also keeps more of the strip than
 * the merged row does — 306px for names against 250 — because one mark and a caret
 * are cheaper than two cells and a divider. What it spends is discoverability. The
 * agent has no mark of its own here, because it needs none while you are in it —
 * and the moment you are not, the pane that replaced it is the only thing on
 * screen, so a thread finishing behind your back has nowhere to say so.
 */
export function HostRow({
	threads,
	open,
	onOpen,
	signal,
	onPane,
	onShut,
}: {
	threads: readonly Thread[];
	open: string;
	onOpen: (id: string) => void;
	signal: NavSignal;
	onPane: (pane: Pane) => void;
	onShut: () => void;
}) {
	return (
		<ThreadStrip
			threads={threads}
			open={open}
			onOpen={onOpen}
			after={
				<div className="flex shrink-0 items-center gap-0.5 border-border border-l pr-1 pl-1.5">
					<NavCell pane="connections" axis="row" active={false} signal={signal} onPick={() => onPane("connections")} />
					<ShutCaret onShut={onShut} />
				</div>
			}
		/>
	);
}

/**
 * The panes as an edge strip: 44px of column outside the panel, one cell per pane,
 * the panel's own caret at the foot of it.
 *
 * It is the shape the rail already collapses to, made permanent. That is its
 * argument and its cost in one: the marks survive the panel closing, and 44px of
 * horizontal is spent forever to hold two of them.
 */
export function RailColumn({
	pane,
	signal,
	onPane,
	onToggle,
	divided = true,
}: {
	/** the open pane, or null when the panel is shut and neither is */
	pane: Pane | null;
	signal: NavSignal;
	onPane: (pane: Pane) => void;
	onToggle: () => void;
	/** the strip draws its own left border unless the panel's own edge is already there */
	divided?: boolean | undefined;
}) {
	return (
		<div
			className={cn("flex h-full w-11 shrink-0 flex-col items-center bg-bg pt-1", divided && "border-border border-l")}
		>
			<NavCell pane="agent" axis="column" active={pane === "agent"} signal={signal} onPick={() => onPane("agent")} />
			<NavCell
				pane="connections"
				axis="column"
				active={pane === "connections"}
				signal={signal}
				onPick={() => onPane("connections")}
			/>
			{/* shut, a cell is the way back in — the same one press `inspector.tsx:144`
			    already spends on expanding, so there is no second control to reach for */}
			{pane === null ? null : (
				<button
					type="button"
					aria-label="Collapse rail"
					onClick={onToggle}
					className="mt-auto flex h-11 w-11 items-center justify-center text-muted/60 transition-colors duration-150 hover:text-text"
				>
					<PanelCaret dir="right" className="h-3.5 w-2.5" />
				</button>
			)}
		</div>
	);
}

/**
 * One frame's outbound walks, as `connections.ts` really holds them.
 *
 * The mock this page had been drawing carried a `via` label — the button's own
 * words — and no such field exists: `ConnectionRow` is `{target, page, certainty,
 * verified, missing}`, grouped by the page the target lands on, with an
 * `UnreadableRow` list for walks whose destination the parser cannot read at all.
 *
 * That shape is the argument. Two of these four rows are things **no arrow on this
 * canvas can draw** — `home` is on another page, which is another canvas, and
 * `checkout` is a name nothing answers to — and `connections.ts` says so in its own
 * docstring: this list is the only complete one, and the only home for destinations
 * no arrow can reach. So the pane cannot be replaced by lighting up the canvas, and
 * any proposal that deletes it is deleting the half that matters.
 */
export interface Walk {
	readonly target: string;
	/** the page it lands on; null is a name nothing answers to */
	readonly page: string | null;
	readonly certainty: "will" | "might";
	/** a real session has taken this link since the source last changed */
	readonly verified?: boolean;
}

export const WALKS: readonly Walk[] = [
	{ target: "cart", page: "app", certainty: "will", verified: true },
	{ target: "receipt", page: "app", certainty: "might" },
	{ target: "home", page: "site", certainty: "will" },
	{ target: "checkout", page: null, certainty: "will" },
];

/** a walk this frame declares whose destination cannot be read at all */
const UNREADABLE = "frames/app/menu/frame.tsx:118";

/** the pages a frame's walks land on, in the tree's order, missing last */
function grouped(walks: readonly Walk[]): readonly { page: string | null; rows: readonly Walk[] }[] {
	const pages = [...new Set(walks.map((walk) => walk.page))].filter((page): page is string => page !== null).sort();
	const order: (string | null)[] = walks.some((walk) => walk.page === null) ? [...pages, null] : pages;
	return order.map((page) => ({ page, rows: walks.filter((walk) => walk.page === page) }));
}

/** the outbound list of whatever is selected: the tab the inspector shipped, honestly */
export function ConnectionsBody({ frame }: { frame: string | null }) {
	if (frame === null) {
		return (
			<div className="flex flex-1 items-center justify-center px-8 text-center">
				<span className="font-mono text-2xs text-muted/55 leading-4">select a frame to inspect it</span>
			</div>
		);
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-col gap-1 border-border border-b px-4 py-3">
				<span className="truncate font-mono text-sm text-text leading-sm">{frame}</span>
				<span className="truncate font-mono text-2xs text-muted/60 leading-3">frames/app/{frame}/frame.tsx</span>
			</div>
			<div className="flex items-center justify-between px-4 pt-1 pb-1">
				<span className="font-mono text-2xs text-muted leading-3">connections</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{WALKS.length}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden pb-3">
				{grouped(WALKS).map((group) => (
					<div key={group.page ?? "missing"}>
						<span className="flex h-6 items-center px-4 font-mono text-2xs text-muted/45 leading-3">
							{group.page ?? "nothing answers to"}
						</span>
						{group.rows.map((row) => (
							<div key={row.target} className="flex h-7 items-center gap-2 px-4">
								<span
									className={cn(
										"h-[2px] w-2 shrink-0 bg-thread",
										row.certainty === "might" && "opacity-45",
										row.page === null && "opacity-25",
									)}
								/>
								<span
									className={cn(
										"truncate font-mono text-sm leading-sm",
										row.page === null ? "text-muted/60 line-through" : "text-text",
									)}
								>
									{row.target}
								</span>
								<span className="ml-auto shrink-0 font-mono text-2xs text-muted/60 leading-3">
									{row.page === null ? "missing" : row.certainty === "might" ? "might" : row.verified === true ? "walked" : ""}
								</span>
							</div>
						))}
					</div>
				))}
				<span className="flex h-7 items-center gap-2 px-4 font-mono text-2xs text-muted/45 leading-3">
					unreadable · {UNREADABLE}
				</span>
			</div>
		</div>
	);
}

/** how many walks the pane would list, so a cell can carry the number without opening it */
export function linkCount(frame: string | null): number | null {
	return frame === null ? null : WALKS.length;
}

/**
 * The connections pane's own row, for the variation with no tab row at all: a way
 * back and the name of where you are.
 *
 * This is the one shape that answers switching with navigation rather than with
 * tabs. It costs the same 34px the strip it replaced was using, and it is only
 * honest while there are two panes: a third would make this a stack of screens in
 * a 420px column, which is a phone.
 */
export function PaneBack({ label, onBack }: { label: string; onBack: () => void }) {
	return (
		<div className="flex h-[34px] shrink-0 items-center gap-2 border-border border-b px-3.5">
			<button
				type="button"
				onClick={onBack}
				aria-label="Back to the agent"
				className="flex items-center gap-2 text-muted transition-colors duration-150 hover:text-text"
			>
				<BackIcon className="h-3 w-3" />
				<span className="font-mono text-sm text-text leading-4">{label}</span>
			</button>
		</div>
	);
}
