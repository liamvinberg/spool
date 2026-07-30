import { useState } from "react";
import type { Thread } from "../../../shared/lib/agent-threads";
import { askOf, framesFor, wroteFor } from "../../../shared/lib/many-threads";
import { cn } from "../../../shared/lib/utils";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/*
 * The canvas grid, copied from `spool-play-field.tsx` rather than exported out of it.
 *
 * That file is shared and not this take's to change, and its camera is a translate that
 * sits at 0,0 whenever nothing is being centred — so a sibling overlay in the same
 * absolute coordinates lands on the same frames. Verified by rendering, which is the only
 * way this is allowed to be true.
 */
const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const ROW_2 = 437;
const FW = 152;
const LABEL_LIFT = 22;

export interface Placed {
	readonly frame: string;
	readonly left: number;
	readonly top: number;
}

/** where each frame this canvas is holding actually sits, in the field's own coordinates */
export function placedFrames(base: readonly string[], takes: readonly string[]): readonly Placed[] {
	return [
		...base.map((frame, index) => ({ frame, left: COLS[index] ?? 0, top: ROW_1 - LABEL_LIFT })),
		...takes.map((frame, index) => ({ frame, left: COLS[index] ?? 0, top: ROW_2 - LABEL_LIFT })),
	];
}

/**
 * A conversation stands on the frames it changed.
 *
 * #136's placed take bound a thread to the **page** it was started from, and the shipped
 * code has since settled that a thread has no page at all: *"an agent asked to clean
 * something up, or to move frames between pages, writes across many pages or none, so
 * there is no page field here to bind it with — which is also why switching a thread does
 * not move the canvas"* (`src/ui/canvas/agent-threads.ts`). That killed the binding, not
 * the idea. This binds to the one spatial fact a thread really does have: **what it
 * wrote**, which the transcript already knows because #143 made every frame name in a row
 * a place to go.
 *
 * So the mark goes in the frame's own label row, at the end of it, where nothing is drawn
 * today. Press it and the rail is that conversation, and the canvas does not move —
 * switching a thread has nowhere to move to, which is the shipped rule kept.
 *
 * Two threads that touched the same frame both hang off it, side by side. That is the
 * case that broke the old take outright: there, a page reached exactly one conversation
 * and a second one on the same page was unreachable from anywhere in the design.
 */
export function Worked({
	frames,
	threads,
	open,
	onOpen,
}: {
	frames: readonly Placed[];
	threads: readonly Thread[];
	open: string;
	onOpen: (id: string) => void;
}) {
	const [over, setOver] = useState<string | null>(null);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			{frames.map((place) => {
				const mine = threads.filter((thread) => framesFor(thread).includes(place.frame));
				if (mine.length === 0) return null;
				return (
					<div
						key={place.frame}
						className="pointer-events-auto absolute flex items-center justify-end gap-1"
						style={{ left: place.left, top: place.top, width: FW, height: LABEL_LIFT }}
					>
						{mine.map((thread) => (
							<button
								key={thread.id}
								type="button"
								aria-label={askOf(thread)}
								onMouseEnter={() => setOver(thread.id)}
								onMouseLeave={() => setOver(null)}
								onClick={() => onOpen(thread.id)}
								className="flex h-3.5 w-3.5 items-center justify-center"
							>
								{thread.id === open ? (
									// the accent says which one you are in, which is the one job it already
									// has on the open tab; it never says what a thread is doing
									<span className="h-[5px] w-[5px] rounded-full bg-thread" />
								) : (
									<ThreadMark life={thread.life} />
								)}
								{thread.life === "read" && thread.id !== open ? (
									<span className="absolute h-[5px] w-[5px] rounded-full border border-muted/40" />
								) : null}
							</button>
						))}
						{over === null || !mine.some((thread) => thread.id === over) ? null : (
							<span className="pointer-events-none absolute right-0 bottom-[22px] max-w-[240px] truncate border border-border-raised bg-surface px-2 py-1 text-2xs text-text/85 leading-4">
								{askOf(threads.find((thread) => thread.id === over) as Thread)}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

/**
 * Everything the canvas cannot hold, which turns out to be half the deck.
 *
 * A thread that asked a question and wrote nothing has no frame to stand on. So does one
 * that wrote a document rather than a frame, and one whose frame is on another page. The
 * frame counts them and prints the count, because that number is the whole verdict on
 * this take: a spatial switcher works exactly as far as the work is spatial.
 *
 * It is a list in a corner, which is the thing this take was supposed to avoid, and
 * drawing it is the point — an idea that needs a list for half its population has not
 * removed the list.
 */
export function Elsewhere({
	threads,
	open,
	onOpen,
}: {
	threads: readonly Thread[];
	open: string;
	onOpen: (id: string) => void;
}) {
	const [shown, setShown] = useState(false);
	if (threads.length === 0) return null;
	return (
		<div className="absolute bottom-5 left-5 z-20 flex flex-col items-start gap-1.5">
			{shown ? (
				<div className="flex w-[300px] flex-col border border-border-raised bg-surface py-1">
					{threads.map((thread) => (
						<button
							key={thread.id}
							type="button"
							onClick={() => onOpen(thread.id)}
							className={cn(
								"flex items-center gap-2 px-2.5 py-1.5 text-left",
								thread.id === open ? "bg-raised/70" : "hover:bg-raised/40",
							)}
						>
							<ThreadMark life={thread.life} />
							<span className="min-w-0 flex-1 truncate text-base text-text/85 leading-base">{askOf(thread)}</span>
							<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">
								{wroteFor(thread).length === 0 ? "wrote nothing" : (wroteFor(thread)[0] as string)}
							</span>
						</button>
					))}
				</div>
			) : null}
			<button
				type="button"
				onClick={() => setShown(!shown)}
				className="flex h-8 items-center gap-2 border border-border-raised bg-surface px-3 font-mono text-2xs text-muted/70 leading-3 transition-colors duration-150 hover:text-text"
			>
				{threads.length} with nothing on this canvas
			</button>
		</div>
	);
}

/**
 * The nameplate, and the take's answer to the title.
 *
 * A thread is called what it wrote. `cart--empty-b, cart--empty-c` is spool's own nouns,
 * lowercase mono, the same words the transcript's rows print — so the name never
 * truncates, because a frame name is short by construction, and it never has to be
 * invented, because it is a fact about the repository rather than a label anybody chose.
 * The frame prints the widest of these against the widest ask, and it is not close.
 *
 * The rule falls back twice, and both fallbacks are real states rather than tidy-ups. A
 * thread that has written nothing yet is called by its ask, because that is the only
 * thing it has; a thread nobody has typed into is `new thread`. So the name changes once,
 * on the first write, and then only when the work moves — never on a keystroke.
 *
 * **Renaming is not offered**, because the name is a fact. That is the trade: no thread
 * here can ever be called what you want, and no thread here can ever be called nothing.
 */
export function WrotePlate({ thread }: { thread: Thread }) {
	const wrote = wroteFor(thread);
	return (
		<div className="flex h-[34px] shrink-0 items-center gap-2 border-border border-b px-3.5">
			{wrote.length === 0 ? (
				<span
					className={cn(
						"min-w-0 flex-1 truncate leading-4",
						thread.ask === "" ? "font-mono text-muted/60 text-sm" : "text-base text-text",
					)}
				>
					{askOf(thread)}
				</span>
			) : (
				<span className="min-w-0 flex-1 truncate font-mono text-sm text-text leading-4">{wrote.join(", ")}</span>
			)}
			<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{thread.since}</span>
		</div>
	);
}
