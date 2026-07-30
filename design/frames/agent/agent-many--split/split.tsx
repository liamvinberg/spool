import { useState } from "react";
import type { Thread } from "../../../shared/lib/agent-threads";
import { askOf } from "../../../shared/lib/many-threads";
import { cn } from "../../../shared/lib/utils";
import { ChevronIcon, PlusIcon } from "../../../shared/ui/spool-icons";
import { StateMark } from "../../../shared/ui/spool-play-rail";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * A thread's number, which is the only part of its name that never changes.
 *
 * The deck is newest first, so counting from the far end is creation order. In a running
 * project the numbers would be sparse — close thread 7 and there is no thread 7 again —
 * and that is a cost this take carries rather than hides: a permanent handle has to be
 * permanent, which means the sequence has holes in it.
 */
export function numberOf(threads: readonly Thread[], id: string): number {
	const at = threads.findIndex((thread) => thread.id === id);
	return at < 0 ? 0 : threads.length - at;
}

/**
 * The top pane's plate: a number, a sentence, and a way to change the sentence.
 *
 * **This take's answer to the title is that identity and description are two different
 * jobs and one string has been doing both.** `4` is the identity: two characters, never
 * truncated, never re-derived, stable for the life of the conversation, and sayable out
 * loud — *the one in thread 4* is a thing a person can actually say, which no prefix of a
 * sentence is. The ask is the description, and once identity is somewhere else the
 * description is free to be truncated, rewritten, or left as the first thing you typed.
 * Renaming replaces the sentence and never the number.
 *
 * It matters here more than anywhere else on this page because two conversations are on
 * screen at once, and telling them apart is the whole proposition. An unstarted thread is
 * `7 · new thread`, which is the one case where the number is doing all of the work and
 * doing it fine.
 *
 * The cost is plain: a number is not a memory aid. Nobody will remember that 4 was the
 * copy deck, so the sentence still has to be readable, and the number only earns its keep
 * where the sentence has been cut — in a pane header, in a watch row, in speech.
 */
export function ThreadPlate({
	number,
	thread,
	onRename,
}: {
	number: number;
	thread: Thread;
	onRename: (name: string) => void;
}) {
	const [editing, setEditing] = useState(false);
	return (
		<div className="flex h-[34px] shrink-0 items-center gap-2.5 border-border border-b px-3.5">
			<span className="shrink-0 font-mono text-2xs text-muted/50 leading-3 tabular-nums">{number}</span>
			{editing ? (
				<input
					// biome-ignore lint/a11y/noAutofocus: the press that opened it was the reach for the caret
					autoFocus
					defaultValue={thread.ask}
					onBlur={(event) => {
						onRename(event.currentTarget.value);
						setEditing(false);
					}}
					onKeyDown={(event) => {
						if (event.key !== "Enter" && event.key !== "Escape") return;
						if (event.key === "Enter") onRename(event.currentTarget.value);
						setEditing(false);
					}}
					className="min-w-0 flex-1 bg-transparent text-base text-text leading-base outline-none"
				/>
			) : (
				<button
					type="button"
					onClick={() => setEditing(true)}
					className="min-w-0 flex-1 truncate text-left leading-4"
				>
					<span className={thread.ask === "" ? "font-mono text-muted/60 text-sm" : "text-base text-text"}>
						{askOf(thread)}
					</span>
				</button>
			)}
			<button
				type="button"
				aria-label="New thread"
				className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted/45 transition-colors duration-150 hover:text-text"
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>
		</div>
	);
}

/**
 * The bottom of the rail, holding whatever is happening that you are not reading.
 *
 * **The switcher only ever lists what is moving.** Working, stuck, or finished and
 * unread — those three are the whole resting list, and everything else is not in it. So
 * the cost is bounded by *activity* rather than by count: one thread costs nothing at all
 * and the pane is absent, twelve threads with two of them working costs two rows, and a
 * project with forty finished conversations costs the same nothing as a project with one.
 * That is the opposite trade from every other take here, all of which pay by the thread.
 *
 * **Press a row and the rail is split.** The second thread opens in place as a live index
 * of its own rows — not a second transcript. Two transcripts do not fit and the frame
 * measures why: the rail is about 860px, the composer and the plates take their part, and
 * splitting what is left gives each side a box the `claude-plan` log outgrows several
 * times over. What a watch pane is actually for is *what is it doing now*, which is rows,
 * so rows is what it draws, in the transcript's own vocabulary — the same state mark, the
 * same verb and subject, the same nouns.
 *
 * **What it cannot do, stated rather than hidden.** There is no path from here to a
 * conversation that finished and was read. The count opens the full list as a disclosure,
 * which is the least this take can do and is honestly a borrowed answer: on the evidence
 * of these five frames this shape wants pairing with `agent-many--find` for history and
 * would carry only the live half itself.
 */
export function Watch({
	threads,
	moving,
	open,
	expanded,
	onExpand,
	onOpen,
	all,
	onAll,
}: {
	threads: readonly Thread[];
	moving: readonly Thread[];
	open: string;
	expanded: string | null;
	onExpand: (id: string | null) => void;
	onOpen: (id: string) => void;
	/** whether the pane is listing everything rather than only what is moving */
	all: boolean;
	onAll: (on: boolean) => void;
}) {
	const listed = all ? threads.filter((thread) => thread.id !== open) : moving;
	if (listed.length === 0 && !all) return null;
	return (
		<div className="flex shrink-0 flex-col border-border border-t">
			<div className="flex h-[26px] shrink-0 items-center gap-2 px-3.5">
				<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/50 leading-3">
					{all ? "every thread" : `${moving.length} moving`}
				</span>
				<button
					type="button"
					onClick={() => onAll(!all)}
					className="flex shrink-0 items-center gap-1.5 font-mono text-2xs text-muted/50 leading-3 transition-colors duration-150 hover:text-text"
				>
					{threads.length}
					<ChevronIcon open={all} className="h-2.5 w-2.5" />
				</button>
			</div>
			<div className="flex max-h-[300px] min-h-0 flex-col overflow-y-auto pb-1">
				{listed.map((thread) => (
					<Row
						key={thread.id}
						thread={thread}
						number={numberOf(threads, thread.id)}
						open={expanded === thread.id}
						onToggle={() => onExpand(expanded === thread.id ? null : thread.id)}
						onOpen={() => onOpen(thread.id)}
					/>
				))}
			</div>
		</div>
	);
}

function Row({
	thread,
	number,
	open,
	onToggle,
	onOpen,
}: {
	thread: Thread;
	number: number;
	open: boolean;
	onToggle: () => void;
	onOpen: () => void;
}) {
	return (
		<div className="flex flex-col">
			<div className={cn("flex h-[26px] shrink-0 items-center gap-2 px-3.5", open && "bg-surface/60")}>
				<ThreadMark life={thread.life} />
				<span className="shrink-0 font-mono text-2xs text-muted/40 leading-3 tabular-nums">{number}</span>
				{/* the name switches the pane you are reading; the row opens it beside what you
				    are reading. Two acts, two targets, and the wider one is the cheaper act */}
				<button type="button" onClick={onOpen} className="min-w-0 shrink truncate text-left leading-4">
					<span className={thread.ask === "" ? "font-mono text-muted/55 text-sm" : "text-base text-text/85"}>
						{askOf(thread)}
					</span>
				</button>
				<button
					type="button"
					onClick={onToggle}
					className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-muted/45 transition-colors duration-150 hover:text-text"
				>
					<span className="min-w-0 truncate font-mono text-2xs leading-3">{thread.last}</span>
					<ChevronIcon open={open} className="h-2.5 w-2.5 shrink-0" />
				</button>
			</div>
			{open ? <Index thread={thread} /> : null}
		</div>
	);
}

/**
 * The second thread, live, as rows rather than as a transcript.
 *
 * It is the last six things that happened, in the log's own drawing: the state mark, the
 * verb, the subject. Prose is one dimmed line and never a paragraph, because a paragraph
 * is the thing that does not fit and pretending otherwise is how a watch pane becomes a
 * bad transcript.
 */
function Index({ thread }: { thread: Thread }) {
	const rows = thread.entries.slice(-7);
	return (
		<div className="flex flex-col gap-1.5 border-border border-t border-b bg-surface/40 px-3.5 py-2.5">
			{rows.length === 0 ? (
				<span className="font-mono text-2xs text-muted/45 leading-4">nothing has happened here</span>
			) : (
				rows.map((entry) =>
					entry.kind === "line" ? (
						<div key={entry.key} className="flex items-center gap-2.5">
							<StateMark state={entry.state} />
							<span className="shrink-0 font-mono text-sm text-text/85 leading-4">{entry.verb}</span>
							<span className="min-w-0 flex-1 truncate font-mono text-sm text-muted/60 leading-4">
								{entry.subject ?? ""}
							</span>
						</div>
					) : entry.kind === "user" ? (
						<div key={entry.key} className="relative pl-3.5">
							<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
							<p className="truncate text-base text-text/70 leading-base">{entry.text}</p>
						</div>
					) : entry.kind === "prose" ? (
						<p key={entry.key} className="truncate text-base text-muted/60 leading-base">
							{entry.shown}
						</p>
					) : null,
				)
			)}
		</div>
	);
}
