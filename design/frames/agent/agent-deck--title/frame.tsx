import { useEffect, useState } from "react";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import { useFit, useWidth } from "../../../shared/lib/deck-fit";
import { CASE_SAYS, type DeckCase, type DeckThread, drawn, useDeck, whole } from "../../../shared/lib/deck-threads";
import { cn } from "../../../shared/lib/utils";
import { DeckApp, useDeckTurn } from "../../../shared/ui/spool-deck-app";
import { CaseStrip, DeckShell } from "../../../shared/ui/spool-deck-shell";
import { ChevronIcon, CloseIcon, ConnectionsIcon, PlusIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * agent-deck--title — the bar already reaches over the rail, and that span is empty.
 *
 * Look at the shipped chrome with a ruler rather than with an opinion. The bar is one
 * 44px row across the whole window. Its right-hand group is a 28px toggle, a 16px gap
 * and a zoom readout with a 36px floor: the readout under the app measures that same
 * markup and prints the number. The rail below it is 420 wide. So the part of the app
 * bar that stands directly over the agent rail is almost entirely nothing, and has
 * been since the rail was widened.
 *
 * This take spends it. The rail's 420 of the bar becomes the rail's own title: the
 * open thread's name, how many there are, one mark for the loudest thing happening in
 * the ones you cannot see, and a caret. Press it and the deck drops as a list under
 * it, at the same width, over the rail it belongs to. The canvas controls move left of
 * the seam, over the canvas, which is what they are about.
 *
 * **It costs no pixels at all.** Not 32 like a second row, not 44 like the tab row
 * #144 deleted, not the 34 the strip takes inside the rail — the rail gets that 34
 * back and the transcript starts higher. It is the only take here that is free, and it
 * is free because the room was already paid for.
 *
 * **What the drop buys that a row cannot.** A row gives a thread one line and a
 * fraction of it. A list gives it the whole ask on as many lines as it takes, plus
 * when it last moved and the line it is on — `takes · now · write cart--empty-b`
 * answers where a conversation is without opening it, which is the actual question you
 * have about a thread running somewhere else. Twelve of those is a list you scroll,
 * which is a shape a list is good at and a row is not.
 *
 * **The cell is not wide enough for every ask, and the readout says so rather than
 * hiding it.** At the deck's own live ask the name wants 341 against 339 of cell, so
 * it truncates by two pixels — one 420px column is one 420px column wherever you put
 * it. The difference is what is one press away: in the rail the rest of the name was
 * behind a horizontal scroll, and here it is in a list that wraps it.
 *
 * **The title, and this is the take that earns a rename.** Here the name is a 44px
 * tall control the width of the rail, sitting alone above it. Nothing else in spool
 * gives a name that much room, so nothing else makes editing it a natural gesture:
 * double press it and it is a field, Enter keeps it, Escape puts it back. The default
 * stays the ask, because that is free and right most of the time, and an unstarted
 * thread reads `new thread` until the first Enter replaces it. The claim being made is
 * narrow and worth stating plainly: threads are not documents and most of them are
 * never named, but the two or three you keep coming back to are exactly the ones worth
 * naming, and this is the only design here where naming is one press away from where
 * you already are.
 *
 * **It is the one take here the rail's drag can hurt.** `agent-rail.tsx:68` ships the
 * rail at 420 inside a 200–480 range, and this cell is the rail's width by
 * construction, so dragging the rail narrow shortens the title with it. The readout
 * prints the exact threshold rather than a guess: the chrome around the name costs 81
 * of the cell, so the live ask is whole at a rail of 422 and cut below it — which
 * includes the shipped 420 by two pixels, and everything down to the 200 floor. Every
 * other take here is indifferent to the drag. Whether that matters depends entirely on
 * whether you believe the list is the real interface and the cell is its handle, which
 * is what this frame is arguing.
 *
 * **What it costs is the thing the strip was best at.** At rest, one thread has a
 * name and every other one is a digit and a single mark. A thread finishing elsewhere
 * changes a count from 4 to 4 and puts a dot where there was none — the weakest signal
 * of the five takes, and the `elsewhere` case is drawn so it can be judged rather than
 * described. The mark is the loudest life among the closed threads, on `loudestOf`'s
 * ranking, which means two threads waiting and two finished say exactly what one
 * waiting says.
 *
 * **And there is a word problem in this bar.** `src/ui/app.tsx:316` gives the button
 * immediately to the left of this cell the title `Threads`, keyed `t` — the flow layer,
 * spool's other and older meaning of the word. This take puts a thread's name beside
 * it. Whatever ships out of this row has to rename one of the two, and the older claim
 * is the weaker one: the flow layer is arrows and the toggle already wears the edge
 * glyph.
 */

const CASES = [
	{ id: "one", label: "1" },
	{ id: "four", label: "4" },
	{ id: "twelve", label: "12" },
	{ id: "elsewhere", label: "elsewhere" },
] as const;

const RAIL_W = 420;

export default function AgentDeckTitleFrame() {
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
	const [dropped, setDropped] = useState(false);
	const [names, setNames] = useState<Readonly<Record<string, string>>>({});

	return (
		<DeckShell
			railWidth={RAIL_W}
			rail={
				<TitleCell
					threads={rail.threads}
					open={rail.open}
					names={names}
					onName={(id, text) => setNames((prev) => ({ ...prev, [id]: text }))}
					loudest={rail.loudest}
					dropped={dropped}
					onDrop={() => setDropped((was) => !was)}
					deck={deck}
					onMeasure={onMeasure}
				/>
			}
			overlay={
				dropped && rail.threads.length > 1 ? (
					<>
						<button
							type="button"
							aria-label="Close the deck"
							className="absolute inset-0 z-20 cursor-default"
							onClick={() => setDropped(false)}
						/>
						<DeckList
							threads={rail.threads}
							open={rail.open.id}
							names={names}
							onOpen={(id) => {
								rail.setOpen(id);
								setDropped(false);
							}}
						/>
					</>
				) : null
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

function TitleCell({
	threads,
	open,
	names,
	onName,
	loudest,
	dropped,
	onDrop,
	deck,
	onMeasure,
}: {
	threads: readonly DeckThread[];
	open: DeckThread;
	names: Readonly<Record<string, string>>;
	onName: (id: string, text: string) => void;
	loudest: DeckThread["life"];
	dropped: boolean;
	onDrop: () => void;
	deck: DeckCase;
	onMeasure: (line: string) => void;
}) {
	const { has, wants, fit } = useFit<HTMLDivElement, HTMLSpanElement>(`${deck}-${open.id}`);
	const [controls, controlsWide] = useWidth<HTMLDivElement>(deck);
	const [naming, setNaming] = useState(false);
	const alone = threads.length === 1;
	const name = names[open.id] ?? whole(open);

	useEffect(() => {
		if (fit.has === 0 || controlsWide === 0) return;
		// what the cell spends on everything that is not the name, which is what turns a
		// wanted width into a rail width the name survives
		const around = RAIL_W - fit.has;
		onMeasure(
			`the bar's own controls are ${controlsWide}px wide · the rail is ${RAIL_W} · ` +
				`${RAIL_W - controlsWide} of bar over the rail was unused · the name wants ${fit.wants}, the cell has ${fit.has} · ` +
				`whole at a rail of ${fit.wants + around} or wider, and the drag range is 200–480`,
		);
	}, [fit, controlsWide, onMeasure]);

	return (
		<div className="flex h-full w-full items-center gap-2 pr-3 pl-3.5">
			<div ref={has} className="flex min-w-0 flex-1 items-center gap-2">
				{naming ? (
					<input
						autoFocus
						defaultValue={name}
						onBlur={(event) => {
							onName(open.id, event.target.value.trim() || name);
							setNaming(false);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.currentTarget.blur();
							if (event.key === "Escape") setNaming(false);
						}}
						className="min-w-0 flex-1 bg-transparent font-mono text-sm text-text leading-4 caret-thread outline-none"
					/>
				) : (
					<button
						type="button"
						title={open.ask}
						onClick={alone ? undefined : onDrop}
						onDoubleClick={() => setNaming(true)}
						className="min-w-0 flex-1 truncate text-left font-mono text-sm text-text leading-4"
					>
						{name}
					</button>
				)}
			</div>
			{/* one thread is no which, so there is no count, no mark and nothing to drop */}
			{alone ? null : (
				<button type="button" onClick={onDrop} className="flex shrink-0 items-center gap-2">
					<ThreadMark life={loudest} />
					<span className="font-mono text-2xs text-muted/60 leading-3">{threads.length}</span>
					<span className={cn("text-muted/60 transition-transform duration-150", dropped && "rotate-90")}>
						<ChevronIcon className="h-2.5 w-2.5" />
					</span>
				</button>
			)}

			{/* the same name, allowed to be as wide as it likes, and the same two controls
			    the shipped bar puts at its right end — measured rather than remembered */}
			<div className="pointer-events-none invisible absolute top-0 left-0 h-0 overflow-hidden" aria-hidden="true">
				<span ref={wants} className="w-max whitespace-nowrap font-mono text-sm leading-4">
					{name}
				</span>
				<div ref={controls} className="flex w-max items-center gap-4">
					<span className="flex h-7 w-7 items-center justify-center">
						<ConnectionsIcon className="h-3.5 w-3.5" />
					</span>
					<span className="min-w-9 text-right font-mono text-muted text-xs leading-xs">39%</span>
				</div>
			</div>
		</div>
	);
}

/**
 * The deck, dropped under its own cell at its own width.
 *
 * A row can give a thread a line. A list can give it everything it has: the whole ask
 * wrapped rather than cut, and under it the two facts that answer *where is it* —
 * when it last moved, and the line it was on, in the rail's own nouns.
 */
function DeckList({
	threads,
	open,
	names,
	onOpen,
}: {
	threads: readonly DeckThread[];
	open: string;
	names: Readonly<Record<string, string>>;
	onOpen: (id: string) => void;
}) {
	return (
		<div
			className="absolute top-0 right-0 z-30 flex max-h-[520px] flex-col overflow-hidden rounded-b-lg border-border-raised border-b border-l bg-surface"
			style={{ width: RAIL_W }}
		>
			<button
				type="button"
				className="flex h-9 shrink-0 items-center gap-2.5 border-border border-b px-3.5 text-left text-muted/60 transition-colors duration-150 hover:text-text"
			>
				<PlusIcon className="h-2.5 w-2.5" />
				<span className="font-mono text-sm leading-4">new thread</span>
			</button>
			<div className="min-h-0 flex-1 overflow-y-auto py-1">
				{threads.map((thread) => {
					const on = thread.id === open;
					return (
						<button
							key={thread.id}
							type="button"
							onClick={() => onOpen(thread.id)}
							className={cn(
								"group relative flex w-full items-start gap-2.5 px-3.5 py-2 text-left transition-colors duration-100",
								on ? "bg-raised" : "hover:bg-raised/50",
							)}
						>
							{on ? <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-thread" /> : null}
							<span className="pt-0.5">
								<ThreadMark life={drawn(thread.life)} />
							</span>
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className={cn("font-mono text-sm leading-4", on ? "text-text" : "text-text/80")}>
									{names[thread.id] ?? whole(thread)}
								</span>
								<span className="truncate font-mono text-2xs text-muted/50 leading-3">
									{thread.last === "" ? thread.since : `${thread.since} · ${thread.last}`}
								</span>
							</span>
							<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center pt-0.5 text-muted/0 transition-colors duration-150 group-hover:text-muted/60">
								<CloseIcon className="h-2 w-2" />
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
