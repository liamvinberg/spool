import { useState } from "react";
import { askOf } from "../../../shared/lib/many-threads";
import type { Thread } from "../../../shared/lib/agent-threads";
import { cn } from "../../../shared/lib/utils";
import { CloseIcon, PlusIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/** the column's width, and every cell is square in it */
export const SPINE_W = 34;

/**
 * Threads down the rail's outer edge, one cell each, no names at all.
 *
 * The row ran out of width at four and the column cannot: the rail is 864px tall here
 * and 24 cells fit in it, so twelve threads is half a column and the scroll the strip
 * needs at four never happens. What it spends instead is 34px of a 420px rail, forever,
 * whether there is one conversation or twelve.
 *
 * It stands on the *outer* edge on purpose. The inner edge is the drag handle
 * (`agent-rail.tsx:398`, a 12px column with pointer capture on it), and the outer edge is
 * the one the rail already collapses to — `--nav-edge` put a 44px strip of panes out
 * there and paid 44px of window for it. This is that strip with threads in it instead of
 * panes, taken out of the rail's own 420 rather than added beside it.
 *
 * The plus leads, at the top, for #144's reason turned ninety degrees: a column is read
 * downward, so *new* belongs above the newest rather than below the oldest.
 *
 * **What a cell cannot do is name a thread, and the flyout is the whole of the answer.**
 * Hover a cell and the thread arrives to the left of it, over the log: its name at the
 * width a sentence needs, its last line in the rail's nouns, its age, and the ✕. The ✕
 * has nowhere else to be — a 34px cell holding a 14px mark and a 14px close would be two
 * hit targets four pixels apart — so a close is a deliberate act inside the flyout rather
 * than a hover-reveal on the cell, which is a change from the strip and is drawn as one.
 */
export function Spine({
	threads,
	open,
	onOpen,
	height,
}: {
	threads: readonly Thread[];
	open: string;
	onOpen: (id: string) => void;
	/** the rail's own height, so the frame can say how many cells fitted in it */
	height: number;
}) {
	const [over, setOver] = useState<string | null>(null);
	const shown = threads.find((thread) => thread.id === over);
	const at = threads.findIndex((thread) => thread.id === over);
	return (
		<div
			className="relative flex shrink-0 flex-col border-border border-l"
			style={{ width: SPINE_W }}
			onMouseLeave={() => setOver(null)}
		>
			<button
				type="button"
				aria-label="New thread"
				className="flex h-[34px] shrink-0 items-center justify-center border-border border-b text-muted/45 transition-colors duration-150 hover:text-text"
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{threads.map((thread) => {
					const on = thread.id === open;
					return (
						<button
							key={thread.id}
							type="button"
							aria-label={askOf(thread)}
							aria-current={on ? "true" : undefined}
							onMouseEnter={() => setOver(thread.id)}
							onClick={() => onOpen(thread.id)}
							className={cn(
								"relative flex h-[34px] shrink-0 items-center justify-center transition-colors duration-150",
								on ? "bg-surface/70" : "hover:bg-surface/40",
							)}
						>
							{/* the accent says which one is open, exactly as the tab's underline does, and it
							    faces the panel it owns. With one thread there is no which, so it draws none */}
							{on && threads.length > 1 ? (
								<span className="absolute inset-y-0 left-0 w-[2px] bg-thread" />
							) : null}
							<ThreadMark life={thread.life} />
							{/* a read thread out here has no name beside it, so the mark is the thread and
							    nothing is not a drawing. #144 made the same call for a collapsed tab */}
							{thread.life === "read" ? (
								<span className="pointer-events-none absolute h-[5px] w-[5px] rounded-full border border-muted/35" />
							) : null}
						</button>
					);
				})}
			</div>
			{shown === undefined ? null : (
				<Flyout thread={shown} top={34 + at * 34} height={height} />
			)}
		</div>
	);
}

/**
 * The name, at the width a name needs, for exactly as long as you are asking for it.
 *
 * It reaches left over the log rather than right off the window, and it is clamped to the
 * rail so the last cell's flyout does not hang off the bottom. Nothing in it is truncated:
 * the ask wraps to two lines, which is what an ask is.
 */
function Flyout({ thread, top, height }: { thread: Thread; top: number; height: number }) {
	const room = 96;
	return (
		<div
			className="pointer-events-none absolute right-[34px] z-20 w-[268px] border border-border-raised bg-surface px-3 py-2.5"
			style={{ top: Math.min(top, Math.max(0, height - room)) }}
		>
			<p className="text-base text-text leading-base">{askOf(thread)}</p>
			<div className="mt-1.5 flex items-center gap-2">
				<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/60 leading-3">
					{thread.last === "" ? "nothing yet" : thread.last}
				</span>
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{thread.since}</span>
				<CloseIcon className="h-2.5 w-2.5 shrink-0 text-muted/45" />
			</div>
		</div>
	);
}

/**
 * The name of the thread you are in, and the only place it is written.
 *
 * The obvious home for a title is the head of the log, the way a document carries one.
 * The transcript will not have it: it is bottom-anchored by design, so the first thing in
 * it is above the box for every conversation longer than the box — the frame prints how
 * far above. So the name is chrome after all, at the plan strip's own 34px, and it is a
 * nameplate rather than a switcher: pressing it edits it, and nothing else opens.
 *
 * **Renaming is real here because the column cannot name anything.** Every other take
 * still shows you some names some of the time; this one shows none, so what you called a
 * thread is the only thing standing between twelve identical marks and a hover hunt. The
 * ask stays the default and a rename replaces it.
 */
export function Nameplate({ thread, onRename }: { thread: Thread; onRename: (name: string) => void }) {
	const [editing, setEditing] = useState(false);
	const name = askOf(thread);
	return (
		<div className="flex h-[34px] shrink-0 items-center gap-2 border-border border-b px-3.5">
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
					className="min-w-0 flex-1 truncate text-left text-base text-text leading-base"
				>
					{/* an unstarted thread is the machine saying so, so it keeps the mono register the
					    rest of spool's own words keep */}
					{thread.ask === "" ? <span className="font-mono text-sm text-muted/60">{name}</span> : name}
				</button>
			)}
			<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{thread.since}</span>
		</div>
	);
}
