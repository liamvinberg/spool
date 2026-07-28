import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { Thread } from "../../../shared/lib/agent-threads";
import { cn } from "../../../shared/lib/utils";
import { ChevronIcon, PlusIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * One line for the thread you are in, and a place you go for the rest.
 *
 * The line is the plan strip's line, which is the shape this rail already uses for
 * a thing that is bigger than a row and still has to be one: a name, the state of
 * everything it stands for, a count, a chevron. Nothing about the other three
 * threads is on screen until you ask, except the one thing you would want to know
 * without asking, which is whether any of them is doing something or waiting to be
 * read. That is the pair of marks before the count.
 *
 * Open it and it is a list rather than a strip, so every field a thread has fits:
 * the ask, the page it belongs to, when it last did anything, and the line it is
 * on right now in the same nouns the transcript uses. Four threads is a quarter of
 * the rail. Forty would scroll and would still read.
 */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

export function ThreadHeader({
	threads,
	open,
	onOpen,
	listed = false,
}: {
	threads: readonly Thread[];
	open: string;
	onOpen: (id: string) => void;
	/** the list already down, because the list is the thing this frame is for */
	listed?: boolean;
}) {
	const still = useReducedMotion() === true;
	const [showing, setShowing] = useState(listed);
	const here = threads.find((thread) => thread.id === open) ?? threads[0];
	const rest = threads.filter((thread) => thread.id !== open);
	const working = rest.some((thread) => thread.life === "running" || thread.life === "streaming");
	const waiting = rest.some((thread) => thread.life === "unread");

	const pick = (id: string) => {
		onOpen(id);
		setShowing(false);
	};

	return (
		<div className="relative shrink-0 border-border border-b">
			{showing ? (
				<button
					type="button"
					aria-label="close the thread list"
					className="fixed inset-0 z-10 cursor-default"
					onClick={() => setShowing(false)}
				/>
			) : null}
			<button
				type="button"
				onClick={() => setShowing(!showing)}
				className="flex h-[34px] w-full items-center gap-2.5 px-3.5 text-left transition-colors duration-150 hover:bg-surface"
			>
				<span className="min-w-0 flex-1 truncate font-mono text-sm text-text/85 leading-4">{here?.ask}</span>
				<span className="flex shrink-0 items-center">
					{working ? <ThreadMark life="running" /> : null}
					{waiting ? <ThreadMark life="unread" /> : null}
				</span>
				<span className="shrink-0 font-mono text-muted/60 text-sm tabular-nums leading-4">{threads.length}</span>
				<ChevronIcon open={showing} className="h-2.5 w-2.5 shrink-0 text-muted/35" />
			</button>
			<AnimatePresence>
				{showing ? (
					<motion.div
						className="absolute top-full right-0 left-0 z-20 border-border border-b bg-bg pt-1 pb-1.5"
						initial={still ? false : { opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={still ? { opacity: 0 } : { opacity: 0, y: -6 }}
						transition={still ? { duration: 0 } : { duration: 0.2, ease: ARRIVE }}
					>
						{threads.map((thread) => (
							<Row key={thread.id} thread={thread} on={thread.id === open} onPick={() => pick(thread.id)} />
						))}
						<span className="mx-3.5 my-1 block h-px bg-border" />
						<button
							type="button"
							className="flex h-8 w-full items-center gap-2.5 px-3.5 text-left text-muted/45 transition-colors duration-150 hover:bg-surface hover:text-text"
						>
							<PlusIcon className="h-2.5 w-2.5 shrink-0" />
							<span className="font-mono text-sm leading-4">new thread</span>
						</button>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

/**
 * A thread as a row. Two lines, because a thread has two kinds of fact: what
 * somebody asked for, and where that has got to.
 *
 * The second line is `page · since · line`, and the line is the transcript's own
 * projection rather than the raw event, so `write cart--empty-b` here and `write
 * cart--empty-b` down there are the same sentence about the same moment.
 */
function Row({ thread, on, onPick }: { thread: Thread; on: boolean; onPick: () => void }) {
	return (
		<button
			type="button"
			onClick={onPick}
			className={cn(
				"relative flex w-full items-start gap-2.5 px-3.5 py-2 text-left transition-colors duration-150",
				on ? "bg-surface" : "hover:bg-surface/60",
			)}
		>
			{on ? <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-thread" /> : null}
			<ThreadMark life={thread.life} className="mt-px" />
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className={cn("truncate font-mono text-sm leading-4", on ? "text-text" : "text-text/75")}>
					{thread.ask}
				</span>
				<span className="flex min-w-0 items-center gap-1.5 font-mono text-2xs text-muted/50 leading-3">
					<span className="shrink-0">{thread.page}</span>
					<span className="shrink-0 text-muted/25">·</span>
					<span className="shrink-0 tabular-nums">{thread.since}</span>
					{/* a thread whose first reply has not landed has no line yet, and an
					    empty third field would leave a separator standing on its own */}
					{thread.last === "" ? null : (
						<>
							<span className="shrink-0 text-muted/25">·</span>
							<span className="min-w-0 truncate">{thread.last}</span>
						</>
					)}
				</span>
			</span>
		</button>
	);
}
