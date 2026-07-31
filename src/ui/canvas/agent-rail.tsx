import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ATTACHMENT_MEDIA, type Attachment, isSendableAttachment } from "../../attachment";
import type { AgentReply } from "../../daemon/agent-control";
import type { AgentLimit } from "../../daemon/agent-events";
import type { SelectionEntry } from "../api";
import { cn } from "../cn";
import { AgentIcon, CloseIcon, PlusIcon } from "../icons";
import { type Chip as ChipWords, composerWidth, contextOf, type Strip, stripOf, WHOLE_SELECTION } from "./agent-chips";
import { limitReadout } from "./agent-limit";
import { closedText } from "./agent-markers";
import { type AgentModelDeck, menuLongest, menuSays } from "./agent-model";
import type { InstallDeck, LoginDeck } from "./agent-preflight";
import { type AgentHandback, type AgentQueued, handedBack, handedBackReference } from "./agent-queue";
import { Caret, Said } from "./agent-said";
import { Lightbox, Shot } from "./agent-shot";
import type { TurnPhase } from "./agent-stream";
import { type Life, type Thread, UNSAID } from "./agent-threads";
import {
	type AgentEntry,
	type AgentPlan,
	type AgentRow,
	type AgentSent,
	duration,
	type RowState,
	shownBy,
} from "./agent-transcript";
import { ageOf } from "./frame-find";
import { COLLAPSED_BELOW, MAX_WIDTH, STRIP_WIDTH, settledWidth, useRailWidth } from "./rail-width";
import { ChevronIcon, PanelCaret } from "./sidebar";

/**
 * The agent rail (#144, #192, #193, #194): the right rail, whole, drawn as one
 * conversation.
 *
 * There is no tab row. The agent owns this column — `elements` died with the
 * inspector and `connections` left for the ambient walk layer — so the rail is the
 * transcript and the composer and nothing between them. What that buys is the width:
 * at 420 a tab row is a whole line of a narrow column spent saying which of two
 * things you are looking at, and there is only one thing to look at.
 *
 * Four things render and nothing else: the plan, the human's words, the agent's
 * words, and one line per tool call. The wait before the first token and the model's
 * own thinking render nothing. Threads, chips and the model readout are later
 * tickets, and this reads correctly without them.
 *
 * One line is the rule, and the test for the exception is whether the thing outlives
 * the call that made it. A row is a mark, a verb and a subject, with everything else
 * behind a disclosure closed by default that nobody has to open — so a nine-minute
 * turn is still something to skim, and the detail is one click down rather than in
 * the way. The plan is the one thing that earns a place off the line, because it goes
 * on changing for the rest of the turn; a screenshot does not, so it is a real
 * thumbnail behind a disclosure.
 *
 * The name is the place and the rest of the row is still the call. Clicking a frame's
 * name takes the canvas there; the verb, the count and the disclosure open the
 * detail. The click had to be split because the disclosure already owned it.
 *
 * State is motion, not colour. A row is running while a colourless ring turns and
 * settled once a stroke has drawn itself through the space it leaves. The accent
 * stays with the selection, which is the one thing on screen the human owns.
 */

/**
 * The rail's default, inside the drag range it has always had.
 *
 * `inspector.tsx` shipped 300 in the same 200–480 range; #144 moved the default to
 * 420 because the transcript is a column of prose rather than a list of names.
 * Nothing below may assume it: the range is the constraint every later footer and
 * strip decision is measured against.
 */
const RAIL_WIDTH = 420;

/** clear of the top fade, so an anchored first line is not dimmed by it */
const TOP_INSET = 10;

/** the mark's own width and the gap beside it, so a disclosure lines up under the verb */
const INDENT = 14 + 10;

/**
 * How much of an arriving message is still treated as live, in drawn characters.
 *
 * About a second at the measured 171 characters a second, which is longer than the
 * arrival animation, so a word always finishes before it stops being live.
 */
const LIVE_TAIL = 150;

const MIN_H = 60;
const MAX_H = 160;

/**
 * What a row can do about the frame it names (#143, #194).
 *
 * Absence is handed in rather than inferred, because two states look identical from
 * inside the rail and read as opposites: a frame the turn is one beat from writing,
 * and a frame the project had and lost. Only the second is struck, so only the canvas
 * can tell them apart — it is the thing that watched the folder.
 */
export interface FrameJump {
	/** the frames the project has right now; a name outside this is not a place to go */
	readonly have: ReadonlySet<string>;
	/** the frames it had and no longer has, which read as gone and do nothing */
	readonly gone: ReadonlySet<string>;
	/** the cursor is on a row naming this frame, or has left; answered out on the canvas */
	readonly onPoint: (frame: string | null) => void;
	readonly onJump: (frame: string) => void;
}

/**
 * What the hands are pointing at, and what the strip may do about it (#116, #139).
 *
 * The entries are the daemon's own enriched list rather than the canvas's raw
 * selection, because the strip is the promise of what the prompt will carry: what
 * is drawn here and what goes out are one list read twice.
 */
export interface Pointing {
	readonly entries: readonly SelectionEntry[];
	/**
	 * The list is the frame the hands stepped into rather than one they picked.
	 *
	 * It draws as an ordinary chip at full strength with the dismiss control taken
	 * off: entering is the most specific act the canvas has, and out there the only
	 * way to stop pointing at the frame you are inside is a mode change.
	 */
	readonly inside: boolean;
	/** the entry the pointer is over, in the rail or out on the canvas */
	readonly lit: string | null;
	readonly onLight: (id: string | null) => void;
	/** null drops the whole selection, which is the count chip's own ✕ */
	readonly onDrop: (id: string | null) => void;
}

/**
 * The conversations this project has, and what the column may do about them (#136, #205).
 *
 * One bundle rather than six props for the reason `Pointing` and `FrameJump` are: they
 * arrive together, they change together, and the deck upstream already holds them as one
 * object. The column and the nameplate both take the whole of it, because which thread is
 * open is a fact about the deck rather than a string either of them could be handed.
 */
export interface Threads {
	readonly list: readonly Thread[];
	readonly open: string;
	/**
	 * The open thread has a picture and no session left to continue it (#120).
	 *
	 * It reads as finished: nothing offers a resume that would fail, and the composer says
	 * what the next thing said will actually do, which is start a new thread.
	 */
	readonly finished: boolean;
	/** a press on a cell, which reads the thread and moves nothing else */
	readonly onOpen: (id: string) => void;
	/** the ✕ in the flyout: it leaves the column, and neither the session nor the picture goes */
	readonly onClose: (id: string) => void;
	/** the plus that leads the column */
	readonly onNew: () => void;
}

/**
 * What the composer is holding for one thread: unsent words and a reference.
 *
 * Per thread, because words nobody has sent belong to the conversation they were written
 * for. Switching a thread to check on something must not throw a half-typed sentence away,
 * and must not carry it into somebody else's transcript either.
 */
interface Holding {
	readonly draft: string;
	readonly attached: Attachment | null;
}

const EMPTY: Holding = { draft: "", attached: null };

export function AgentRail({
	entries,
	plan,
	phase,
	elapsed,
	jump,
	pointing,
	threads,
	install,
	login,
	queued,
	handback,
	model,
	limit,
	onSend,
	onQueue,
	onUnqueue,
	onStop,
	onAnswer,
}: {
	entries: readonly AgentEntry[];
	/** the plan, off the log and onto the shelf; absent until the turn writes one */
	plan: AgentPlan | null;
	phase: TurnPhase;
	elapsed: number;
	jump: FrameJump;
	pointing: Pointing;
	/** every conversation this project has, newest first (#136, #200) */
	threads: Threads;
	/** whether there is an agent on this machine at all, and the look that says so (#201) */
	install: InstallDeck;
	/** the agent would not start because nobody is signed in, and the way out (#201) */
	login: LoginDeck;
	/** what spool is holding until this turn ends, in the order it will fire (#170) */
	queued: readonly AgentQueued[];
	/** whatever left the queue un-fired, for the box below to take back (#170) */
	handback: AgentHandback;
	/** which machine is answering, and the list the binary offered instead (#118, #199) */
	model: AgentModelDeck;
	/** the usage window, absent until the binary warns, which is most of a session (#122) */
	limit: AgentLimit | null;
	onSend: (text: string, sent: AgentSent) => void;
	/** Enter against a running turn: the words are taken and held rather than sent */
	onQueue: (text: string, sent: AgentSent) => void;
	onUnqueue: (id: string) => void;
	/** the press in the footer and the escape in the field, which are one act (#165) */
	onStop: () => void;
	/** what the person said to a waiting request, on its own way back up (#145) */
	onAnswer: (request: string, reply: AgentReply) => void;
}) {
	const [width, setWidth] = useRailWidth("agent", RAIL_WIDTH);
	/** how many sends this rail has watched go out, which is the log's cue to follow again */
	const [spoke, setSpoke] = useState(0);
	/**
	 * What the composer is holding, lifted out of it because two things write here
	 * (#170).
	 *
	 * A take-back drops one message into the field it is sitting on, and a stop hands
	 * back everything the queue held — and a stop can arrive from the canvas, where the
	 * hands are watching a frame repaint and the box is nowhere near the press. So the
	 * draft is the rail's and the field is controlled.
	 *
	 * It is held per thread, because words nobody has sent belong to the conversation they
	 * were written for: switching threads to check on something must not throw away a
	 * half-typed sentence, and must not carry it into somebody else's transcript either.
	 */
	const open = threads.open;
	const [held, setHeld] = useState<Readonly<Record<string, Holding>>>({});
	const holding = held[open] ?? EMPTY;
	const write = (patch: (was: Holding) => Holding) =>
		setHeld((all) => ({ ...all, [open]: patch(all[open] ?? EMPTY) }));
	/** the handovers already merged per thread, since the same words can come back twice */
	const merged = useRef(new Map<string, number>());
	useEffect(() => {
		if (handback.count === (merged.current.get(open) ?? 0)) return;
		merged.current.set(open, handback.count);
		setHeld((all) => {
			const was = all[open] ?? EMPTY;
			return {
				...all,
				[open]: {
					draft: handedBack(
						handback.messages.map((one) => one.text),
						was.draft,
					),
					attached: handedBackReference(handback.messages, was.attached),
				},
			};
		});
	}, [handback, open]);
	/**
	 * The question the composer would answer, read off the log rather than handed in.
	 *
	 * A question only, never an approval. Prose is an answer to a question — it becomes
	 * the response the tool tests first — and there is no sentence that answers "may I
	 * run this": typing one at an approval would let the call through carrying the words
	 * as a spare argument, which is the opposite of what somebody writing "wait, don't"
	 * means. An approval is answered by pressing one of its three, and by nothing else.
	 */
	const asking = entries.find((entry) => entry.kind === "ask" && entry.state === "open" && entry.question);
	/**
	 * How long the request now out has been silent, which is the one thing the stroke
	 * reads (#231).
	 *
	 * Off the receipt rather than off a clock of the composer's own, because the receipt
	 * is already the authority on when a request went out and when it stopped being
	 * silent. A settled one is not silence any more and contributes nothing.
	 */
	const outstanding = entries.find(
		(entry): entry is Extract<AgentEntry, { kind: "wait" }> =>
			entry.kind === "wait" && entry.state === "running" && entry.ms === null,
	);
	const waited = outstanding === undefined ? 0 : Math.max(0, elapsed - outstanding.at);
	/** what the panel has left once the column has taken its 34, which two things measure */
	const panel = width - SPINE_W;
	const [dragging, setDragging] = useState(false);
	const drag = useRef<{ pointerId: number; startWidth: number; startX: number; latestWidth: number } | null>(null);
	const collapsed = width <= COLLAPSED_BELOW;

	function finishDrag(target: HTMLElement, pointerId: number) {
		const current = drag.current;
		if (current === null || current.pointerId !== pointerId) return;
		target.releasePointerCapture(pointerId);
		drag.current = null;
		setDragging(false);
		setWidth(settledWidth(current.latestWidth));
	}

	return (
		<aside
			aria-label="Agent"
			data-agent-rail=""
			style={{ width }}
			className={cn(
				"relative z-20 h-full shrink-0 overflow-hidden border-border border-l bg-bg",
				dragging
					? ""
					: "transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
			)}
			onPointerDown={(event) => event.stopPropagation()}
			onPointerMove={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onContextMenu={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
		>
			{collapsed ? (
				<div className="flex h-full w-11 flex-col items-center">
					<button
						type="button"
						aria-label="Expand agent"
						onClick={() => setWidth(RAIL_WIDTH)}
						className="flex h-11 w-11 items-center justify-center text-muted/70 hover:text-text"
					>
						<AgentIcon />
					</button>
				</div>
			) : install.missing ? (
				/*
				 * There is nothing to spawn, and spool knew it before anybody typed (#201).
				 *
				 * The wall takes the transcript's place and the composer stays, dead. The rest of
				 * the shelf goes with the transcript: a plan belongs to a turn, and a thread is a
				 * conversation you cannot continue on a machine with no agent on it.
				 */
				<div className="flex h-full min-w-[200px] flex-col">
					<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
						<InstallWall install={install} />
						{/* the wall has no nameplate to ride, so here alone the caret floats */}
						<CollapseCaret onCollapse={() => setWidth(STRIP_WIDTH)} className="absolute top-2 right-2 z-10" />
					</div>
					<DeadComposer />
				</div>
			) : (
				/*
				 * The rail is a panel and a column beside it (#205).
				 *
				 * The threads are 34px of the rail's own width down its outer edge rather than a
				 * line of its height above the log, which is the axis a rail has spare. The panel
				 * is everything one conversation is and the column is every conversation there is,
				 * and a press on the column changes only the panel.
				 */
				<div className="flex h-full min-w-[200px]">
					<div className="flex min-w-0 flex-1 flex-col">
						{/* the nameplate leads the shelf, because it says which thread everything
						    under it belongs to */}
						<Nameplate threads={threads} onCollapse={() => setWidth(STRIP_WIDTH)} />
						{/* the standing half of being signed out, on the shelf the plan would take —
						    and they never want it at once, because a plan belongs to a turn that is
						    running and this exists precisely because none can (#201) */}
						{login.out ? <LoginStrip login={login} /> : null}
						{plan === null ? null : <PlanStrip plan={plan} />}
						<Transcript
							entries={entries}
							live={phase === "playing"}
							spoke={spoke}
							elapsed={elapsed}
							jump={jump}
							onAnswer={onAnswer}
						/>
						{/* the strip is measured against the composer's own inner width, which is the
						    rail's drag less the column standing beside it: the same three chips fit at
						    420 and are a count at the 200 floor, because the rule is one line rather
						    than one width */}
						<Composer
							phase={phase}
							waited={waited}
							finished={threads.finished}
							answering={asking?.kind === "ask" ? asking.request : null}
							strip={stripOf(pointing.entries, composerWidth(panel), pointing.inside)}
							pointing={pointing}
							draft={holding.draft}
							onDraft={(draft) => write((was) => ({ ...was, draft }))}
							attached={holding.attached}
							onAttach={(attached) => write((was) => ({ ...was, attached }))}
							queued={queued}
							model={model}
							limit={limit}
							onSend={(text, sent) => {
								setSpoke((count) => count + 1);
								onSend(text, sent);
							}}
							onQueue={onQueue}
							onUnqueue={onUnqueue}
							onStop={onStop}
							onAnswer={onAnswer}
						/>
					</div>
					<Spine threads={threads} room={panel} />
				</div>
			)}

			<button
				type="button"
				aria-label="Resize agent"
				onKeyDown={(event) => {
					// a focused grip answers its arrows itself; stop them short of the hotkey
					// dispatch, or the same press would nudge the selection
					if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
					event.stopPropagation();
					if (event.key === "ArrowLeft") setWidth(RAIL_WIDTH);
					if (event.key === "ArrowRight") setWidth(STRIP_WIDTH);
				}}
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					drag.current = {
						pointerId: event.pointerId,
						startWidth: width,
						startX: event.clientX,
						latestWidth: width,
					};
					setDragging(true);
				}}
				onPointerMove={(event) => {
					const current = drag.current;
					if (current === null || current.pointerId !== event.pointerId) return;
					const next = Math.min(
						MAX_WIDTH,
						Math.max(STRIP_WIDTH, current.startWidth + current.startX - event.clientX),
					);
					current.latestWidth = next;
					setWidth(next);
				}}
				onPointerUp={(event) => finishDrag(event.currentTarget, event.pointerId)}
				onPointerCancel={(event) => finishDrag(event.currentTarget, event.pointerId)}
				className="group -left-1.5 absolute top-0 z-30 h-full w-3 cursor-col-resize touch-none outline-none"
			>
				<span className="absolute top-0 right-[5px] bottom-0 w-px bg-transparent group-hover:bg-thread group-focus-visible:bg-thread" />
			</button>
		</aside>
	);
}

/* ---------- the threads, in a column down the rail's outer edge (#136, #161, #200, #205) ----------
 * Every conversation on screen at once, in a rail with no room for their names — so the
 * column stops spending width on them. The strip's break was always width: #136 measured
 * four names at 112px each and called that the floor, and #144 kept the bet by collapsing
 * everything unopened to a mark, which buys the room back and spends the names to do it.
 * Turned ninety degrees the constraint is gone rather than traded. The rail is as tall as
 * the window and a cell is 34, so a dozen threads is a third of an ordinary screen and a
 * hundred scroll a column that had the room to scroll.
 *
 * It stands on the *outer* edge on purpose. The inner edge is the drag handle, a 12px
 * column with pointer capture on it, and the outer edge is the one the rail collapses onto
 * at `STRIP_WIDTH` — so the column and the shut rail want the same edge rather than two
 * different ones. **The strip does not draw the column**: shutting the rail is asking for
 * the canvas back, and it stays the one control that opens it again. The 34 comes out of
 * the rail's own width rather than being added beside it, at every width, and the honest
 * squeeze is the 200 floor.
 *
 * **Nothing in the column is a name, and the flyout is the whole of the answer.** Hover a
 * cell and the thread arrives to the left of it over the log: what it is called, the last
 * line it drew, its age and its ✕. A press opens it. The ✕ has nowhere else to be — a 34px
 * cell holding a 14px mark and a 14px close would be two hit targets four pixels apart — so
 * a close is a deliberate act inside the flyout rather than a hover-reveal on the cell.
 *
 * The plus leads, at the top, for #144's reason turned ninety degrees: a column is read
 * downward, so *new* belongs above the newest rather than below the oldest.
 *
 * The second cost is the real one and it is on screen: twelve read threads are twelve
 * identical blank cells. This bets that the job here is *what is moving now*, which a column
 * answers at a glance, and that finding one two-hour-old conversation is a different job it
 * does through the hover.
 *
 * Nothing is coloured and nothing re-sorts. State in this rail is motion, the one accent
 * belongs to the selection, and the order is recency fixed once — a column that re-sorted
 * as its threads worked would move a cell out from under a cursor already reaching for it.
 */

/** the column's width, and every cell is square in it */
const SPINE_W = 34;

/** what the flyout wants, and what it settles for once the rail is dragged narrow */
const FLYOUT_W = 268;

/**
 * The tallest the flyout gets, which is what the last cell's is held above the floor by.
 *
 * An upper bound rather than a measurement: the name wraps and a name is at most two frames
 * and a count, which is three lines of mono at the narrowest rail the panel allows. Reserving
 * the tall case costs a cell near the bottom a few pixels of lift and nothing else, where
 * measuring the box would cost a second layout pass on every hover.
 */
const FLYOUT_H = 128;

/** which thread the pointer is asking about, where its flyout goes, and when it asked */
interface Hovered {
	readonly id: string;
	readonly top: number;
	/** how far in from the window's right edge the flyout ends, which is the column's left edge */
	readonly right: number;
	/** the clock read at the hover, because that is the moment the age is about */
	readonly now: number;
}

/**
 * Where a cell's flyout goes, measured off the cell rather than counted off its index.
 *
 * An index is the right answer only while the column has never scrolled, which is the one
 * case this column exists to survive: past the cells that fit, a thread's place in the list
 * and its place on the screen are different numbers. So the cell is asked where it is, and
 * the flyout is held clear of the bottom edge from there.
 *
 * The numbers are the window's rather than the column's because the flyout is `fixed` (#207):
 * it belongs to its cell in the tree, so the caret reaches the close from the cell it is on,
 * and the scroller its cell lives in would otherwise clip it away entirely.
 */
/** whether focus landed inside a flyout, which is the one place a cell may lose it to */
const inFlyout = (target: EventTarget | null): boolean =>
	target instanceof Element && target.closest("[data-agent-flyout]") !== null;

function flyoutAt(cell: HTMLElement, column: HTMLElement | null): { top: number; right: number } {
	if (column === null) return { top: 0, right: 0 };
	const box = column.getBoundingClientRect();
	const wanted = cell.getBoundingClientRect().top;
	return {
		top: Math.max(box.top, Math.min(wanted, box.bottom - FLYOUT_H)),
		right: Math.max(0, window.innerWidth - box.left),
	};
}

function Spine({ threads, room }: { threads: Threads; room: number }) {
	const { list, open, onOpen, onClose, onNew } = threads;
	const column = useRef<HTMLDivElement>(null);
	const [over, setOver] = useState<Hovered | null>(null);
	/** the cell the open flyout was measured off, so a scroll can measure it again */
	const asked = useRef<HTMLElement | null>(null);
	/** the pointer and the caret ask the same question, and it is answered the same way */
	const ask = (id: string) => (event: { currentTarget: HTMLElement }) => {
		asked.current = event.currentTarget;
		setOver({ id, now: Date.now(), ...flyoutAt(event.currentTarget, column.current) });
	};

	return (
		// the flyout is a child, so moving the pointer off a cell and onto it never leaves
		// the column and never closes the thing being reached for
		// biome-ignore lint/a11y/noStaticElementInteractions: the handler only takes the hover surface away again; every control in the column is a button
		<div
			ref={column}
			data-agent-threads=""
			className="relative flex shrink-0 flex-col border-border border-l"
			style={{ width: SPINE_W }}
			onMouseLeave={() => setOver(null)}
		>
			<button
				type="button"
				aria-label="New thread"
				onClick={onNew}
				className="flex h-[34px] shrink-0 items-center justify-center border-border border-b text-muted/45 transition-colors duration-150 hover:text-text"
			>
				<PlusIcon />
			</button>
			<div
				className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				// a fixed box does not travel with the cell it belongs to, so the cell is asked
				// again where it is rather than the flyout being taken away mid-read
				onScroll={() => {
					const cell = asked.current;
					if (cell === null) return;
					setOver((was) => (was === null ? was : { ...was, ...flyoutAt(cell, column.current) }));
				}}
			>
				{list.map((thread) => {
					const on = thread.id === open;
					return (
						<Fragment key={thread.id}>
							<button
								type="button"
								data-agent-thread={thread.name}
								data-agent-thread-life={thread.life}
								aria-label={thread.name}
								aria-current={on ? "true" : undefined}
								onMouseEnter={ask(thread.id)}
								onFocus={ask(thread.id)}
								// a caret leaving takes the flyout it opened with it, and only that one:
								// the pointer may be somewhere else by now, and it asked more recently. Its
								// own flyout is not leaving: that is where the close it reached for is (#207)
								onBlur={(event) => {
									if (inFlyout(event.relatedTarget)) return;
									setOver((was) => (was?.id === thread.id ? null : was));
								}}
								onClick={() => onOpen(thread.id)}
								className={cn(
									"relative flex h-[34px] shrink-0 items-center justify-center transition-colors duration-150",
									on ? "bg-surface/70" : "hover:bg-surface/40",
								)}
							>
								{/* the accent says which one is open, exactly as the tab's underline did, and it
							    faces the panel it owns. With one thread there is no which, so it draws none */}
								{on && list.length > 1 ? (
									<span className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-thread" />
								) : null}
								<ThreadMark life={thread.life} />
							</button>
							{over?.id === thread.id ? (
								<Flyout
									thread={thread}
									top={over.top}
									right={over.right}
									now={over.now}
									room={room}
									onClose={() => onClose(thread.id)}
									onLeave={() => setOver((was) => (was?.id === thread.id ? null : was))}
								/>
							) : null}
						</Fragment>
					);
				})}
			</div>
		</div>
	);
}

/**
 * The thread, at the width a name needs, for exactly as long as you are asking for it.
 *
 * It reaches left over the log rather than right off the window, and it is clamped to the
 * column so the last cell's flyout does not hang off the bottom. The name wraps rather than
 * truncating, because a name made of several frames is the case worth reading whole; the
 * line under it is the last thing the thread drew, in the rail's own nouns.
 *
 * Its width is the room there is rather than a constant. The rail is draggable and it
 * clips: 268 sits inside the 420 default with the column already paid for, and at the 200
 * floor a flyout that kept it would be cut in half by the edge it hangs over.
 *
 * It sits in its own cell's markup and is placed against the window rather than the column,
 * because the two ways to reach it want opposite things (#207). The pointer wants it clear of
 * the scroller, which clips anything hanging out of its side; the caret wants it next after
 * the cell, which is the only ordering that puts the close one tab away. A `fixed` box in the
 * cell's own subtree is both, and it costs the assumption that nothing above the rail makes a
 * containing block — nothing does, and a transform anywhere over it would be visible at once.
 */
function Flyout({
	thread,
	top,
	right,
	now,
	room,
	onClose,
	onLeave,
}: {
	thread: Thread;
	top: number;
	right: number;
	now: number;
	/** what the panel has left, which is as wide as this may get */
	room: number;
	onClose: () => void;
	/** the caret left the flyout for something that is not in it */
	onLeave: () => void;
}) {
	return (
		<div
			data-agent-flyout={thread.name}
			className="fixed z-20 border border-border-raised bg-surface px-3 py-2.5"
			style={{ top, right, width: Math.min(FLYOUT_W, room) }}
		>
			<p className="font-mono text-sm text-text leading-4">{thread.name}</p>
			<div className="mt-1.5 flex items-center gap-2">
				<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/60 leading-3">
					{thread.last === "" ? "nothing yet" : thread.last}
				</span>
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{ageOf(thread.at, now)}</span>
				{/* a close is a tidy rather than a delete: neither the agent's own session nor
				    spool's stored picture goes with the cell */}
				<button
					type="button"
					data-agent-thread-close={thread.name}
					aria-label={`close ${thread.name}`}
					onClick={onClose}
					// the only thing in here a caret can hold, so its leaving is the flyout's
					onBlur={onLeave}
					className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted/45 transition-colors duration-150 hover:text-text"
				>
					<CloseIcon />
				</button>
			</div>
		</div>
	);
}

/**
 * The name of the thread you are in, and the only place it is written (#205).
 *
 * The obvious home for a title is the head of the log, the way a document carries one. The
 * transcript will not have it: it is bottom-anchored by design, so the first thing in a
 * conversation longer than the box is above the box, and a title you cannot see is not a
 * title. So the name is chrome after all, at the plan strip's own 34px.
 *
 * It is a label rather than a control. A name is derived from what the thread wrote and
 * recomputed on every read, so there is nothing here for a press to change: a rename would
 * be a second name stored beside the one the work already says, and the first write after
 * it would put the two out of step.
 *
 * Mono throughout, because a derived name is machine text — it is the frames the thread
 * wrote. A thread that has written none is still its ask, and it keeps the one register
 * rather than changing typeface the moment it writes its first frame; the row this replaced
 * drew the ask in mono for its whole life, so nothing about a sentence in here is new. One
 * that has said nothing at all is dimmed, because that is the machine saying there is
 * nothing to say yet rather than a name anybody chose.
 */
function Nameplate({ threads, onCollapse }: { threads: Threads; onCollapse: () => void }) {
	const name = threads.list.find((thread) => thread.id === threads.open)?.name ?? UNSAID;
	return (
		<div data-agent-nameplate="" className="flex h-[34px] shrink-0 items-center gap-2 border-border border-b px-3.5">
			<span
				className={cn(
					"min-w-0 flex-1 truncate font-mono text-sm leading-4",
					name === UNSAID ? "text-muted/60" : "text-text",
				)}
			>
				{name}
			</span>
			<CollapseCaret onCollapse={onCollapse} className="-mr-1.5 h-6 w-6" />
		</div>
	);
}

/**
 * What a thread is doing, in the smallest thing that can say it (#161).
 *
 * The box is always 14px whatever is inside it, so every cell in the column draws its mark
 * in the same place and a mark appearing never moves the one below it.
 *
 * Four readings of five lives. Streaming draws nothing and keeps the cell aligned: the
 * transcript beside it is already a turning mark and a live edge, so a second spinner on
 * the cell naming the thread you are watching says nothing the screen does not. Running turns,
 * colourless, because state in this rail is motion and the one accent belongs to the
 * selection. Waiting is `unread`'s disc held inside `running`'s ring — the turn that
 * stopped, with the thing that stopped it sitting in it — and it is the loudest of the
 * three on purpose, because it is the only one of them that is actually stuck. Unread is a
 * solid dot at text strength, the way a mailbox says it. Read is a hollow one.
 *
 * Two candidates for waiting died on facts rather than taste. Freezing the spinner is
 * pixel-identical to what `prefers-reduced-motion` already renders for a working thread,
 * so it would be working's drawing with a second meaning for every reduced-motion reader.
 * Borrowing the disc alone breaks on the clearing rule: a disc clears when you open the
 * thread and a question does not, so a strip that spent it here would go quiet about a
 * thread that will never finish.
 *
 * `read` is the one departure, and it is #144's own carried into the column: out here the
 * mark *is* the thread, and a thread you cannot see is a thread you cannot press, so read
 * is a hollow dot at the strength a disabled thing gets rather than nothing at all.
 */
function ThreadMark({ life }: { life: Life }) {
	// the thread you are watching turns the same ring as the ones you are not: the two
	// lives are one drawing, and they are separate lives only because `streaming` is a
	// fact about this browser and never reaches disk
	const turning = life === "streaming" || life === "running";
	return (
		<span data-agent-mark={life} className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
			{turning ? (
				<svg
					viewBox="0 0 14 14"
					className="h-3.5 w-3.5 animate-agent-spin text-text/60"
					fill="none"
					aria-hidden="true"
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				</svg>
			) : life === "waiting" ? (
				// the same ring working turns, at rest and dimmed so the disc reads as the thing
				// in it rather than as a second object beside it
				<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 text-text/85" fill="none" aria-hidden="true">
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
					<circle cx="7" cy="7" r="2.2" fill="currentColor" />
				</svg>
			) : life === "unread" ? (
				<span className="h-[5px] w-[5px] rounded-full bg-text/85" />
			) : life === "read" ? (
				<span className="h-[5px] w-[5px] rounded-full border border-muted/45" />
			) : null}
		</span>
	);
}

/**
 * The way back to the strip.
 *
 * It rides the nameplate's own row rather than a line of its own. #144's finding still
 * holds — a line of a 420px column is too expensive to spend on chrome — and the
 * nameplate is already spending that line, so the caret costs nothing by sitting at the
 * end of it. Floating it over the log's top fade cost nothing either, but it put a
 * control inside the reading surface, where it hung over whichever entry happened to
 * scroll under it. Chrome belongs on the chrome row. The wall keeps the floating
 * placement, because it has no nameplate and a rail you cannot collapse is a rail that
 * has taken the column hostage over a state nobody caused.
 */
function CollapseCaret({ onCollapse, className }: { onCollapse: () => void; className?: string }) {
	return (
		<button
			type="button"
			aria-label="Collapse agent"
			onClick={onCollapse}
			className={cn(
				"flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted/40 transition-colors hover:text-text",
				className,
			)}
		>
			<PanelCaret dir="right" className="h-3.5 w-2.5" />
		</button>
	);
}

/* ---------- the agent that is not there (#127, #201) ----------
 * Two surfaces, and they are different shapes because the two states are known in
 * different ways. A missing binary is a fact about this machine, true before anyone
 * types, so it takes the transcript's place. A bad login is a fact inside another
 * product, so it is a standing strip over a log that still works.
 *
 * Neither is coloured. There is one accent in this product and it means a chip in the
 * composer and a box out on the canvas are the same object; spending it on a state that
 * is not even a failure — you have not installed something yet — would break the only
 * thing it says. Both step forward in brightness, which is the whole of the emphasis the
 * rest of the rail uses. */

/** the binary's own docs root, as it links it itself */
const DOCS = "code.claude.com/docs";

/**
 * Ask again: one control, in the rail's own weight, for both of these states.
 *
 * Mono, small, and no border until you are on it. The rail has exactly one filled control
 * anywhere — the composer — and neither of these states is the place to introduce a second.
 * It says what it is doing rather than what it is for while a check is out, because that
 * is the only thing on screen saying the press landed.
 */
function Quiet({ busy, onClick }: { busy: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			data-agent-check=""
			onClick={onClick}
			className="-mr-1.5 flex h-6 shrink-0 items-center gap-2 rounded-sm px-1.5 font-mono text-2xs text-text/70 leading-3 transition-colors duration-150 hover:bg-surface hover:text-text"
		>
			{busy ? (
				<svg
					viewBox="0 0 14 14"
					className="h-3 w-3 shrink-0 animate-agent-spin text-muted/60"
					fill="none"
					aria-hidden="true"
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				</svg>
			) : null}
			{busy ? "looking" : "check again"}
		</button>
	);
}

/**
 * Nothing to spawn.
 *
 * The composer stays, and it is dead. Removing it would leave the rail as a sentence with
 * no evidence of what the rail is for; leaving it live would collect a prompt for nobody.
 * So it sits there at its resting height, dimmed, saying what it will say once there is
 * something behind it — the one thing a wall owes you past the bad news is a picture of
 * the good state.
 *
 * The threads go with the transcript, column and nameplate both. A conversation you cannot
 * continue is not something to switch to, and the wall is the whole of the rail's body
 * while it is up.
 *
 * The words are not spool's where they do not have to be: `code.claude.com/docs` is the
 * docs root the binary links itself. What spool writes is the sentence about why there is
 * nothing here, because that sentence is about spool.
 */
function InstallWall({ install }: { install: InstallDeck }) {
	return (
		<div data-agent-wall="" className="flex min-h-0 flex-1 flex-col justify-center px-3.5">
			<div className="animate-agent-entry flex flex-col gap-3">
				<p className="text-base text-text leading-base">no claude on this machine</p>
				<p className="text-base text-muted leading-base">
					Spool runs the agent you already have, with the login you already made. There is nothing here to run yet.
				</p>
				<div className="flex flex-col gap-1.5 pt-1">
					<div className="flex items-center justify-between">
						<span className="font-mono text-2xs text-muted/45 leading-4">{DOCS}</span>
						<Quiet busy={install.checking} onClick={install.look} />
					</div>
					{/* the check is allowed to fail forever, and a press that leaves no mark reads
					    as a broken button — so it leaves one line, in the composer's own mono */}
					{install.foundNothing ? (
						<span data-agent-looked="" className="animate-agent-entry font-mono text-2xs text-muted/45 leading-4">
							still nothing on your PATH
						</span>
					) : null}
				</div>
			</div>
		</div>
	);
}

/** the composer at rest and switched off, so the rail still shows what it is for */
function DeadComposer() {
	return (
		<div data-agent-dead="" className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			<div className="flex flex-col rounded-md border border-border/70 bg-surface/40 px-3 py-2.5">
				<span className="text-base text-muted/25 leading-base" style={{ height: MIN_H }}>
					say what to change
				</span>
			</div>
			<div className="flex h-[18px] items-center" />
		</div>
	);
}

/**
 * Signed out, as a standing fact.
 *
 * A strip rather than a wall because the log below it is not empty and must not be: what
 * the human typed is down there in their own voice, and so is the moment the send
 * bounced. The strip is the part that outlives that moment — the same test #117 used to
 * lift the plan out of the transcript and leave the screenshot in it.
 *
 * It sits at the plan strip's height and in the plan strip's place, because the rail has
 * one shelf and those two never want it at once: a plan belongs to a turn that is running,
 * and this exists precisely because none can.
 *
 * Two things on it and no third. The promise about keys is in the log under the remedy,
 * where somebody deciding what to do reads it once, rather than held on screen for as long
 * as the state lasts.
 */
function LoginStrip({ login }: { login: LoginDeck }) {
	return (
		<div data-agent-login="" className="flex h-[34px] shrink-0 items-center border-border border-b px-3.5">
			<span className="min-w-0 flex-1 truncate font-mono text-muted text-sm leading-4">signed out</span>
			<Quiet busy={login.checking} onClick={login.check} />
		</div>
	);
}

/* ---------- the plan, out of the log ----------
 * A transcript is a log and a log scrolls. Everything else in one is finished the
 * moment it is drawn, so scrolling costs nothing; the plan is the exception, because
 * it goes on changing for the rest of the turn. Measured on the capture, it is written
 * in nine seconds and its first task does not land for another eight minutes and
 * sixteen rows, by which point a transcript has carried it off the top and the tick
 * lands where nobody is looking.
 *
 * So it comes out of the log and sits above it, and it obeys the one-line rule while
 * it does: a count, and the agent's own present-participle phrasing for whatever is
 * running. Both phrasings are the agent's — `TaskCreate` ships the written form and
 * the participle together, precisely so that a surface never invents a friendlier
 * one. The list is a click away and is not the resting state, because seven tasks
 * permanently open is a hundred and fifty pixels of rail answering a question nobody
 * asked twice.
 *
 * The cost is on screen and it is honest: thirty-four pixels of rail for as long as
 * there is a plan. It is absent until one is written, which most turns never do. */

function PlanStrip({ plan }: { plan: AgentPlan }) {
	const [open, setOpen] = useState(false);
	return (
		<div data-agent-plan="" className="flex shrink-0 flex-col border-border border-b">
			<button
				type="button"
				aria-label="plan"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="flex h-[34px] w-full shrink-0 items-center gap-2.5 px-3.5 text-left transition-colors duration-150 hover:bg-surface"
			>
				<span className="shrink-0 font-mono text-muted text-sm leading-4">plan</span>
				<span className="shrink-0 font-mono text-muted/60 text-sm tabular-nums leading-4">
					{plan.done}/{plan.total}
				</span>
				{/* nothing is running between a task landing and the agent saying which is next,
				    and the strip says nothing rather than holding the last thing it said */}
				{plan.running === null ? null : (
					<span className="min-w-0 flex-1 truncate font-mono text-sm text-text/85 leading-4">{plan.running}</span>
				)}
				<ChevronIcon open={open} className="ml-auto h-2.5 w-2.5 shrink-0 text-muted/35" />
			</button>
			{open ? (
				<div className="relative flex shrink-0 flex-col pb-2 pl-[18px]">
					{/* the rule stands where the list hangs from, a little in from the strip's own
					    left edge, so the tasks read as belonging to the line above them */}
					<span className="absolute top-1 bottom-3 left-[18px] w-px bg-border-raised" />
					{plan.tasks.map((task) => (
						<span key={task.key} className="flex h-[22px] items-center gap-2 pl-2.5">
							<StateMark state={task.state} className="h-3 w-3" />
							<span className="truncate font-mono text-2xs text-muted leading-3">{task.name}</span>
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

/* ---------- the transcript ----------
 * It follows the live end while the reader is already there, and stops the moment
 * they scroll to read something: a log that yanks itself back down mid-sentence is
 * worse than one that does not follow at all.
 *
 * Leaving is an act and so is coming back. Any input that could carry the reader away
 * from where following holds — a wheel, a finger, the scrolling keys, a scrollbar
 * drag — ends the following before the scroll it causes ever lands. It resumes only
 * where resuming moves nothing: the chip over the log's foot, the reader's own words
 * going out, or the end of the log when the end is the follow point. Proximity alone
 * re-arms nothing, because against an entry taller than the box the follow point is
 * that entry's first line, and a rule that re-armed near the bottom warped whoever
 * reached the end back up by the entry's whole overflow, again on every attempt. */

/** the keys that scroll a focused log, and which way they carry the reader */
const SCROLL_KEYS: Record<string, -1 | 1 | undefined> = {
	ArrowUp: -1,
	PageUp: -1,
	Home: -1,
	ArrowDown: 1,
	PageDown: 1,
	End: 1,
	" ": 1,
};

/**
 * Where the log scrolls to while it is following the live end.
 *
 * What it anchors is the *top* of the live entry rather than the bottom of the log. A
 * 3,372-character message is over a thousand pixels against a transcript of about five
 * hundred, and following its end drives its first line — where the verdict is — out of
 * view before it has been read, at 171 characters a second for twenty seconds.
 *
 * `tail` is how far the last entry's top sits below the box's own, or null when the log
 * is empty. One clamp covers both cases and nothing measures an entry's height: the
 * scroll that puts that entry's first line at the top is at most
 * `scrollHeight - entryHeight`, so it falls below the maximum scroll exactly when the
 * entry is taller than the box. A short entry therefore keeps ordinary follow-the-end,
 * and a tall one pins its own first line and fills downward for as long as it is the
 * thing being written.
 */
export function followTo(
	box: { readonly scrollTop: number; readonly scrollHeight: number; readonly clientHeight: number },
	tail: number | null,
): number {
	const end = box.scrollHeight - box.clientHeight;
	return Math.max(0, Math.min(tail === null ? end : box.scrollTop + tail - TOP_INSET, end));
}

function Transcript({
	entries,
	live,
	spoke,
	elapsed,
	jump,
	onAnswer,
}: {
	entries: readonly AgentEntry[];
	/** whether the turn is still writing, which is the word the chip picks for what is below */
	live: boolean;
	/**
	 * How many times the person has sent words while this rail stood. A count rather
	 * than anything read off the entries, because a turn's first user entry is keyed
	 * `user` every turn — the list cannot say "these words are new" across a turn
	 * boundary, and the send itself already can.
	 */
	spoke: number;
	elapsed: number;
	jump: FrameJump;
	onAnswer: (request: string, reply: AgentReply) => void;
}) {
	const view = useRef<HTMLDivElement>(null);
	const [follow, setFollow] = useState(true);
	/**
	 * Whether the reader is somewhere the way-back chip has something to name, which is
	 * the one condition it draws on. It is state rather than a read off the box because
	 * the box moves without scrolling: a streaming entry grows under a still scrollbar,
	 * and the chip has to appear the moment the live end walks away from a reader who
	 * never touched anything.
	 */
	const [away, setAway] = useState(false);
	/**
	 * The last scroll this box performed on itself, held as the value rather than a
	 * spent-by-one-event flag. The flag was wrong twice over. Scroll events coalesce,
	 * so a wheel landing in the same frame as the log's own write arrived as one event
	 * the flag swallowed, reader and all — which is how the log kept fighting a person
	 * who had plainly scrolled. And Chrome's scroll anchoring moves the box on its own
	 * schedule, which a spent flag then misread as the reader leaving. Holding the
	 * number lets every event answer the question that matters: is the box where the
	 * log put it, or where following would sit? Anything else is the reader.
	 */
	const wrote = useRef<number | null>(null);
	/** the last send this log answered, so speaking re-enters follow exactly once */
	const heard = useRef(spoke);
	/** `follow`, readable from the size watcher without re-observing on every flip */
	const following = useRef(true);
	/** where the last touch was, because a touch names no direction until it moves */
	const touched = useRef<number | null>(null);

	/** where following would put the box right now */
	const aim = (box: HTMLElement) => {
		const tail = box.firstElementChild?.lastElementChild;
		return followTo(
			box,
			tail instanceof HTMLElement ? tail.getBoundingClientRect().top - box.getBoundingClientRect().top : null,
		);
	};
	/** the log scrolling itself, held in `wrote` so the event it causes reads as its own */
	const carry = (box: HTMLElement, to: number) => {
		if (Math.abs(box.scrollTop - to) < 1) return;
		wrote.current = to;
		box.scrollTop = to;
	};
	const pin = (box: HTMLElement) => carry(box, aim(box));
	/**
	 * Whether the chip has anything to name: the reader is off the follow point *and*
	 * there is log below them. The second half is what the first half cannot say. The
	 * follow point of a last entry taller than the box is that entry's first line, so a
	 * reader who has read all the way down sits an entry's overflow from it and was
	 * being offered a way back to something they had already passed — a chip drawn at
	 * the true bottom, pointing down, that scrolled up when pressed.
	 */
	const adrift = (box: HTMLElement) =>
		box.scrollTop < box.scrollHeight - box.clientHeight - 1 && Math.abs(box.scrollTop - aim(box)) >= 1;
	/** the reader took the wheel: following ends now, before the scroll it causes lands */
	const leave = () => {
		setFollow(false);
		setAway(true);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: the entry list is what moves the end
	useEffect(() => {
		following.current = follow;
		const box = view.current;
		if (box === null) return;
		const sent = spoke !== heard.current;
		heard.current = spoke;
		// the person speaking is the one act that re-enters follow on their behalf:
		// their words land at the live end, and they put them there
		if (follow || sent) {
			if (!follow) setFollow(true);
			if (sent && away) setAway(false);
			pin(box);
			return;
		}
		setAway(adrift(box));
	}, [entries, follow, spoke]);

	/*
	 * The pin above re-runs when the list changes; height changes on more than the
	 * list. A fence settles, an answered question folds its options, a message settles
	 * — the body resizes with nothing new in it, and until the next render either
	 * the pin or the chip is stale. Watching the body itself closes that gap: following
	 * re-pins, and a reader who is away learns the live end moved. (happy-dom
	 * constructs the observer and lays nothing out, so tests drive the pin through the
	 * rail's clock instead.)
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: the watcher reads refs and the box, nothing rendered
	useEffect(() => {
		const box = view.current;
		const body = box?.firstElementChild;
		if (box === null || body === null || body === undefined) return;
		const watcher = new ResizeObserver(() => {
			if (following.current) pin(box);
			else setAway(adrift(box));
		});
		watcher.observe(body);
		return () => watcher.disconnect();
	}, []);

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the handlers only watch the reader leave; the log stays a scroll region, and its one control is the chip below */}
			<div
				ref={view}
				data-agent-log=""
				onScroll={(event) => {
					const box = event.currentTarget;
					const own = wrote.current;
					wrote.current = null;
					if (own !== null && Math.abs(box.scrollTop - own) < 1) return;
					const to = aim(box);
					const end = box.scrollHeight - box.clientHeight;
					const off = Math.abs(box.scrollTop - to) >= 1;
					// moved, not by the log, and not to where following sits: a scrollbar
					// drag, the one way to scroll a log without touching it
					if (follow && off) leave();
					// the end re-arms follow only when the end is where following would sit
					// anyway, so re-entering moves nothing
					else if (!follow && !off && to >= end - 1) setFollow(true);
					// last, so it overrides the optimistic `away` that leaving sets before it
					// can see where the scroll landed
					setAway(off && box.scrollTop < end - 1);
				}}
				onWheel={(event) => {
					if (!follow || event.deltaY === 0) return;
					const box = event.currentTarget;
					const room = box.scrollHeight - box.clientHeight - box.scrollTop;
					if (event.deltaY < 0 ? box.scrollTop > 0 : room >= 1) leave();
				}}
				onTouchStart={(event) => {
					touched.current = event.touches[0]?.clientY ?? null;
				}}
				onTouchMove={(event) => {
					const from = touched.current;
					const at = event.touches[0]?.clientY;
					if (at === undefined) return;
					touched.current = at;
					if (!follow || from === null || at === from) return;
					const box = event.currentTarget;
					const room = box.scrollHeight - box.clientHeight - box.scrollTop;
					// a finger pulling down drags earlier words back into view: scrolling up
					if (at > from ? box.scrollTop > 0 : room >= 1) leave();
				}}
				onKeyDown={(event) => {
					if (!follow || event.target !== event.currentTarget) return;
					const way = SCROLL_KEYS[event.key === " " && event.shiftKey ? "PageUp" : event.key];
					if (way === undefined) return;
					const box = event.currentTarget;
					const room = box.scrollHeight - box.clientHeight - box.scrollTop;
					if (way < 0 ? box.scrollTop > 0 : room >= 1) leave();
				}}
				className="pages-scrollbar flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3.5 pt-6 pb-4"
			>
				{/* `mt-auto` rather than `justify-end`: a flex container that end-justifies its
				    overflow puts the top of it out of reach of the scrollbar */}
				<div className="mt-auto shrink-0">
					{entries.map((entry, index) => (
						<div
							key={entry.key}
							className="animate-agent-entry shrink-0"
							style={{ paddingTop: gapBefore(entries[index - 1], entry) }}
						>
							<Entry entry={entry} elapsed={elapsed} jump={jump} onAnswer={onAnswer} />
						</div>
					))}
				</div>
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
			{/* the way back, drawn only while there is log below the reader that following
			    would have shown them. It names what is below — live while the turn is
			    writing, latest once it settles — and pressing it returns to where following
			    holds, which for a tall live entry is its first line rather than its newest
			    word. When the reader is already past that line, inside the entry, the
			    press carries them to the end instead: the arrow points down and the one
			    thing it may never do is scroll up. */}
			{follow || !away ? null : (
				<button
					type="button"
					data-agent-live=""
					onClick={() => {
						const box = view.current;
						if (box === null) return;
						const to = aim(box);
						const end = box.scrollHeight - box.clientHeight;
						const target = to > box.scrollTop ? to : end;
						setAway(false);
						// following resumes only where it holds what the press landed on;
						// re-arming at the end of a tall entry warps the reader back up by the
						// entry's overflow on the next write
						if (to >= target - 1) setFollow(true);
						carry(box, target);
					}}
					className="absolute bottom-3 left-1/2 flex h-6 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 font-mono text-2xs text-muted leading-3 transition-colors duration-150 hover:bg-surface hover:text-text"
				>
					<span aria-hidden="true">↓</span>
					{live ? "live" : "latest"}
				</button>
			)}
		</div>
	);
}

/**
 * Consecutive rows read as one run, so they sit tighter than a turn boundary.
 *
 * A request out is row-shaped and packs the same way (#212): it is one line of the same
 * height in the same grammar, and spacing it like a turn boundary would say a break
 * happened where the agent only stopped to think.
 */
const TIGHT: ReadonlySet<AgentEntry["kind"]> = new Set(["row", "wait"]);

function gapBefore(previous: AgentEntry | undefined, entry: AgentEntry): number {
	if (previous === undefined) return 0;
	if (TIGHT.has(previous.kind) && TIGHT.has(entry.kind)) return 6;
	return 14;
}

function Entry({
	entry,
	elapsed,
	jump,
	onAnswer,
}: {
	entry: AgentEntry;
	elapsed: number;
	jump: FrameJump;
	onAnswer: (request: string, reply: AgentReply) => void;
}) {
	if (entry.kind === "user") {
		/*
		 * The words, and under them what was sent with them (#116).
		 *
		 * The line is exactly what the chip strip said at rest when Enter was pressed —
		 * no more, because the strip is the promise that was made, and no less, because
		 * a turn nobody can audit is a turn nobody can trust. A picture is the one thing
		 * that line cannot audit, so its receipt is the picture itself, at the same
		 * thumbnail a tool call's own shot gets.
		 */
		return (
			<div className="relative flex flex-col gap-1.5 pl-3.5">
				<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
				<p className="whitespace-pre-wrap text-base text-text leading-base">{entry.text}</p>
				{/* the same 120px thumbnail a call's own picture gets, because it is the same
				    act of looking: a picture in the log, at a size that says what it is */}
				{entry.attached === null ? null : <Shot shot={entry.attached} of={null} quiet={true} />}
				{entry.context === null ? null : (
					<span data-agent-context="" className="truncate font-mono text-2xs text-muted/55 leading-3">
						{entry.context}
					</span>
				)}
			</div>
		);
	}
	if (entry.kind === "note") {
		// a boundary reaches across the rail because what it says applies to everything
		// under it: above it happened, below it did not
		if (entry.rule !== false) {
			return (
				<div className="flex items-center gap-2.5 py-0.5">
					<span className="h-px flex-1 bg-border" />
					{/* min-w-0, because a label that refuses to shrink pushes the row past the
					    rail and the log must never scroll sideways */}
					<span className="min-w-0 truncate font-mono text-2xs text-muted/60 leading-3">{entry.text}</span>
					<span className="h-px flex-1 bg-border" />
				</div>
			);
		}
		// and a note that is only itself sits where it fell, in the quiet mono the
		// composer's own hints use: the remedy in the weight that says it is the thing to
		// do, and under it the sentence you need once (#201)
		return (
			<div data-agent-aside="" className="flex flex-col gap-0.5">
				{entry.said === undefined ? null : (
					<p className="font-mono text-2xs text-text/70 leading-4">{entry.said}</p>
				)}
				<p className="whitespace-pre-wrap font-mono text-2xs text-muted/55 leading-4">{entry.text}</p>
			</div>
		);
	}
	if (entry.kind === "row") return <Row entry={entry} jump={jump} />;
	if (entry.kind === "wait") return <Wait entry={entry} elapsed={elapsed} />;
	if (entry.kind === "ask") return <Ask entry={entry} onAnswer={onAnswer} />;
	return <Prose entry={entry} elapsed={elapsed} />;
}

/* ---------- one tool call, one line ----------
 * A mark, a verb and a subject, and the payload the projection kept separate stays
 * off the line until somebody asks for it. A nine-minute turn is nineteen of these
 * and still readable, which is the whole reason the rule is one line; what the words
 * are and where they come from is `agent-nouns.ts`.
 *
 * The name is the place and the rest of the row is still the call (#143). The verb and
 * the count are about the call — six edits happened, here is the file they happened
 * to — and the name is about the frame, which outlives the call. Two objects, two
 * targets, split where the row's own grammar already splits. Giving the whole row to
 * the frame lost on consistency, because the click was already spent on the disclosure
 * and two identical-looking rows would then do different things.
 *
 * The count is its own box beside the subject rather than part of it, because linking
 * the count would say the count is part of the place.
 *
 * The accent is per row and never per name. Pointing is per frame, and a transcript
 * that names one frame twelve times would light all twelve rows at once off a shared
 * `pointed` — so what marks the name is this row's own cursor, and what the pointing
 * produces is a ring out on the canvas or a lit page in the Pages rail. */

function Row({ entry, jump, nested = false }: { entry: AgentRow; jump: FrameJump; nested?: boolean }) {
	/**
	 * Whether the disclosure has been pressed, and which way.
	 *
	 * Undefined is nobody having touched it, which is not the same as closed: a row
	 * holding a picture opens itself, because the picture is the one payload worth
	 * showing unasked. A press still wins after that, either way.
	 */
	const [clicked, setClicked] = useState<boolean | undefined>(undefined);
	/**
	 * The cursor is on this row.
	 *
	 * Held here rather than left to `:hover` because the mark belongs to the name and
	 * the hit area is the name, so the row has to know the cursor is inside it — and
	 * held per row rather than keyed on the frame, which is the whole rule above.
	 */
	const [over, setOver] = useState(false);
	const shot = entry.shot;
	const holds = entry.detail !== null || shot !== null || entry.delegated.length > 0;
	const open = holds && (clicked ?? shot !== null);

	/*
	 * The name is a place, a place that is not there yet, or a place that was. Only the
	 * last of the three is struck: a frame this turn is one beat from writing is absent
	 * in exactly the same way, and it is one beat from existing, so it reads as an
	 * ordinary word and does nothing.
	 */
	const frame = entry.frame;
	const goes = frame !== null && jump.have.has(frame);
	const gone = frame !== null && jump.gone.has(frame);
	/** what this row is pointing at, so an unmount with the cursor on it can take it back */
	const pointing = useRef<string | null>(null);
	const unpoint = useRef(jump.onPoint);
	unpoint.current = jump.onPoint;
	const point = (on: boolean) => {
		setOver(on);
		if (!goes || frame === null) return;
		pointing.current = on ? frame : null;
		jump.onPoint(on ? frame : null);
	};
	// a row can leave while the cursor is on its name — a disclosure shutting takes a
	// delegate's rows with it — and a ring nothing is pointing at would stay lit
	useEffect(
		() => () => {
			if (pointing.current !== null) unpoint.current(null);
		},
		[],
	);

	const name =
		entry.subject === null ? null : (
			<span
				className={cn(
					"min-w-0 truncate font-mono text-sm leading-4",
					// struck through and dimmed, in the words the canvas already uses for a name
					// nothing answers to
					gone ? "text-muted/45 line-through" : "text-text/85",
					// the only mark the name carries, and only while the cursor is on its row: a
					// dotted rule is the lightest thing that says this word is a place
					goes && over && "underline decoration-dotted decoration-thread/60 underline-offset-[3px]",
				)}
			>
				{entry.subject}
			</span>
		);
	const line = (
		<>
			<StateMark state={entry.state} />
			<span className="flex min-w-0 items-baseline gap-1.5">
				<span className="shrink-0 font-mono text-muted text-sm leading-4">{entry.verb}</span>
				{goes ? (
					// biome-ignore lint/a11y/useSemanticElements: this row is the disclosure's button, and a button cannot contain an anchor
					<span
						role="link"
						tabIndex={0}
						data-agent-jump={frame}
						onClick={(event) => {
							event.stopPropagation();
							if (frame !== null) jump.onJump(frame);
						}}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.stopPropagation();
							event.preventDefault();
							if (frame !== null) jump.onJump(frame);
						}}
						onMouseEnter={() => point(true)}
						onMouseLeave={() => point(false)}
						className="flex min-w-0 cursor-pointer"
					>
						{name}
					</span>
				) : (
					name
				)}
				{entry.count > 1 ? (
					<span
						className={cn(
							"shrink-0 font-mono text-sm tabular-nums leading-4",
							gone ? "text-muted/45" : "text-text/85",
						)}
					>
						×{entry.count}
					</span>
				) : null}
			</span>
		</>
	);
	// the spoken form of the same line, because the words are separate boxes to lay out
	// and one run of text to read
	const said = [entry.verb, entry.subject, entry.count > 1 ? `×${entry.count}` : null].filter(Boolean).join(" ");
	const row = "-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5 text-left";
	if (!holds)
		return (
			<div data-agent-row={said} data-agent-nested={nested ? "" : undefined} className={row}>
				{line}
			</div>
		);
	return (
		<div data-agent-row={said} data-agent-nested={nested ? "" : undefined} className="flex flex-col">
			<button
				type="button"
				aria-label={said}
				aria-expanded={open}
				onClick={() => setClicked(!open)}
				className={cn(row, "hover:bg-surface")}
			>
				{line}
				<ChevronIcon open={open} className="ml-0.5 h-2.5 w-2.5 shrink-0 text-muted/35" />
			</button>
			{open ? (
				<div className="flex flex-col pt-0.5 pb-1" style={{ paddingLeft: INDENT }}>
					{/* the picture takes the payload's place rather than sitting under a line of
					    file metadata: `image/png` is a fact about a file and the row above already
					    said `look`. The caption is dropped where the line already carries it, since
					    every shot in the captures is of the frame its own row names. */}
					{shot === null ? null : (
						<Shot shot={shot} of={entry.frame ?? entry.detail} quiet={entry.frame === entry.subject} />
					)}
					{shot === null && entry.detail !== null ? (
						<span data-agent-detail="" className="block truncate font-mono text-2xs text-muted/55 leading-4">
							{entry.detail}
						</span>
					) : null}
					{/*
					 * A sub-agent is one row that expands into its own transcript (#194). What is in
					 * here is rows rather than a summary, because for a delegate the place is the
					 * canvas: its frames land out there and a row is how you get to one, so they
					 * navigate on the same rule as everything else.
					 */}
					{entry.delegated.length > 0 ? (
						<div className="relative flex flex-col">
							<span className="absolute top-1 bottom-1 left-0 w-px bg-border-raised" />
							{entry.delegated.map((theirs) => (
								<div key={theirs.key} className="animate-agent-entry pl-2.5">
									<Row entry={theirs} jump={jump} nested={true} />
								</div>
							))}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

/* ---------- a request out, one line ----------
 * The receipt for the silence before the log has anything to show (#212, #231), in the
 * row's own grammar because the log already has one for a thing that took time: a mark,
 * a verb and a number. It is drawn a shade quieter than a tool row throughout —
 * `thinking` is something the machine did rather than something it did to the project,
 * and a transcript in which every third line is this at full strength reads as busier
 * than the turn was.
 *
 * The number is a duration and never a thought. The wire carries no thinking text at
 * all, so there is nothing else it could honestly be, and the projection's own comment
 * on the entry is where that is argued. What it does now cover is the thinking itself:
 * the projection settles it on the first drawn thing rather than the first token, so a
 * reasoning turn reads `thinking 31.2s` where it used to read `thinking 0.0s` and then
 * hold still for the other 31 seconds.
 *
 * It counts while the request is out and stops where the answer starts. The count is
 * free: this rail already re-renders on the pace's own tick, so nothing is scheduled
 * for it and a settled receipt costs one render and then nothing.
 *
 * Under reduced motion the clock is handed in as infinite — that is how an arriving
 * message is drawn whole — so a live receipt has no number to show and draws the mark
 * and the word alone until it settles. That is the right way round rather than a
 * shortfall: a digit changing sixty times a second is motion, and the reader who asked
 * for none gets the duration once, when it is final. */

function Wait({ entry, elapsed }: { entry: Extract<AgentEntry, { kind: "wait" }>; elapsed: number }) {
	// only a request that is genuinely still out counts, and only its own turn's clock can
	// count it: a receipt restored with no total on it reads as the request it was and
	// says no number, rather than climbing from a zero belonging to some other turn
	const took = entry.ms !== null ? duration(entry.ms) : entry.state === "running" ? duration(elapsed - entry.at) : "";
	return (
		<div data-agent-wait={entry.state} className="-mx-1.5 flex h-[26px] w-fit items-center gap-2.5 rounded-sm px-1.5">
			<StateMark state={entry.state} />
			<span className="shrink-0 font-mono text-muted/70 text-sm leading-4">thinking</span>
			{took === "" ? null : (
				// `tabular-nums` so a tenth ticking over changes no width, which is what keeps
				// the one moving thing in the log from moving anything else
				<span className="shrink-0 font-mono text-muted/60 text-sm tabular-nums leading-4">{took}</span>
			)}
		</div>
	);
}

/* ---------- the turn waiting on you ----------
 * The first state in this rail that waits on the person rather than being watched by
 * them, and the only geometry that exists while nobody has answered.
 *
 * The question itself was never the variable. It is a sentence the agent wrote, so it
 * goes where the agent's sentences go; the answer is a sentence the person chose, so
 * it lands in the shape the rail already gives the person's words. Agent, then human,
 * which is what a thread is — so an answered question adds nothing permanent to the
 * rail's vocabulary and the option list is gone the moment somebody has answered.
 *
 * The options are a block in the log and not chips beside the composer, and what
 * settled that was the descriptions: 150 to 250 characters of what each choice costs,
 * comparable side by side and unreadable in a chip. The composer stays live beside
 * them, because prose is a first-class answer the tool tests before the picked ones
 * and rewards with the stronger instruction to follow what the person actually said.
 *
 * An approval is the same block with different words in it. It leads with the agent's
 * own written description of what it is about to do — the row above already says what
 * the call is — and its three answers are spool's own, in the mono register spool uses
 * for its own words. All three are bordered, because for an approval every one of them
 * is an answer. A question's dismiss is not: it refuses the whole question rather than
 * answering it, so it stays one quiet wordless word underneath. */

function Ask({
	entry,
	onAnswer,
}: {
	entry: Extract<AgentEntry, { kind: "ask" }>;
	onAnswer: (request: string, reply: AgentReply) => void;
}) {
	const request = entry.request;
	const open = entry.state === "open" && request !== null;
	const answer = (reply: AgentReply) => {
		if (request !== null) onAnswer(request, reply);
	};
	return (
		<div data-agent-ask={entry.state} className="flex flex-col gap-3">
			{/* the sentences, drawn where the agent's sentences are drawn. A question still
			    arriving shows a caret, because it is typing itself in the way every tool
			    call's subject does */}
			{entry.question ? (
				entry.questions.map((question) => (
					<div key={question.question} className="flex flex-col gap-1.5">
						<p className="text-base text-text/90 leading-base">{question.question}</p>
						{open ? (
							<div className="flex flex-col gap-1.5">
								{question.options.map((option) => (
									<button
										key={option.label}
										type="button"
										data-agent-option={option.label}
										onClick={() => answer({ kind: "picked", picks: { [question.question]: option.label } })}
										className="flex flex-col gap-1 rounded-md border border-border-raised bg-surface px-3 py-2.5 text-left transition-colors duration-150 hover:border-muted/45"
									>
										<span className="text-base text-text leading-base">{option.label}</span>
										{option.description === "" ? null : (
											<span className="text-2xs text-muted/70 leading-4">{option.description}</span>
										)}
									</button>
								))}
							</div>
						) : null}
					</div>
				))
			) : entry.asked === null ? null : (
				// nothing where the agent wrote nothing: the row above already named the call,
				// and a block that repeated it would be the rail saying one thing twice
				<p className="text-base text-text/90 leading-base">
					{entry.asked}
					{entry.state === "arriving" ? <Caret /> : null}
				</p>
			)}
			{entry.state === "answered" ? <Answered words={entry.words} /> : null}
			{entry.state === "dropped" ? <AskOutcome state="failed" text="nobody answered" /> : null}
			{entry.state === "allowed" ? <AskOutcome state="done" text="allowed" /> : null}
			{entry.state === "always" ? <AskOutcome state="done" text="allowed for this thread" /> : null}
			{/* a deny and a dismiss are one wire and two acts: for an approval the person
			    answered no, and for a question they refused to answer at all */}
			{entry.state === "denied" ? (
				<AskOutcome state="stopped" text={entry.question ? "dismissed" : "denied"} />
			) : null}
			{open && entry.question ? (
				// not a fourth option and it must not look like one, so the options keep their
				// bordered rows and this is one quiet mono word underneath, in the register
				// the composer uses for its own hints. It stays wordless so it means one thing
				<button
					type="button"
					data-agent-dismiss=""
					onClick={() => answer({ kind: "deny" })}
					className="w-fit font-mono text-2xs text-muted/45 leading-3 transition-colors duration-150 hover:text-muted"
				>
					dismiss
				</button>
			) : null}
			{open && !entry.question ? (
				<div className="flex flex-col gap-1.5">
					<AskAction label="allow" onPick={() => answer({ kind: "allow" })} />
					{/* absent rather than dead where the request suggested no rule: spool never
					    composes one of its own to fill the gap. Where it is offered it lasts the
					    thread and is written to no file, because the complaint is repetition */}
					{entry.always ? (
						<AskAction label="always, for this thread" onPick={() => answer({ kind: "always" })} />
					) : null}
					<AskAction label="deny" onPick={() => answer({ kind: "deny" })} />
				</div>
			) : null}
		</div>
	);
}

/** one of spool's own answers to an approval, in the same row an option gets */
function AskAction({ label, onPick }: { label: string; onPick: () => void }) {
	return (
		<button
			type="button"
			data-agent-option={label}
			onClick={onPick}
			className="w-full rounded-md border border-border-raised bg-surface px-3 py-2 text-left transition-colors duration-150 hover:border-muted/45"
		>
			<span className="font-mono text-sm text-text leading-4">{label}</span>
		</button>
	);
}

/**
 * The answer, in the shape the rail already draws the person's words in.
 *
 * Not a row, because the verb slot has nowhere to put it: `ask` is spent on every call
 * that left the building, and `ask Notion` one line above `asked Shot fix` is two words
 * the eye cannot separate at this size. The person's own accent rail is the answer that
 * needed no new word at all.
 */
function Answered({ words }: { words: string | null }) {
	return (
		<div className="relative flex flex-col gap-1.5 pl-3.5">
			<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
			<p className="whitespace-pre-wrap text-base text-text leading-base">{words}</p>
		</div>
	);
}

/** what became of a request nobody is waiting on any more, in one quiet line */
function AskOutcome({ state, text }: { state: RowState; text: string }) {
	return (
		<div className="flex items-center gap-2.5">
			<StateMark state={state} />
			<span className="font-mono text-2xs text-muted/55 leading-3">{text}</span>
		</div>
	);
}

/**
 * The paragraph count at which a message stops being a sentence and is a document.
 *
 * Nothing is measured to decide it. It is the same test the lede candidate asked of a
 * message, answered off the paragraph breaks in the text rather than off the renderer's
 * chunks or a layout pass, so it is known from the character the fourth paragraph opens
 * on rather than from a box that has already been drawn.
 */
const DOCUMENT_BLOCKS = 4;

/**
 * One block of the agent's prose, however much of it has arrived.
 *
 * A short message reserves the height of everything that has *landed* rather than the
 * height of what is drawn, which is the pace's lag — up to 0.8s of text the wire has
 * sent and the edge has not reached. That much is held so the last lines do not walk
 * in one at a time under the reader. It is not the finished message's height and
 * cannot be: the wire has not sent the rest yet. Rendered, the reserve cannot be a
 * hidden copy of the same string either — a half-typed `**bold` is not the geometry of
 * a finished `**bold**` — so it is the landed text drawn invisibly with the arriving
 * one drawn over it.
 *
 * **A document grows instead.** The reserve puts its whole height into the scroll
 * range from the first character, so a message still being written for twenty seconds
 * leaves screens of scrollable nothing under it and the scrollbar says the log is
 * longer than anything in it. Growing has no such space. The empty-screen argument
 * that used to be made against the reserve at this size was a bottom-pinning artefact
 * and the top-anchored follow above answered it, so what is left is only the scroll
 * range — enough to keep the reserve off a document, and not enough to pretend the
 * reserve was ever unwatchable.
 */
function Prose({ entry, elapsed }: { entry: Extract<AgentEntry, { kind: "prose" }>; elapsed: number }) {
	const upto = shownBy(entry, elapsed);
	const streaming = upto < entry.full.length;
	if (!streaming) return <Said text={entry.full} />;
	/*
	 * `closedText` closes a marker the message has not finished writing, which is the
	 * thing that made streaming markdown jitter: `**The shot failed` renders as two
	 * literal asterisks in body weight, and when the closing `**` lands 200ms later the
	 * asterisks vanish, the run goes bold, and the paragraph re-wraps under the line
	 * being read. An unterminated fence is worse — it swallows the rest of the message
	 * into a `<pre>`. Closed instead, what is drawn is always a prefix of what will be.
	 */
	const shown = closedText(entry.full.slice(0, upto));
	const grows = entry.full.split(/\n\n+/).length >= DOCUMENT_BLOCKS;
	return (
		<div className="relative">
			{/*
			 * The reserve, whose slot is held open when there is nothing in it. A message
			 * crosses into being a document mid-stream, and a tree that changed shape at that
			 * moment would take the live copy with it: React would remount the window and
			 * every word inside it would fire its arrival again, all at once.
			 */}
			{grows ? null : (
				<div data-agent-reserve="" className="invisible" aria-hidden="true">
					<Said text={entry.full} />
				</div>
			)}
			{/* the arriving copy, and the only place in the rail that holds a partial message:
			    it is addressable so a test can ask how much has landed */}
			<div data-agent-prose="" className={cn(!grows && "absolute inset-0")}>
				<Said text={shown} live={Math.min(LIVE_TAIL, shown.length)} caret={<Caret />} />
			</div>
		</div>
	);
}

/* ---------- the mark ----------
 * The most repeated moment in the rail is a row going from running to done, so it is
 * one gesture rather than two pictures: the ring shrinks away while the stroke draws
 * itself through the space it is leaving. The overlap is what makes it read as the
 * same object settling.
 *
 * Three endings, because a stop is neither of the other two. Done is two strokes
 * meeting, failed is two crossing, and a call the developer stopped is a single flat
 * one — it did not succeed, it did not fail, it was cut — drawn short of the full
 * width so it reads as a stub rather than a minus sign. Nothing is coloured: the
 * accent belongs to the selection, and a refusal is not an alarm, because nine times
 * out of ten the developer caused it.
 *
 * `pending` is the same ring with the arc taken off it and nothing turning, so a list
 * at rest has no motion in it at all. No work row is ever pending — a call is running
 * from the moment its block opens — and it is drawn here because the plan's own tasks
 * are written down long before they start (#194). */

const CHECK = "m3.4 7.2 2.4 2.4 4.8-5.2";

/**
 * The strokes each ending draws, as a fixed pair so the mark is one element that
 * changes rather than two that swap.
 *
 * The stroke has to be mounted before it draws — a dash offset only animates on an
 * element that was already there — so a row that is still running holds the check's
 * geometry at zero length, and whichever ending arrives replaces the path in place
 * and lets it draw.
 */
const STROKES: Record<RowState, readonly [string, string | null]> = {
	pending: [CHECK, null],
	running: [CHECK, null],
	done: [CHECK, null],
	failed: ["M4.2 4.2l5.6 5.6", "M9.8 4.2l-5.6 5.6"],
	stopped: ["M4.4 7h5.2", null],
};

function StateMark({ state, className }: { state: RowState; className?: string }) {
	const turning = state === "running";
	const ringed = turning || state === "pending";
	const settled = !ringed;
	const [first, second] = STROKES[state];
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
					className={cn(
						turning ? "text-text/60" : "text-text/35",
						"h-full w-full",
						turning && "animate-agent-spin",
					)}
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

/* ---------- the composer ----------
 * One bounded box the whole message is typed into, with what rides along stacked
 * above the field it rides with. Enter sends what is in it verbatim, whatever that
 * is; shift-Enter is a newline.
 *
 * Enter has three meanings and the turn's own state resolves them (#170): answering
 * answers, busy queues, otherwise sends. Busy used to refuse — two agents writing one
 * repo is still not a thing to offer — but refusing threw away written words, so the
 * press is taken and held instead and the queue above the field is where it waits.
 * The hint below says which of the three is live, so a press is never a mystery. */

/**
 * The stroke on the composer's top border, which is the whole of what says the agent is
 * alive.
 *
 * A thread is laid out of the left edge, carries at its full length, and is taken up into
 * the right edge as the head waits there for the tail. Spool means winding thread and this
 * product calls its conversations threads, so a stroke on the boundary is closer to what
 * the thing is than a spinner would be — and it says it without spending the logo or a
 * single pixel of the transcript, because it rides the hairline that was already there.
 *
 * **No word, and that is the point.** The stroke is the entire indicator. Idle draws the
 * border unchanged, and a request out, thinking, saying and doing all draw the same
 * laying-and-taking-up. A reader watching the edge of their own eye learns nothing from the
 * difference between a request being out and a `read` being open, because the answer to *do
 * I need to do anything* is no in both.
 *
 * **What it does now say is how long, and only that (#231).** The travel is untouched and
 * the strength ramps: 75% of the text colour at rest, full at thirty seconds of one
 * unbroken silence. That reasoning above holds for the four-second wait it was written
 * against and does not cover a two-and-a-half-minute one, where the peripheral question
 * stops being *do I need to act* and becomes *is this thing alive at all*. Strength answers
 * it in the direction that helps — the line gets more present the longer it has been — and
 * costs neither the accent nor a pixel of travel. `WindStroke` argues the property choice.
 *
 * **The one state that is a call to act gets a shape instead.** Parked on a request, the
 * stroke stops where it was and an 18px break opens in the line. Stopping is
 * `animation-play-state: paused`, which is literally "where it was" and needs no clock of
 * spool's; a break is static, which is correct for a thing that has stopped, and nothing
 * else in this rail is a discontinuous line.
 *
 * The animation is `ui.css`'s, keyframes on one element's `translateX` and `scaleX`. Its
 * cost is stated rather than hidden: 420px of peripheral travel every 1.6s at 0.26px/ms,
 * the largest moving thing in the rail. What it buys is that the transcript gives up
 * nothing at all.
 */
/**
 * Where the strength ramp tops out, in milliseconds of one silence.
 *
 * 30 seconds, off the thinking blocks in the captures rather than off taste: 22 of the 27
 * are 1,050 estimated tokens or fewer, which is under 18 seconds at the 16.7ms a token the
 * four sequential captures measure. So an ordinary turn lives in the bottom of the ramp
 * and never reaches the top, and the five long ones — up to 9,500 tokens, two minutes
 * thirty-nine — arrive there and stay.
 */
const WIND_FULL_AT = 30_000;
/** what the stroke has always been, and the floor the ramp starts from */
const WIND_FLOOR = 0.75;

/**
 * How present the stroke is, for a silence this long.
 *
 * Exported because it is the whole of the behaviour and the only part of it worth
 * asserting: mounted, the ramp can only be read at whatever instant a test happens to
 * catch, and the thirty seconds it is defined over cannot be waited for. So the
 * arithmetic is tested as arithmetic and the rail is tested for being wired to it.
 */
export function windStrength(waited: number, laying: boolean): number {
	if (!laying) return WIND_FLOOR;
	return WIND_FLOOR + (1 - WIND_FLOOR) * Math.max(0, Math.min(1, waited / WIND_FULL_AT));
}

function WindStroke({ phase, waited }: { phase: TurnPhase; waited: number }) {
	// every state of a turn in flight draws the same thing, and a parked one draws it
	// stopped: the animation is the same instance either way, so pausing freezes the two
	// ends exactly where the request caught them
	const laying = phase === "playing" || phase === "asking";
	const parked = phase === "asking";
	/*
	 * The one thing the stroke now says about how long (#231).
	 *
	 * Strength and never pace, and the reason is the complaint this came from: the rail
	 * read as stopped, and slowing the only moving thing in it to say so would have been
	 * answering *is this alive* with less evidence that it is. Brightening says the same
	 * thing in the opposite direction — the longer it has been, the more present the line
	 * — and it leaves the travel exactly where it was.
	 *
	 * It is opacity on the colour the stroke already had rather than a colour of its own.
	 * This palette has one accent and `--color-thread` means the human's own thread: on
	 * the human's words, on the chip's rule, on a hot meter. Spending it here would give
	 * it a second meaning that has nothing to do with the first. Red would be worse still,
	 * because a long thought is the product working rather than a fault.
	 *
	 * A transition and not a keyframe, which is also why this is not pace. Opacity
	 * interpolates continuously and costs nothing; `animation-duration` on a running
	 * keyframe animation remaps the phase, and the head visibly jumps backwards every time
	 * the number moves.
	 */
	const strength = windStrength(waited, laying);
	return (
		<>
			<span
				aria-hidden="true"
				data-agent-wind={parked ? "parked" : laying ? "laying" : "idle"}
				style={{ opacity: strength }}
				className={cn(
					// scaled to nothing at rest, so idle is the border and nothing else: the
					// keyframes take the transform over for as long as they are running.
					// `transform` rather than Tailwind's `scale-x-0`, which compiles to the
					// `scale` property and would multiply the animation's own scale by zero
					"pointer-events-none absolute -top-px left-0 block h-px w-full origin-left bg-text [transform:scaleX(0)]",
					// 400ms, so the ramp is a drift rather than a per-tick step: the rail
					// re-renders on the pace's own clock and an untransitioned opacity would
					// change sixty times a second
					"transition-opacity duration-400 ease-linear motion-reduce:transition-none",
					laying && "animate-agent-wind",
					parked && "[animation-play-state:paused]",
				)}
			/>
			{/* the break, held rather than mounted so it can open over 200ms rather than
			    appear: it is a piece of the page laid over the hairline */}
			<span
				aria-hidden="true"
				data-agent-wind-break=""
				className={cn(
					"pointer-events-none absolute -top-px left-1/2 block h-px w-[18px] -translate-x-1/2 bg-bg transition-opacity duration-200 motion-reduce:transition-none",
					parked ? "opacity-100" : "opacity-0",
				)}
			/>
		</>
	);
}

/**
 * What the field says it is for, which is what the next press will do (#145, #200).
 *
 * Three, because Enter has three meanings here and the field is what each of them is
 * about: answering a question the turn is parked on, starting the thread again when its
 * session has aged out, and otherwise saying the next thing. A question wins over a
 * finished thread, because a parked turn is a live process and there is nothing to start.
 */
function fieldSays(answering: string | null, finished: boolean): string {
	if (answering !== null) return "or say it in your own words";
	return finished ? "say what to change · this starts a new thread" : "say what to change";
}

function Composer({
	phase,
	waited,
	finished,
	answering,
	strip,
	pointing,
	draft,
	onDraft,
	attached,
	onAttach,
	queued,
	model,
	limit,
	onSend,
	onQueue,
	onUnqueue,
	onStop,
	onAnswer,
}: {
	phase: TurnPhase;
	/** how long the request now out has been silent, which is all the stroke reads (#231) */
	waited: number;
	/**
	 * This thread's agent session is gone, so the next thing said starts a new one (#120).
	 *
	 * It is a hint rather than a refusal. The transcript is intact and worth reading, the
	 * words are not thrown away, and what the press will actually do is said out loud
	 * instead of a resume being offered that would fail.
	 */
	finished: boolean;
	/**
	 * The request Enter would answer, or null while Enter means what it always meant.
	 *
	 * A turn held at a question takes the press as the answer rather than as a new
	 * turn, and the tool prefers it that way: it tests a typed sentence before the
	 * picked options and tells the agent to read it carefully, because the person may
	 * ask for something else entirely. An option list was never the only way to answer.
	 */
	answering: string | null;
	strip: Strip;
	pointing: Pointing;
	/** controlled, because a take-back and a stop both write into the field (#170) */
	draft: string;
	onDraft: (text: string) => void;
	/**
	 * The reference riding with the words, which is bytes and never a path (#119).
	 *
	 * Controlled for the field's own reason: a message the queue held carries one, and
	 * taking it back has to put it where it came from rather than dropping it silently.
	 */
	attached: Attachment | null;
	onAttach: (attached: Attachment | null) => void;
	queued: readonly AgentQueued[];
	model: AgentModelDeck;
	limit: AgentLimit | null;
	onSend: (text: string, sent: AgentSent) => void;
	onQueue: (text: string, sent: AgentSent) => void;
	onUnqueue: (id: string) => void;
	onStop: () => void;
	onAnswer: (request: string, reply: AgentReply) => void;
}) {
	const field = useRef<HTMLTextAreaElement>(null);
	/*
	 * A turn parked on a question takes the press as its answer, and everything else in
	 * flight holds it.
	 *
	 * Parked is not finished: a turn held at an approval is still a live process holding
	 * the repo, so its press is queued the way a streaming one's is. Only a question
	 * turns the field into somewhere to answer, because only a question has somewhere
	 * for words to go.
	 */
	const busy = (phase === "playing" || phase === "asking") && answering === null;
	/*
	 * A stop is only ever offered against a turn in flight (#165, #180).
	 *
	 * `playing` and not `busy`: a parked turn has already stopped by itself, it is
	 * spending nothing and moving nowhere, and its way out is the question's own
	 * dismiss. Drawing the stop there would be drawing a running turn where there is
	 * none, which is the defect every parked frame in the prototype had.
	 */
	const cutting = phase === "playing";

	const resize = (element: HTMLTextAreaElement) => {
		element.style.height = "auto";
		element.style.height = `${Math.max(MIN_H, Math.min(element.scrollHeight, MAX_H))}px`;
	};

	// words handed back arrive from outside the field, so it has to re-fit to them the
	// way it does to typing (#170)
	// biome-ignore lint/correctness/useExhaustiveDependencies: the text is what decides the height — the box is measured through the ref
	useEffect(() => {
		const element = field.current;
		if (element !== null) resize(element);
	}, [draft]);

	const take = (text: string) => {
		onDraft("");
		onAttach(null);
		// captured here rather than read later: the chips that were up are the bytes
		// that went out, and the line under the words has to say so afterwards. For a
		// message the queue holds that is the whole contract, because it fires against a
		// canvas the hands have moved on from
		const sent: AgentSent = { context: contextOf(strip), attached, selection: pointing.entries };
		if (busy) onQueue(text, sent);
		else onSend(text, sent);
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target is not a control, and its keyboard path is the paste the field already takes
		<div
			className="relative flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5"
			onDragOver={(event) => {
				// `items` rather than `files`: while a drag is in flight the data store is in
				// protected mode and `files` is empty, so a guard that read it would never
				// accept the drag and the browser would navigate to the dropped picture
				if (!draggingAttachment(event.dataTransfer)) return;
				event.preventDefault();
				event.stopPropagation();
			}}
			onDrop={(event) => {
				const file = attachmentIn(event.dataTransfer);
				if (file === undefined) return;
				event.preventDefault();
				event.stopPropagation();
				void readAttachment(file).then(onAttach);
			}}
		>
			<WindStroke phase={phase} waited={waited} />
			<div className="flex min-h-0 flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5 transition-colors duration-150 focus-within:border-muted/45">
				<QueueBox queued={queued} onUnqueue={onUnqueue} />
				{attached === null ? null : <Attached attached={attached} onDrop={() => onAttach(null)} />}
				<SelectionStrip strip={strip} pointing={pointing} />
				{/*
				 * What the field is for, and what the press will do with it.
				 *
				 * #200's word about a thread whose session has aged out lives here rather than in
				 * the footer: the footer's 18px line went to the model (#184), and "this starts a
				 * new thread" is a fact about the words being typed rather than about which
				 * machine is answering.
				 */}
				<textarea
					ref={field}
					value={draft}
					rows={3}
					spellCheck={false}
					placeholder={fieldSays(answering, finished)}
					aria-label={fieldSays(answering, finished)}
					onChange={(event) => {
						onDraft(event.target.value);
						resize(event.target);
					}}
					onPaste={(event) => {
						// a screenshot in the clipboard is the commonest reference there is, and
						// pasting one is how it gets here: a browser never reveals a path, so
						// there is nothing else a paste could mean
						const file = attachmentIn(event.clipboardData);
						if (file === undefined) return;
						event.preventDefault();
						void readAttachment(file).then(onAttach);
					}}
					onKeyDown={(event) => {
						/*
						 * The canvas never sees this press: the hotkey dispatch returns on any
						 * keydown whose target is a textarea, and the composer is one. Enter sends
						 * and leaves focus here, so escape has been going nowhere at the exact
						 * moment a turn is running — which is why a turn in flight can have it
						 * without taking a rung off the ladder out there (#165).
						 */
						if (event.key === "Escape") {
							if (!cutting) return;
							event.preventDefault();
							onStop();
							return;
						}
						if (event.key !== "Enter" || event.shiftKey) return;
						event.preventDefault();
						const text = draft.trim();
						if (text === "") return;
						// answering answers, busy queues, otherwise sends — the three meanings of
						// one press, resolved by what the turn is doing (#170)
						if (answering !== null) {
							onDraft("");
							event.currentTarget.style.height = `${MIN_H}px`;
							onAnswer(answering, { kind: "said", text });
							return;
						}
						event.currentTarget.style.height = `${MIN_H}px`;
						take(text);
					}}
					className="w-full resize-none bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
					style={{ height: MIN_H }}
				/>
			</div>
			{/*
			 * The footer holds the model and the stop, and nothing else (#184).
			 *
			 * 243 wanted at every width — the model's 160, the stop's 73 and the gap between
			 * them — with no threshold and no ladder across the rail's whole 200–480 range.
			 * The three occupants #118, #122 and #165 each put here wanted 432 against 391 of
			 * box at 420, which wrapped the model to 24px inside an 18px line and elided the
			 * limit's reset time; the limit went to the menu on #122's own reasoning, and the
			 * send hint went because which machine is answering outranks a keyboard hint you
			 * learn once. #200's own word about a finished thread went with it, into the
			 * placeholder of the field it is a fact about.
			 *
			 * The model is the one thing here allowed to give way, and it truncates rather
			 * than shortening. The stop is `shrink-0`, because a cut name is still readable
			 * and half a stop button is not.
			 */}
			{/* the row is what the menu above it is measured against, not the trigger: a panel
			    anchored to a trigger that shrinks with its own text would move with the text,
			    and it has to be clamped to the composer's width rather than to a word's */}
			<div className="relative flex h-[18px] items-center justify-between gap-2.5">
				<ModelMenu model={model} limit={limit} />
				{cutting ? <StopButton onStop={onStop} /> : null}
			</div>
		</div>
	);
}

/* ---------- which machine is answering (#118, #122, #184, #186, #199) ----------
 * The readout, made a button. Five rows, because `list_models` offered five: no
 * grouping, no width switch and no policy section, because the reply already resolved
 * all of that and every one of those would have been spool inventing structure it
 * would then have to keep in sync.
 *
 * Nothing in here knows what a model is called. The names, the sentences and the
 * effort levels all arrive from the binary at runtime, and a press is a shortcut for
 * `/model haiku` rather than a second source of truth — so the readout follows the
 * reply and never the press, which is what keeps it from ever being wrong.
 *
 * None of it takes the thread accent. Chip and outline are one object out on the
 * canvas and they are the only colour on screen, so a control about which machine is
 * answering stays colourless like everything else the agent does. */

/** the footer's own voice, so the line reads as one line */
const QUIET = "font-mono text-2xs leading-3";

/**
 * How wide the panel wants to be, which is not always what it gets.
 *
 * 300 is what the menu was drawn at and what the sentence slot's reserve is measured
 * against. It is not a width that always fits: the rail drags down to 200, which leaves
 * 171px of composer, so the panel is clamped to the row it hangs off and gives way like
 * everything else in this footer. Wanting more than there is and being cut to fit is the
 * same act the model name makes one line below.
 */
const MENU_W = 300;

function ModelMenu({ model, limit }: { model: AgentModelDeck; limit: AgentLimit | null }) {
	const [open, setOpen] = useState(false);
	/**
	 * What the one slot is describing, which is one piece of state rather than two.
	 *
	 * A model's value and an effort level cannot collide — the levels are a closed set
	 * the binary names and a model value is an alias like `opus[1m]` — so the slot that
	 * answers both is one slot.
	 */
	const [over, setOver] = useState<string | null>(null);
	const { offer, levels } = model;
	const pin = offer.current.pin;
	const says = menuSays(offer, over);
	const longest = menuLongest(offer);
	// read at draw time rather than held: the reset is a clock time inside a day and a
	// weekday past that, so what it says depends on when it is being read
	const usage = limit === null ? null : limitReadout(limit, Date.now());

	const show = (next: boolean) => {
		setOpen(next);
		setOver(null);
		// the answer is the installed binary's, so opening asks again rather than drawing
		// whatever was true when the rail mounted
		if (next) model.refresh();
	};

	return (
		// no `relative` of its own: the panel is positioned against the footer row, so its
		// width is clamped to the composer rather than to however long the name happens to be
		<span data-agent-model={model.readout} className="flex min-w-0">
			{open ? (
				<button
					type="button"
					aria-label="close the model menu"
					className="fixed inset-0 z-10 cursor-default"
					onClick={() => show(false)}
				/>
			) : null}
			<button
				type="button"
				aria-label="model"
				aria-expanded={open}
				onClick={() => show(!open)}
				className={cn(
					QUIET,
					"flex min-w-0 items-center gap-1 transition-colors duration-150",
					open ? "text-muted" : "text-muted/45 hover:text-muted",
				)}
			>
				{/*
				 * It truncates, and it never shortens.
				 *
				 * The name is the binary's own `displayName`, uncased and unshortened, because
				 * the moment spool rewrites it spool owns it — and the captured reply is what
				 * gives that rule teeth. Five rows come back and none of them is `Opus`: there
				 * is `Default (recommended)` and there is `Opus (1M context)`, both resolving to
				 * the same model, and the parenthetical is the only thing telling them apart,
				 * while `/model opus` is accepted and resolves to Opus *without* the 1M window.
				 * So `Opus · high` here would not be a short name for this machine, it would be
				 * the correct name of a different one under a transcript this one wrote.
				 *
				 * An ellipsis is not that. `Opus (1M cont…` is visibly cut and reads as cut, the
				 * whole string stays in the DOM, and the full name is one press up in the menu.
				 */}
				<span className="min-w-0 truncate">{model.readout}</span>
				<ChevronIcon open={open} className="h-2 w-2 shrink-0" />
			</button>
			{open ? (
				// biome-ignore lint/a11y/noStaticElementInteractions: leaving the panel only puts the slot back to describing the model that is set, and a keyboard reader never has a pointed row for it to return from
				<div
					data-agent-model-menu=""
					style={{ width: MENU_W }}
					// `max-w-full` against the footer row, which is the composer's own width: the
					// rail drags to a 200 floor with 171px of box, and a fixed 300 would be cut off
					// by the rail's own `overflow-hidden` rather than fitting inside it
					className="absolute bottom-full left-0 z-20 mb-2 max-w-full animate-agent-menu-in origin-bottom-left rounded-md border border-border-raised bg-raised p-1.5"
					onMouseLeave={() => setOver(null)}
				>
					{/*
					 * The window, in here rather than beside the trigger (#122, #184).
					 *
					 * #122 chose the footer on one line of the binary's own advice: the remedy for
					 * running out is a model switch, every time, so the fact should sit next to the
					 * lever instead of writing out `try /model sonnet`. That argument survives the
					 * move and is the reason for it — the lever is not the trigger, it is this
					 * list, and the fact is now inside it.
					 *
					 * What forced it is width. The rail is drag-resizable 200–480; at 420 the line
					 * clipped to `resets…`, and the reset time is half of what the readout is for,
					 * since ninety-two per cent of a week is a different fact depending on whether
					 * it comes back Wednesday or in an hour. In here it renders whole at every rail
					 * width.
					 *
					 * It is a fact and not a row, so it takes no row shape and cannot be hovered
					 * into the sentence slot. It is absent outright until the binary warns — below
					 * that the payload carries no utilization at all, so there is no gauge to draw.
					 */}
					{usage === null ? null : (
						<>
							<span
								data-agent-usage=""
								className={cn(
									QUIET,
									"block px-1.5 pt-1 pb-1.5",
									// brightness rather than hue: reached comes forward without becoming a
									// second accent, and a warning stays a peer of the rows below it
									limit?.status === "rejected" ? "text-text/70" : "text-muted/45",
								)}
							>
								{usage}
							</span>
							<MenuRule />
						</>
					)}
					{/*
					 * One line per row, and one sentence for the whole menu (#186).
					 *
					 * A row is its name and nothing else, and the slot at the bottom describes
					 * whatever the cursor is on — a model or an effort level, the same slot either
					 * way. That kills four complaints with one move. The list stops repeating
					 * itself, which it did literally: `Default (recommended)` and `Opus (1M
					 * context)` resolve to the same model and so carried the same sentence, word
					 * for word, on adjacent rows. Rows stop being ragged, since a description
					 * wrapped to one line or two depending on where the sentence fell and gave
					 * five rows five heights. And effort stops being a second shape.
					 *
					 * It is not a new idea: the effort row already worked this way and was the only
					 * part of the menu nobody objected to.
					 */}
					{offer.models.map((entry) => (
						<MenuRow
							key={entry.value}
							label={entry.displayName}
							on={offer.current.value === entry.value}
							onOver={() => setOver(entry.value)}
							onPick={() => {
								model.choose({ value: entry.value });
								show(false);
							}}
						/>
					))}
					{levels.length === 0 ? null : (
						// the block reports the pointer as well as its rows do, because a row the
						// environment killed reports nothing: a disabled control fires no mouse event,
						// so the one row you would hover to ask why it is dead had no way to answer
						// biome-ignore lint/a11y/noStaticElementInteractions: pointing at the block only picks which sentence the one slot shows, and a keyboard reader has no pointer to point with
						<span onMouseEnter={pin === null ? undefined : () => setOver(pin)}>
							<MenuRule />
							{/* effort keeps the menu open on a press: it is a refinement of the model
							    above it rather than a second decision */}
							<MenuGroup label="effort" />
							{levels.map((level) => (
								<MenuRow
									key={level}
									label={level}
									on={offer.current.effort === level}
									dead={pin !== null && pin !== level}
									onOver={() => setOver(level)}
									onPick={() => model.choose({ effort: level })}
								/>
							))}
						</span>
					)}
					{/*
					 * The slot, reserving the tallest thing it can ever say.
					 *
					 * Everything it can say is the binary's own words and they are wildly uneven:
					 * `max` runs 165 characters against `xhigh`'s 76 and `low`'s 57, and the model
					 * sentences are longer again. Sized to the longest with the live one drawn over
					 * it, because the panel opens upward — a line that grew as the cursor crossed a
					 * row would move the menu's own top edge, and a pointer must never move what it
					 * is pointing at.
					 *
					 * It sits outside the effort block, because a model with no effort levels still
					 * has a description: haiku reports no levels at all and the control is then
					 * absent rather than greyed. Its sentence is not.
					 */}
					{/* `leading-[1.5]` over the footer's own `leading-3`: this is the one thing in
					    here that wraps, and 12px lines on a 10px face is a line for reading along
					    rather than a paragraph to read */}
					<p
						data-agent-model-says={says}
						className={cn(QUIET, "relative px-1.5 pt-1.5 pb-0.5 text-muted/40 leading-[1.5]")}
					>
						<span className="invisible" aria-hidden="true">
							{longest}
						</span>
						<span className="absolute inset-x-1.5 top-1.5">{says}</span>
					</p>
				</div>
			) : null}
		</span>
	);
}

/**
 * One row: the name, and nothing else on the line.
 *
 * `dead` is the effort the environment holds — measured, an exported
 * `CLAUDE_CODE_EFFORT_LEVEL` refuses an in-session change and names itself in the
 * refusal, so a level nobody can pick is drawn as one nobody can pick rather than as
 * one that silently does nothing.
 */
function MenuRow({
	label,
	on,
	dead = false,
	onOver,
	onPick,
}: {
	label: string;
	on: boolean;
	dead?: boolean;
	/** the row reports the cursor; the menu owns the one slot that answers it (#186) */
	onOver: () => void;
	onPick: () => void;
}) {
	return (
		<button
			type="button"
			data-agent-model-row={label}
			disabled={dead}
			aria-current={on}
			onMouseEnter={onOver}
			onClick={onPick}
			className={cn(
				"flex w-full min-w-0 rounded-xs px-1.5 py-1 text-left transition-colors duration-150",
				dead ? "text-muted/30" : on ? "bg-surface text-text" : "text-text/70 hover:bg-surface/60",
			)}
		>
			<span className="min-w-0 truncate font-mono text-xs leading-4">{label}</span>
		</button>
	);
}

function MenuGroup({ label }: { label: string }) {
	return <span className={cn(QUIET, "block px-1.5 pt-1 pb-1.5 text-muted/35")}>{label}</span>;
}

function MenuRule() {
	return <span className="my-1 block h-px bg-border" />;
}

/**
 * The way out of a turn that is already running (#165).
 *
 * It sits in the footer rather than in the composer box or at the live edge. The box
 * loses because spool has no send button to morph — Enter sends — so it would be
 * adding the slot it deliberately lacks and leaving it empty whenever no turn runs.
 * The live edge loses because it travels, fastest exactly when rows are piling up,
 * and scrolls away the moment you read back.
 *
 * The press is not a convenience beside the key. Escape works while focus is in the
 * field, and clicking out to the canvas to watch a frame repaint — which is the state
 * this whole thing is built for — gives the ladder out there its key back. The press
 * is the exit that works from wherever the eyes are.
 *
 * The glyph says which key, quietly, because that is where the key is learned.
 */
function StopButton({ onStop }: { onStop: () => void }) {
	return (
		<button
			type="button"
			onClick={onStop}
			className="flex h-[18px] w-fit shrink-0 items-center gap-2 rounded-sm border border-border-raised bg-raised px-2 transition-colors duration-150 hover:border-muted/45"
		>
			<span className="h-2 w-2 shrink-0 rounded-[1px] bg-text" />
			<span className="font-mono text-2xs text-text leading-3">stop</span>
			<span className="font-mono text-2xs text-muted/60 leading-3">⎋</span>
		</button>
	);
}

/* ---------- the queue, inside the composer (#170, #176) ----------
 * A queued message has not left your hands. The log is where things that have
 * happened live and the composer is where your words live, so a message committed and
 * not sent stays in the second one — dimmed, because committed is not sent, and above
 * the field, because the thing being written now is the one nearest the cursor.
 *
 * It makes three things geometry rather than rules. Firing is the send it already is:
 * the stack leaves this box and lands in the log, the exact journey every message in
 * the transcript already made. Take-back is a drop rather than a jump: the row is
 * sitting on the field it returns to, which is the invariant drawn instead of stated.
 * And the stack is what fires together, because every held message goes out at once
 * and the binary reads all of them as one turn.
 *
 * What it costs is room, and the cost lands on the log: an unbounded queue would push
 * the transcript off the top, so it caps and scrolls inside itself. */

/** as much of the composer as the queue may take before it scrolls inside itself */
const QUEUE_H = 164;

function QueueBox({ queued, onUnqueue }: { queued: readonly AgentQueued[]; onUnqueue: (id: string) => void }) {
	if (queued.length === 0) return null;
	return (
		<div className="flex min-h-0 flex-col gap-2.5">
			<div
				data-agent-queue=""
				className="pages-scrollbar flex min-h-0 flex-col gap-3.5 overflow-x-hidden overflow-y-auto"
				style={{ maxHeight: QUEUE_H }}
			>
				{queued.map((message) => (
					<QueuedRow key={message.id} message={message} onDrop={() => onUnqueue(message.id)} />
				))}
			</div>
			{/* the composer's own internal rule, the one the selection strip already sits
			    above: a second border would read as a second place to type */}
			<span className="h-px shrink-0 bg-border-raised" />
		</div>
	);
}

/**
 * One waiting message, which is the log's own user row and not a new object.
 *
 * A queued message is the only thing this rail draws that has not happened yet, so it
 * cannot wear the transcript's receipt — but it is about to become one, which is why
 * the anatomy has to match to the pixel: the same 2px rail, the same text size, the
 * same mono line under it that a context sits on. Every one of those is dimmed and
 * the line says `queued`. The moment it fires it is not replaced by a row, it is the
 * row.
 *
 * The rail is the one thing that does not dim: it says whose words these are, and
 * that was settled the moment they were typed. What is provisional is only whether
 * they have gone out.
 *
 * The ✕ stands alone rather than splitting the row's click, because one destination
 * cannot need two targets — words that leave the queue un-fired land back in the box,
 * and there is nowhere else for them to go. It is on hover, in the vocabulary a chip's
 * own removal already uses, because the resting state here is two lines of your own
 * words waiting their turn.
 */
function QueuedRow({ message, onDrop }: { message: AgentQueued; onDrop: () => void }) {
	return (
		<div data-agent-queued="" className="group relative flex shrink-0 animate-agent-entry flex-col gap-1 pl-3.5">
			<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
			<p className="whitespace-pre-wrap text-base text-text/45 leading-base">{message.text}</p>
			<span className="flex h-3.5 items-center gap-1.5">
				<span className="font-mono text-2xs text-muted/55 leading-3">queued</span>
				{/* no plate behind it, unlike the composer chip's own ✕: in a dimmed row a
				    filled box is the brightest thing on the line, and the row is what is
				    being read */}
				<button
					type="button"
					onClick={onDrop}
					aria-label={`take back ${message.text}`}
					className="flex h-3.5 w-3.5 items-center justify-center text-muted/0 transition-colors duration-150 hover:text-text group-hover:text-muted/50"
				>
					<CloseIcon />
				</button>
			</span>
		</div>
	);
}

/* ---------- the reference that rides along (#119) ----------
 * Look-only, and nothing lands. The bytes go down the same stdin the prompt does,
 * so the project gains no file, no inbox and no deleter — the agent's own
 * transcript is the durable copy, outside the repo. The cost is stated rather than
 * hidden: a browser never reveals a dropped file's path, so a logo cannot be added
 * to the project this way, and adding an asset is already a deliberate import into
 * `design/shared/assets/`.
 *
 * It arrives by paste or by drop and by nothing else. The footer holds the model and
 * the stop and nothing else (#184), and the chip line is the selection's, so a
 * button would need a slot the composer deliberately does not have — where a
 * pasted screenshot is the gesture people already have in their hands. */

/** how wide the tile is: enough to recognise a screenshot, not enough to read it */
const ATTACHED_W = 44;

/**
 * The tile has two things to do, so it has two targets.
 *
 * The picture is the press, because at this size it can be recognised and not checked,
 * and checking it is what a reference is for: it goes up over the rail in the same
 * overlay a tool call's screenshot goes up in. Taking the reference back is the ✕ in
 * the corner, the smaller target, because it is the rarer intent and the only one of
 * the two that cannot be undone.
 *
 * The ✕ is on hover, in the vocabulary the ✕ on a thread and on a chip already uses.
 * It carries a plate the chip's does not, because it sits on a picture rather than on
 * a surface, and an unbacked glyph over arbitrary pixels is not always there.
 */
function Attached({ attached, onDrop }: { attached: Attachment; onDrop: () => void }) {
	const [big, setBig] = useState(false);
	// held across renders for the reason `Shot` holds its own: the rail re-projects on
	// a clock and the string is the size of the picture, now read in two places
	const src = useMemo(() => `data:${attached.media};base64,${attached.data}`, [attached.media, attached.data]);
	return (
		<>
			<span
				data-agent-attached=""
				className="group relative flex w-fit shrink-0 overflow-hidden rounded-xs border border-border-raised bg-bg"
				style={{ width: ATTACHED_W, height: ATTACHED_W }}
			>
				{/* the picture is its own label: `image/png` is a fact about a file and this is a
				    thing you can see */}
				<button type="button" onClick={() => setBig(true)} className="flex h-full w-full cursor-zoom-in">
					<img src={src} alt="attached reference" className="h-full w-full object-cover" />
				</button>
				<button
					type="button"
					onClick={onDrop}
					aria-label="drop the attached image"
					className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-bl-xs bg-bg/0 text-muted/0 transition-colors duration-150 hover:text-text group-hover:bg-bg/70 group-hover:text-muted/70"
				>
					<CloseIcon />
				</button>
			</span>
			{/* beside the tile rather than inside it: the tile clips to 44px, and a picture held
			    over the whole rail cannot hang off something that small.
			    No caption, because a browser never reveals a dropped file's path and there is
			    nothing else to say that the picture is not already saying */}
			<Lightbox open={big} onClose={() => setBig(false)} caption={null}>
				<img src={src} alt="attached reference" className="block max-h-full max-w-full" />
			</Lightbox>
		</>
	);
}

/**
 * Whether a drag in flight is carrying something that could ride along.
 *
 * A dragging browser keeps its data store in protected mode, so `files` is empty
 * until the drop and only each item's `kind` and `type` can be read — which is
 * exactly enough, and reading `files` here would refuse every drag.
 */
function draggingAttachment(data: DataTransfer | null): boolean {
	return Array.from(data?.items ?? []).some((item) => item.kind === "file" && ATTACHMENT_MEDIA.has(item.type));
}

/**
 * The picture in a drop or a paste, if it is one spool can send.
 *
 * The composer refuses exactly what the daemon refuses (`src/attachment.ts`), so a
 * tile never draws for something the turn would be turned away for: nothing appearing
 * is a smaller cost than a prompt lost to a refusal after Enter.
 */
function attachmentIn(data: DataTransfer | null): File | undefined {
	return Array.from(data?.files ?? []).find((file) => isSendableAttachment(file));
}

/**
 * The file as the bytes the agent reads.
 *
 * Chunked because `String.fromCharCode` takes its bytes as arguments and a
 * screenshot is hundreds of thousands of them, which is a stack overflow rather
 * than a slow call.
 */
async function readAttachment(file: File): Promise<Attachment> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	for (let at = 0; at < bytes.length; at += 8192) {
		binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
	}
	return { media: file.type, data: btoa(binary) };
}

/* ---------- what the hands are pointing at ----------
 * The selection sits in the composer and goes out with the message without being
 * asked for. Its accent is the one the entry wears out on the canvas, because the
 * chip and the outline are one object — which is why hovering either lights the
 * other, and why a chip that cannot be paired with a box out there is a chip that
 * should not be drawn.
 *
 * One line, always. Either the chips fit on it or the strip is a count; the composer
 * never grows downward to make room for context, because the space below is the
 * prompt's. Opening the count is the human asking for the list, and then it is a
 * list: hoverable, individually droppable, eight rows before it scrolls inside
 * itself and no bar when it does. */

/** rows the open list shows before it starts scrolling under a fade */
const ROWS_SHOWN = 8;

function SelectionStrip({ strip, pointing }: { strip: Strip; pointing: Pointing }) {
	const [open, setOpen] = useState(false);
	if (strip.kind === "none") return null;

	// no wrap: the strip is chips because they fit on one line, and a second line
	// would be the rule breaking quietly rather than the count taking over. If the
	// estimate is off by a few pixels a chip truncates instead
	if (strip.kind === "chips") {
		return (
			<span data-agent-chips="" className="flex min-w-0 items-center gap-1.5">
				{strip.chips.map((chip) => (
					<Chip
						key={chip.id}
						words={chip}
						lit={pointing.lit === chip.id}
						onLight={pointing.onLight}
						// the entered frame is the one chip whose ✕ has nowhere to land:
						// removal mirrors the canvas, and out there the only way to stop
						// pointing at the frame you are inside is to leave it (#139)
						onDrop={strip.inside ? undefined : () => pointing.onDrop(chip.id)}
					/>
				))}
			</span>
		);
	}

	return (
		<span data-agent-chips="" className="flex min-w-0 flex-col gap-1.5">
			<span className="flex min-w-0 items-center">
				{/* the whole list rather than an entry's own id: the cursor on a count lights
				    every box the count stands for */}
				<Chip
					words={{ id: WHOLE_SELECTION, label: strip.label }}
					lit={pointing.lit !== null}
					open={open}
					onOpen={() => setOpen(!open)}
					onLight={pointing.onLight}
					// the count's own ✕ drops the whole selection, which is the one act the
					// canvas cannot do for you while you are standing inside a frame
					onDrop={() => pointing.onDrop(null)}
				/>
			</span>
			{open ? (
				/* Eight rows and then it scrolls, and it scrolls without a bar: the list is
				   for reaching one member, never for reading forty, and a native scrollbar in
				   a 420 rail is a grey slab across the only accent on screen. The fade says
				   there is more the way the transcript's does. */
				<span className="relative flex flex-col">
					<span className="flex max-h-[208px] flex-col overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{strip.chips.map((chip) => (
							<button
								key={chip.id}
								type="button"
								data-agent-chip-row={chip.label}
								onMouseEnter={() => pointing.onLight(chip.id)}
								onMouseLeave={() => pointing.onLight(null)}
								onClick={() => pointing.onDrop(chip.id)}
								className={cn(
									"group flex h-[26px] shrink-0 items-center gap-2 rounded-xs px-1 text-left",
									pointing.lit === chip.id && "bg-surface",
								)}
							>
								<span
									className={cn(
										"h-2.5 w-[2px] shrink-0 rounded-full",
										pointing.lit === chip.id ? "bg-thread" : "bg-thread/40",
									)}
								/>
								<span className="min-w-0 flex-1 truncate font-mono text-text/80 text-xs leading-4">
									{chip.label}
								</span>
								<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/0 group-hover:text-muted/60">
									<CloseIcon />
								</span>
							</button>
						))}
					</span>
					{strip.chips.length > ROWS_SHOWN ? (
						<span className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-surface to-transparent" />
					) : null}
				</span>
			) : null}
		</span>
	);
}

function Chip({
	words,
	lit,
	open,
	onOpen,
	onLight,
	onDrop,
}: {
	words: ChipWords;
	lit: boolean;
	open?: boolean;
	onOpen?: () => void;
	onLight: (id: string | null) => void;
	/** absent when there is nothing a ✕ could do — then the chip has no ✕ at all */
	onDrop?: (() => void) | undefined;
}) {
	const body = (
		<>
			<span className={cn("h-3 w-[2px] shrink-0 rounded-full", lit ? "bg-thread" : "bg-thread/55")} />
			<span className="min-w-0 truncate font-mono text-text/85 text-xs leading-4">{words.label}</span>
			{onOpen === undefined ? null : (
				<ChevronIcon open={open ?? false} className="h-2.5 w-2.5 shrink-0 text-muted/40" />
			)}
		</>
	);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the cursor lighting the box out on the canvas is a hover reading, and its own controls are buttons
		<span
			data-agent-chip={words.label}
			className={cn(
				"flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border bg-raised pl-2 transition-colors duration-150",
				// the ✕'s own padding goes with it, or the chip keeps a gap it no longer uses
				onDrop === undefined ? "pr-2.5" : "pr-1",
				lit ? "border-thread/45" : "border-border-raised",
			)}
			onMouseEnter={() => onLight(words.id)}
			onMouseLeave={() => onLight(null)}
		>
			{onOpen === undefined ? (
				body
			) : (
				<button
					type="button"
					onClick={onOpen}
					aria-expanded={open ?? false}
					className="flex min-w-0 items-center gap-2 text-left"
				>
					{body}
				</button>
			)}
			{onDrop === undefined ? null : (
				<button
					type="button"
					onClick={onDrop}
					aria-label={`drop ${words.label}`}
					className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/50 transition-colors duration-150 hover:bg-surface hover:text-text"
				>
					<CloseIcon />
				</button>
			)}
		</span>
	);
}
