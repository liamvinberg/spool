import type { RefObject } from "react";
import type { Life, Thread } from "../../../shared/lib/agent-threads";
import { askOf } from "../../../shared/lib/many-threads";
import { cn } from "../../../shared/lib/utils";
import { PlusIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/** the row's height, which is the plan strip's: one line of chrome, not two */
export const PAGER_H = 34;

/**
 * One line that never grows, whatever the deck holds.
 *
 * Every other switcher on this page spends room per thread: the strip gives each one at
 * least a 36px mark, the column gives each one a 34px cell, the finder gives each one a
 * 52px row while it is open. This spends the same pixels on one thread and on a hundred,
 * because it never draws more than three of them — the one you are in, and the two either
 * side of it, reduced to their marks.
 *
 * **The name you are given is the live one.** A thread's ask is what you wanted twenty
 * minutes ago; its last line is what it is doing now, in the rail's own nouns. On a pager
 * the name is all you have, so it carries the more useful of the two: `write
 * cart--empty-b` while a turn runs, the ask once it is settled, `new thread` when nobody
 * has typed. **This breaks a sibling of the rail's no-re-sorting rule and it is meant
 * to**: the label changes under you while a turn runs, where the strip's never does. The
 * order still does not, which is what the rule was actually protecting — nothing moves,
 * only what one thing says.
 *
 * **What the ends do.** They stop. Wrapping from the oldest conversation round to the
 * newest is a jump dressed as a step, so at either end the chevron is simply dead.
 *
 * **The aggregate mark is one mark and no number.** `--nav-shut` drew a count for the
 * agent's own threads next to a count of connections and rejected it in its own words —
 * *one number doing two jobs moved rather than fixed*. The number here is the position,
 * so the state next to it is a single mark for the loudest thing happening anywhere in
 * the deck: waiting over working over unread, which is #161's own ranking.
 */
export function Pager({
	threads,
	open,
	onOpen,
	moving,
	label,
	machine,
	probe,
}: {
	threads: readonly Thread[];
	open: string;
	onOpen: (id: string) => void;
	/** every thread that is working, stuck or unread, wherever it is */
	moving: readonly Thread[];
	/** what this thread is called right now, which is the take's whole answer to the title */
	label: string;
	/**
	 * Whether those words are spool's rather than the human's.
	 *
	 * A live line and `new thread` are the machine printing, so they are lowercase mono;
	 * an ask is a sentence somebody typed, so it is sans, the same register the transcript
	 * gives the identical bytes ten pixels below. The strip today prints both in mono.
	 */
	machine: boolean;
	/** hung on the name, so the frame can print the room it actually got */
	probe?: RefObject<HTMLSpanElement | null> | undefined;
}) {
	const at = threads.findIndex((thread) => thread.id === open);
	const back = threads[at - 1];
	const on = threads[at + 1];
	const alone = threads.length < 2;
	const loudest: Life | undefined = moving.some((thread) => thread.life === "waiting")
		? "waiting"
		: moving.some((thread) => thread.life === "running")
			? "running"
			: moving.some((thread) => thread.life === "unread")
				? "unread"
				: undefined;

	return (
		<div className="flex shrink-0 items-stretch border-border border-b" style={{ height: PAGER_H }}>
			{/* the plus leads, because the row is read left to right and *new* belongs before
			    the newest rather than after the oldest (#144) */}
			<button
				type="button"
				aria-label="New thread"
				className="flex w-9 shrink-0 items-center justify-center border-border border-r text-muted/45 transition-colors duration-150 hover:text-text"
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>
			<div className="flex min-w-0 flex-1 items-center gap-2 px-2.5">
				{alone ? null : (
					<Step dir="back" thread={back} onGo={() => back !== undefined && onOpen(back.id)} />
				)}
				<span
					ref={probe}
					className={cn(
						"min-w-0 flex-1 truncate leading-4",
						machine ? "font-mono text-muted/70 text-sm" : "text-base text-text",
					)}
				>
					{label}
				</span>
				{alone ? null : <Step dir="on" thread={on} onGo={() => on !== undefined && onOpen(on.id)} />}
			</div>
			{alone ? null : (
				<div className="flex shrink-0 items-center gap-2 border-border border-l px-2.5">
					<span className="font-mono text-2xs text-muted/50 leading-3 tabular-nums">
						{at + 1}/{threads.length}
					</span>
					{loudest === undefined ? null : <ThreadMark life={loudest} className="h-3 w-3" />}
				</div>
			)}
		</div>
	);
}

/**
 * One step of the deck: the chevron, and the mark of what is on the other side of it.
 *
 * The mark is the only thing this design says about a thread you are not in, so it goes
 * next to the control that would reach it rather than anywhere else.
 */
function Step({ dir, thread, onGo }: { dir: "back" | "on"; thread: Thread | undefined; onGo: () => void }) {
	const dead = thread === undefined;
	return (
		<button
			type="button"
			disabled={dead}
			onClick={onGo}
			aria-label={dead ? undefined : askOf(thread)}
			className={cn(
				"flex shrink-0 items-center gap-1 transition-colors duration-150",
				dead ? "text-muted/20" : "text-muted/55 hover:text-text",
			)}
		>
			{dir === "back" ? <Chevron dir="back" /> : null}
			<span className={cn("flex h-3.5 w-3.5 items-center justify-center", dead && "opacity-0")}>
				{dead ? null : <ThreadMark life={thread.life} />}
			</span>
			{dir === "on" ? <Chevron dir="on" /> : null}
		</button>
	);
}

function Chevron({ dir }: { dir: "back" | "on" }) {
	return (
		<svg viewBox="0 0 8 12" className="h-3 w-2 shrink-0" fill="none" aria-hidden="true">
			<path
				d={dir === "back" ? "M6 1.5 1.5 6 6 10.5" : "M2 1.5 6.5 6 2 10.5"}
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
