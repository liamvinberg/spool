import { useEffect, useRef } from "react";
import type { AgentEngineId } from "../../daemon/agent-engine";
import { cn } from "../cn";
import { CloseIcon, PlusIcon } from "../icons";
import { Float } from "./agent-float";
import { Spinner } from "./agent-marks";
import { engineName } from "./agent-menu";
import { useHeld } from "./agent-motion";
import { type Life, type Thread, UNSAID } from "./agent-threads";
import { ageOf } from "./frame-find";
import { PANE_VERB } from "./pane-tabs";
import { PaneActions } from "./pane-window";

/**
 * The conversations this project has, and what the pane may do about them (#136, #205).
 *
 * One bundle rather than six props for the reason `Pointing` and `FrameJump` are: they
 * arrive together, they change together, and the deck upstream already holds them as one
 * object. The list and the title both take the whole of it, because which thread is
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
	/** the ✕ in the list: it leaves the list, and neither the session nor the picture goes */
	readonly onClose: (id: string) => void;
	/** the + beside the title */
	readonly onNew: (engine?: AgentEngineId) => void;
}

/* ---------- the threads, off the title over the log (#136, #161, #200, #205, #364) ----------
 * One panel, and every other conversation reached from its title. The plate under the tab
 * holds the chat's title, which opens the switcher, and the tab row the + that starts a new
 * chat, and nothing else: what is moving in another thread is the Agent tab's one small dot,
 * or its rail icon's, and who answers
 * is the composer's. The list drops from the title over the log, one step up on a
 * hairline and a soft shadow, and leaves the way it came.
 *
 * No collapse caret: the side's own close is the thing that shuts it.
 *
 * Nothing is coloured and nothing re-sorts. State in this rail is motion, and the order is
 * recency fixed once, so a row never moves out from under a cursor already reaching for it.
 */

/**
 * The plate: which chat this is, as the switcher's trigger; and the + in the tab row.
 *
 * `listing` is the clock read when the list was opened, or null while it is shut: the
 * moment the list opened is the moment the ages in it are about.
 */
export function ThreadTitle({
	threads,
	listing,
	onList,
}: {
	threads: Threads;
	listing: number | null;
	onList: (at: number | null) => void;
}) {
	const { list, open, onNew } = threads;
	const name = list.find((thread) => thread.id === open)?.name ?? UNSAID;
	const listed = listing !== null;
	const title = useRef<HTMLButtonElement>(null);
	return (
		<>
			{/* the plate under the pane's tab: the tab already says Agent, so this names the chat */}
			<div
				data-agent-plate=""
				className="relative z-20 flex h-11 shrink-0 items-center border-border border-b bg-bg px-2"
			>
				<button
					ref={title}
					type="button"
					data-agent-thread-title=""
					aria-haspopup="dialog"
					aria-expanded={listed}
					title="Switch chat"
					onClick={() => onList(listed ? null : Date.now())}
					className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 text-left transition-colors duration-150 hover:bg-surface aria-expanded:bg-surface"
				>
					<span className={cn("min-w-0 flex-1 truncate type-label", name === UNSAID ? "text-muted" : "text-text")}>
						{name === UNSAID ? "New chat" : name}
					</span>
					{/* a caret that turns down while the list hangs from it */}
					<svg
						viewBox="0 0 12 12"
						className={cn(
							"h-2.5 w-2.5 shrink-0 origin-center text-muted/45 transition-transform duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
							listed && "rotate-90",
						)}
						fill="none"
						aria-hidden="true"
					>
						<path
							d="m4 2.5 3.5 3.5L4 9.5"
							stroke="currentColor"
							strokeWidth="1.25"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
			</div>
			<PaneActions>
				<button
					type="button"
					aria-label="New chat"
					onClick={() => {
						onList(null);
						onNew();
						title.current?.closest("[data-pane]")?.querySelector("textarea")?.focus({ preventScroll: true });
					}}
					className={PANE_VERB}
				>
					<PlusIcon />
				</button>
			</PaneActions>
		</>
	);
}

/**
 * The list, dropped from the title over the log for as long as it is asked for.
 *
 * One row per chat: its title, the agent it runs on only where that is not the usual one,
 * and its age, quiet, with a turning ring or a dot before the age while it runs or waits
 * unread. The open row holds the lightest wash. A close appears on hover.
 *
 * It goes the way a menu goes: a press on a row, on the title, or anywhere else, and
 * escape, taken on the way down before the composer or the canvas can read it as theirs.
 */
export function ThreadDrop({
	threads,
	preferred,
	now,
	onDone,
}: {
	threads: Threads;
	preferred: AgentEngineId | null | undefined;
	now: number | null;
	onDone: () => void;
}) {
	const { list, open, onOpen, onClose } = threads;
	const shown = now !== null;
	const at = useHeld(now) ?? Date.now();
	useEffect(() => {
		if (!shown) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			onDone();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [shown, onDone]);
	return (
		<>
			{shown ? (
				<button
					type="button"
					aria-label="close the threads"
					className="fixed inset-0 z-10 cursor-default"
					onClick={onDone}
				/>
			) : null}
			<Float open={shown} from="down" className="absolute inset-x-2 -top-1 z-20 max-h-[60%] overflow-y-auto p-1">
				<div role="dialog" aria-label="Chats" data-agent-threads="" className="flex flex-col">
					{list.map((thread) => (
						<ThreadRow
							key={thread.id}
							thread={thread}
							on={thread.id === open}
							named={thread.engine !== undefined && preferred != null && thread.engine !== preferred}
							now={at}
							onPick={() => {
								onOpen(thread.id);
								onDone();
							}}
							onClose={() => onClose(thread.id)}
						/>
					))}
				</div>
			</Float>
		</>
	);
}

function ThreadRow({
	thread,
	on,
	named,
	now,
	onPick,
	onClose,
}: {
	thread: Thread;
	on: boolean;
	/** it runs on another agent than the usual one, so the row says which */
	named: boolean;
	now: number;
	onPick: () => void;
	onClose: () => void;
}) {
	const marked = thread.life !== "read";
	return (
		<div className="group agent-thread-row relative flex">
			<button
				type="button"
				data-agent-thread={thread.name}
				data-agent-thread-life={thread.life}
				aria-current={on ? "true" : undefined}
				onClick={onPick}
				className={cn(
					"relative flex h-9 min-w-0 flex-1 items-center gap-3 rounded-sm pr-2 pl-2.5 text-left transition-colors duration-150",
					on ? "bg-raised" : "hover:bg-raised/60",
				)}
			>
				<span className="agent-thread-ask min-w-0 flex-1 truncate text-text type-control">
					{thread.name === UNSAID ? "New chat" : thread.name}
					{named ? (
						<span data-agent-thread-engine={thread.engine} className="pl-2 text-muted type-label">
							{engineName(thread.engine)}
						</span>
					) : null}
				</span>
				<span className="flex shrink-0 items-center gap-1.5 transition-opacity duration-[180ms] group-focus-within:opacity-0 group-hover:opacity-0">
					{marked ? <ThreadMark life={thread.life} /> : null}
					<span className="text-muted type-label tabular-nums">{ageOf(thread.at, now)}</span>
				</span>
			</button>
			{/* a close is a tidy rather than a delete: neither the agent's own session nor
			    spool's stored picture goes with the row */}
			<span className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 transition-opacity duration-[180ms] group-focus-within:opacity-100 group-hover:opacity-100">
				<button
					type="button"
					data-agent-thread-close={thread.name}
					aria-label={`close ${thread.name}`}
					onClick={onClose}
					className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:text-text"
				>
					<CloseIcon />
				</button>
			</span>
		</div>
	);
}

/**
 * What a thread is doing, in the smallest thing that can say it (#161).
 *
 * The box is always 14px whatever is inside it, so every row in the list draws its mark
 * in the same place and the marks stand in one line.
 *
 * Four drawings of five lives. Streaming and running turn the same ring, colourless,
 * because state in this rail is motion and the one accent belongs to the selection.
 * Waiting is `unread`'s disc held inside `running`'s ring — the turn that stopped, with
 * the thing that stopped it sitting in it — and it is the loudest of the three on
 * purpose, because it is the only one of them that is actually stuck. Unread is a solid
 * dot at text strength, the way a mailbox says it. Read is a hollow one, at the strength
 * a disabled thing gets rather than nothing at all, so a row for an old thread still
 * reads as pressable.
 *
 * Two candidates for waiting died on facts rather than taste. Freezing the spinner is
 * pixel-identical to what `prefers-reduced-motion` already renders for a working thread,
 * so it would be working's drawing with a second meaning for every reduced-motion reader.
 * Borrowing the disc alone breaks on the clearing rule: a disc clears when you open the
 * thread and a question does not, so a mark that spent it here would go quiet about a
 * thread that will never finish.
 */
function ThreadMark({ life, className }: { life: Life; className?: string }) {
	// the thread you are watching turns the same ring as the ones you are not: the two
	// lives are one drawing, and they are separate lives only because `streaming` is a
	// fact about this browser and never reaches disk
	const turning = life === "streaming" || life === "running";
	return (
		<span data-agent-mark={life} className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
			{turning ? (
				<Spinner className="h-3.5 w-3.5 text-text/60" />
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
