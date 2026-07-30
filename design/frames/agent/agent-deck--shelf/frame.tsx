import { useEffect, useState } from "react";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import { useFit } from "../../../shared/lib/deck-fit";
import { CASE_SAYS, type DeckCase, type DeckThread, drawn, useDeck, whole } from "../../../shared/lib/deck-threads";
import { cn } from "../../../shared/lib/utils";
import { DeckApp, useDeckTurn } from "../../../shared/ui/spool-deck-app";
import { CaseStrip, DeckShell } from "../../../shared/ui/spool-deck-shell";
import { CloseIcon, PlusIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * agent-deck--shelf — the threads get a row of their own, the width of the window.
 *
 * The strip in the rail is not a bad strip. It is a good strip in a 420px box, and
 * every problem #136 and #144 spent themselves on is that box: a name floors at
 * 112px, so four names is the whole row; a sentence has to collapse to a 14px mark
 * to let its neighbour be read; the press had to be spent on scrolling because
 * there was nothing else to spend. None of that is about threads. It is about
 * putting a row of sentences in the narrowest column in the app.
 *
 * So this take moves the row out and leaves it a row: 32px under the app bar, the
 * full window, the plus still leading, the marks unchanged, the press still
 * centring. Nothing about the design is reconsidered except where it stands.
 *
 * **What that buys, measured on this frame rather than argued.** In the rail the
 * row has 356px after the plus and its padding. Here it has 1404. The readout under
 * the app prints both numbers on every case, and the one that matters is `four`:
 * four whole asks, no mark standing in for a name, and room still spare. That is
 * the shape of an ordinary day, and it is the first time this page has drawn it
 * without a truncation in it.
 *
 * **What it does not buy is twelve.** Press `12` and the readout says 3880 wanted
 * against 1404 of row: about four fit and the rest are a scroll away. Four times the
 * room is not twelve times the room, so the row still scrolls and the press still
 * centres. Anyone claiming a full-width row solves the deck should look at that case —
 * it solves the day you actually have and defers the day you might.
 *
 * **It is also indifferent to the rail.** `agent-rail.tsx:68` ships the rail at 420 in
 * a 200–480 drag range, and this row is the window's width whatever the drag is doing.
 * Three of the five takes here have that property and the title cell does not.
 *
 * **The title: the ask, whole, and nothing rewritten.** Every other take here has
 * to shorten a name because its container is small, and every shortening is spool
 * putting words in the human's mouth. This one does not have to. At 1404 a
 * sixty-six character ask renders whole and reads as the sentence someone typed,
 * which is exactly what `agent-threads.ts` says a thread's name is and the only
 * reason it was ever unreadable. An unstarted thread reads `new thread` in the same
 * muted mono a collapsed tab uses, because nothing has been said yet and inventing
 * a name for silence is worse than admitting it. There is no rename, deliberately:
 * a name you can edit is a name spool has to store, migrate and show stale, and
 * this take's whole claim is that the ask was fine all along.
 *
 * **What it costs, and it is the honest objection.** Thirty-two pixels of window
 * height, permanently, for a control most sessions press twice. The canvas is 812
 * tall in the shipped chrome and 780 here, and this canvas is phone-shaped frames
 * in rows, so 32px is real. Worse than the pixels: the row is per project and it
 * sits directly under a bar that is per app, so switching projects swaps a row that
 * looks like it belongs to the row above it. The seam is drawn — the row carries
 * the canvas's own background rather than the bar's — and it is still a seam you
 * have to learn.
 *
 * **And the word is already taken.** `src/ui/app.tsx:316` gives the button at the
 * right of this bar the title `Threads`, keyed `t`, and it means the flow layer.
 * Every take in this family has to answer that; this one answers it worst, because
 * it puts a row of conversations directly under a button that says Threads and
 * shows arrows.
 */

const CASES = [
	{ id: "one", label: "1" },
	{ id: "four", label: "4" },
	{ id: "twelve", label: "12" },
	{ id: "elsewhere", label: "elsewhere" },
] as const;

export default function AgentDeckShelfFrame() {
	const [deck, setDeck] = useState<DeckCase>("four");
	const [readout, setReadout] = useState("measuring");

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="min-h-0 flex-1">
				<Case key={deck} deck={deck} onMeasure={setReadout} />
			</div>
			<CaseStrip
				cases={CASES}
				picked={deck}
				onPick={(id) => setDeck(id as DeckCase)}
				says={CASE_SAYS[deck]}
				readout={readout}
			/>
		</div>
	);
}

function Case({ deck, onMeasure }: { deck: DeckCase; onMeasure: (line: string) => void }) {
	const { script, turn, elapsed, ready } = useDeckTurn();
	const rail = useDeck([], turn, deck);
	useAutoAsk(ready, turn.send, LIVE_ASK);

	return (
		<DeckShell
			second={
				<ThreadRow
					threads={rail.threads}
					open={rail.open.id}
					onOpen={rail.setOpen}
					deck={deck}
					onMeasure={onMeasure}
				/>
			}
		>
			<DeckApp
				nav="outside"
				script={script}
				turn={turn}
				elapsed={elapsed}
				stored={rail.open.id === "live" ? null : rail.open.entries}
				phase={rail.phase}
				run={rail.run}
				onSend={turn.send}
				onReplay={turn.replay}
			/>
		</DeckShell>
	);
}

/**
 * The row itself: #136's strip, unchanged, standing where it has room.
 *
 * Two copies are rendered. The one you see truncates and scrolls; the one you do not
 * is `w-max` and reports what the names would take if nothing stopped them, which is
 * the only measurement of this that has ever been true (#184).
 */
const ROW_H = 32;

function ThreadRow({
	threads,
	open,
	onOpen,
	deck,
	onMeasure,
}: {
	threads: readonly DeckThread[];
	open: string;
	onOpen: (id: string) => void;
	deck: DeckCase;
	onMeasure: (line: string) => void;
}) {
	const { has, wants, fit } = useFit<HTMLDivElement, HTMLDivElement>(deck);

	useEffect(() => {
		if (fit.has === 0) return;
		const shown = Math.max(1, Math.min(threads.length, Math.round((fit.has / Math.max(fit.wants, 1)) * threads.length)));
		onMeasure(
			fit.fits
				? `${threads.length} names want ${fit.wants}px · the row has ${fit.has} · ${fit.spare} spare · the rail's own strip has 356`
				: `${threads.length} names want ${fit.wants}px · the row has ${fit.has} · about ${shown} fit, the rest are a scroll away`,
		);
	}, [fit, threads.length, onMeasure]);

	return (
		<div className="relative flex shrink-0 items-stretch border-border border-b bg-canvas/60" style={{ height: ROW_H }}>
			{/* the plus leads, because the row is read left to right and new belongs before the newest */}
			<button
				type="button"
				aria-label="New thread"
				className="flex w-9 shrink-0 items-center justify-center border-border border-r text-muted/45 transition-colors duration-150 hover:text-text"
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>
			<div ref={has} className="relative min-w-0 flex-1">
				<div className="flex h-full items-stretch gap-5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{threads.map((thread) => (
						<Tab key={thread.id} thread={thread} on={thread.id === open} many={threads.length > 1} onOpen={onOpen} />
					))}
				</div>
				<span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent" />
			</div>
			{/* the invisible copy, allowed to be as wide as it likes */}
			<div className="pointer-events-none invisible absolute top-0 left-0 h-0 overflow-hidden" aria-hidden="true">
				<div ref={wants} className="flex w-max items-stretch gap-5 px-4">
					{threads.map((thread) => (
						<Tab key={thread.id} thread={thread} on={thread.id === open} many={threads.length > 1} onOpen={() => {}} />
					))}
				</div>
			</div>
		</div>
	);
}

function Tab({
	thread,
	on,
	many,
	onOpen,
}: {
	thread: DeckThread;
	on: boolean;
	many: boolean;
	onOpen: (id: string) => void;
}) {
	return (
		<div className="group relative flex shrink-0 items-center gap-2">
			<button
				type="button"
				onClick={(event) => {
					onOpen(thread.id);
					event.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
				}}
				className="flex min-w-0 items-center gap-2 text-left"
			>
				<ThreadMark life={drawn(thread.life)} />
				<span
					className={cn(
						"whitespace-nowrap font-mono text-sm leading-4 transition-colors duration-150",
						on ? "text-text" : "text-muted/70 group-hover:text-muted",
					)}
				>
					{whole(thread)}
				</span>
			</button>
			<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted/0 transition-colors duration-150 group-hover:text-muted/60">
				<CloseIcon className="h-2 w-2" />
			</span>
			{/* the bar says which of several is open, so one thread has no which to say */}
			{on && many ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
		</div>
	);
}
