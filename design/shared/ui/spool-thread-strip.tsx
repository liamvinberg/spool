import { type ReactNode, useEffect, useRef } from "react";
import type { Thread } from "../lib/agent-threads";
import { cn } from "../lib/utils";
import { PlusIcon } from "./spool-icons";
import { ThreadMark } from "./spool-thread-mark";

/**
 * Every thread, always on screen, in a rail that does not have room for them.
 *
 * It is the tab strip the rail already draws one level up, so it inherits that
 * language whole: the open one is named at full strength with the thread bar under
 * it, the rest are muted, and there is nothing else in the row. The only thing
 * added is the mark, which is the only thing a strip like this is actually for.
 *
 * Recency order, fixed once. A strip that re-sorted as threads worked would move
 * under the cursor, and a strip in creation order would bury the live thread off
 * the right edge on the day it matters. So the newest sits leftmost and stays
 * there, which also means the one you are reading is the one you can always see.
 *
 * Each thread floors at 112px and then the row scrolls, because the alternative is
 * four names truncated to three characters each. Four is where it goes: the fade
 * on the right edge is the fourth thread, and it is the cost of the idea drawn
 * rather than described.
 *
 * **How you reach the rest, settled in #144: the press centres the row on what was
 * pressed.** So the half-cut name at the edge is itself the way to the next one, and
 * the fade is what says there is a next one. It adds no control and no new gesture —
 * the click was already spent on opening the thread — which is why it beat a caret
 * per overflowing end, a count that opens a menu, and collapsing the overflow to bare
 * marks. All four are drawn at `agent-nav-strip`. A scroll bar was never on the table:
 * a trough across the top of a 420px rail is the loudest object in a near-black
 * interface, and it says *scroll me* when the thing worth saying is *there are four
 * more conversations and two of them are unread*.
 *
 * The cost is that reading the far end means switching to it, because one press does
 * both. Cheap, because switching a thread swaps the transcript and runs nothing.
 *
 * The plus leads the row. #144 needed the other end for the overflow answer, and
 * `centre` won by not using it — but the plus stays left, because the row is read
 * left to right and *new* belongs before the newest rather than after the oldest.
 *
 * Settled in #136, and this is the only chrome above the transcript now: #144 killed
 * the tab row the rail used to carry over it.
 */

export function ThreadStrip({
	threads,
	open,
	onOpen,
	height = 34,
	before,
	after,
}: {
	threads: readonly Thread[];
	open: string;
	onOpen: (id: string) => void;
	/** 34 on its own row; 44 once the row is also carrying the tabs (#144) */
	height?: number | undefined;
	/** cells sharing the row, ahead of the names and behind the plus (#144) */
	before?: ReactNode | undefined;
	after?: ReactNode | undefined;
}) {
	const here = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		here.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}, []);

	return (
		<div className="flex shrink-0 items-stretch border-border border-b" style={{ height }}>
			{/* the plus leads, because the room at the other end belongs to whatever says
			    there are more threads than fit */}
			<button
				type="button"
				aria-label="New thread"
				className="flex w-9 shrink-0 items-center justify-center border-border border-r text-muted/45 transition-colors duration-150 hover:text-text"
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>
			{before}
			<div className="relative min-w-0 flex-1">
				<div className="flex h-full items-stretch gap-3 overflow-x-auto px-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{threads.map((thread) => {
						const on = thread.id === open;
						return (
							<button
								key={thread.id}
								ref={on ? here : undefined}
								type="button"
								onClick={(event) => {
									onOpen(thread.id);
									// the press is the scroll: whatever was pressed comes to the middle,
									// which is what puts the next one in reach
									event.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
								}}
								className="group relative flex min-w-[112px] shrink-0 grow basis-0 items-center gap-2 text-left"
							>
								<ThreadMark life={thread.life} />
								<span
									className={cn(
										"min-w-0 truncate font-mono text-sm leading-4 transition-colors duration-150",
										on ? "text-text" : "text-muted/70 group-hover:text-muted",
									)}
								>
									{thread.ask}
								</span>
								{/* the bar says which of several is open, so with one thread there is no
								    which and it is 380px of the one accent saying nothing — it reads as a
								    progress bar, which is the opposite of what it means */}
								{on && threads.length > 1 ? (
									<span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" />
								) : null}
							</button>
						);
					})}
				</div>
				<span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent" />
			</div>
			{after}
		</div>
	);
}
