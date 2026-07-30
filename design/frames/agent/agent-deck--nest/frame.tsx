import { useEffect, useState } from "react";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import { useFit } from "../../../shared/lib/deck-fit";
import { CASE_SAYS, type DeckCase, type DeckThread, clause, drawn, useDeck } from "../../../shared/lib/deck-threads";
import { cn } from "../../../shared/lib/utils";
import { DeckApp, useDeckTurn } from "../../../shared/ui/spool-deck-app";
import { CaseStrip, DeckShell } from "../../../shared/ui/spool-deck-shell";
import { CloseIcon, PlusIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * agent-deck--nest — one row and two kinds of thing, nested rather than flattened.
 *
 * The question was whether threads can join the project tabs. Flat, they cannot, and
 * the reason is not taste. A project tab is a whole window of state: pressing one
 * changes the canvas, the pages, the selection, the rail and what every hotkey is
 * about. A thread is 420 pixels of one of those windows: pressing one swaps a
 * transcript and moves nothing else. Drawn as siblings in a row they read as one
 * class of thing with one keyboard axis running through them, and the boundary
 * between *change everything* and *change the rail* falls in the middle of that axis
 * with nothing marking it. That is the category error, and it is real.
 *
 * **Nesting is not the same claim.** A thread is not a peer of a project, it is
 * inside one, and a row can say inside. So the focused project's tab opens: its name,
 * a hairline, then its conversations, then its own plus. The tab is still one object
 * — one border, one background, one thing your eye reads as the project you are in —
 * and everything inside the border is inside the project. This is the
 * project → thread breadcrumb, drawn as containment rather than as two segments and
 * a slash, which costs one row instead of one row plus a separator language.
 *
 * **What only this take can do: the other project.** `spool` is open in the next tab
 * and something is working in it. Every other candidate here draws the focused
 * project's deck and is silent about every other one, because they all live in space
 * the focused project owns. A closed tab has a spare 14 pixels, so it carries one
 * roll-up mark for whatever is loudest inside it — and a developer running agents in
 * two checkouts finds out from the tab, without switching. That is a state nothing in
 * `src/` can currently express.
 *
 * **The measurement, and it is the surprise.** The readout under the app prints what
 * the tab group wants against the room the row has. Names are expensive and marks are
 * nearly free: at four the group wants 454 of 1253, and at twelve it wants 630 of 1253,
 * so this take passes twelve where a row of names does not. It is the only one here
 * whose worst case is nearly as cheap as its best.
 *
 * Look at the twelve case before believing that is a win. Eight of the eleven collapsed
 * threads are `read` and draw no glyph at all, so what the pill actually holds is a name
 * and about 170px of near-empty boxes: correct, cheap, and saying almost nothing. It
 * fits, and fitting is not the same as reading.
 *
 * It is indifferent to the rail's own width — `agent-rail.tsx:68` ships 420 in a 200–480
 * drag range and none of this row moves with it.
 *
 * **The title: the ask, cut at a word, never mid-word, and no ellipsis.** A tab has a
 * hard budget and this one is 30 characters. What is wrong with the shipped name is not
 * its length, it is where the cut lands: `so when the like shot patches or disappears
 * its li…` ends inside a word, and a fragment that is not a word stops the eye and
 * reads as damage. Cutting at the last space instead gives `so when the like shot
 * patches`, and cutting at a clause when one is in reach gives `plan the whole build`
 * out of `plan the whole build before you write anything`. No ellipsis, on #184's own
 * finding about the model name: an ellipsis announces a cut string, and a name that
 * announces it is cut is not a name. Hover any tab and the whole ask is in the title
 * attribute; press it and the rail's first line is the ask entire.
 *
 * A rename is a double press on the name, which this take can afford because the name
 * is already a control in a row of controls; an unstarted thread reads `new thread` in
 * the collapsed muted tone until the first Enter names it.
 *
 * **What it costs.** The group grows and shrinks as you switch threads, so the plus
 * that opens a project folder moves because a conversation was renamed — a control
 * relocating for a reason unrelated to it. And the nesting is only legible while it
 * fits: at twelve, the row is one name and a line of dots, which is `--marks` with a
 * border round it and a worse place to put it.
 *
 * **The word in this bar is already spoken for.** `src/ui/app.tsx:316` titles the
 * right-hand button `Threads`, keyed `t`, and it means the flow layer. Nothing here
 * writes the word, which is the one thing this take has going for it on that front.
 */

const CASES = [
	{ id: "one", label: "1" },
	{ id: "four", label: "4" },
	{ id: "twelve", label: "12" },
	{ id: "elsewhere", label: "elsewhere" },
] as const;

/** the budget a tab gives a name, in characters of the mono face */
const BUDGET = 30;

export default function AgentDeckNestFrame() {
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
			tabGroup={
				<TabGroup
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

function TabGroup({
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
	const { has, wants, fit } = useFit<HTMLDivElement, HTMLDivElement>(`${deck}-${open}`);

	useEffect(() => {
		if (fit.has === 0) return;
		const marks = Math.max(threads.length - 1, 0);
		onMeasure(
			`${threads.length} in the tab want ${fit.wants}px · the row has ${fit.has} · ${fit.spare} spare · ` +
				`one name and ${marks} mark${marks === 1 ? "" : "s"}`,
		);
	}, [fit, threads.length, onMeasure]);

	const group = (live: boolean) => <Group threads={threads} open={open} onOpen={live ? onOpen : () => {}} />;

	return (
		<div ref={has} className="relative flex min-w-0 flex-1 items-center overflow-hidden">
			{group(true)}
			<div className="pointer-events-none invisible absolute top-0 left-0 h-0 overflow-hidden" aria-hidden="true">
				<div ref={wants} className="flex w-max items-center">
					{group(false)}
				</div>
			</div>
		</div>
	);
}

/** the row: the open project holding its conversations, then every other project closed */
function Group({
	threads,
	open,
	onOpen,
}: {
	threads: readonly DeckThread[];
	open: string;
	onOpen: (id: string) => void;
}) {
	const [naming, setNaming] = useState<string | null>(null);
	const [names, setNames] = useState<Readonly<Record<string, string>>>({});
	const nameOf = (thread: DeckThread) => names[thread.id] ?? clause(thread, BUDGET);

	return (
		<nav className="flex min-w-0 items-center gap-unit" aria-label="Projects">
			<div className="flex h-[26px] min-w-0 shrink items-center rounded-md border border-border-raised bg-raised">
				<span className="shrink-0 pr-2.5 pl-3 font-medium text-base text-text leading-[24px]">kaffe</span>
				<span className="h-[18px] w-px shrink-0 bg-border-raised" />
				<div className="flex min-w-0 items-center gap-2 px-2.5">
					{threads.map((thread) => {
						const on = thread.id === open;
						if (!on)
							return (
								<button
									key={thread.id}
									type="button"
									title={thread.ask}
									onClick={() => onOpen(thread.id)}
									className="flex h-[18px] shrink-0 items-center opacity-70 transition-opacity duration-150 hover:opacity-100"
								>
									<ThreadMark life={drawn(thread.life)} />
								</button>
							);
						return (
							<div key={thread.id} className="group flex min-w-0 shrink items-center gap-1.5">
								<ThreadMark life={drawn(thread.life)} />
								{naming === thread.id ? (
									<input
										// the name is already a control in a row of controls, so renaming is
										// typing over it rather than a menu item somewhere else
										autoFocus
										defaultValue={nameOf(thread)}
										onBlur={(event) => {
											setNames((prev) => ({ ...prev, [thread.id]: event.target.value.trim() || nameOf(thread) }));
											setNaming(null);
										}}
										onKeyDown={(event) => {
											if (event.key === "Enter") event.currentTarget.blur();
											if (event.key === "Escape") setNaming(null);
										}}
										className="min-w-0 shrink bg-transparent font-mono text-sm text-text leading-4 caret-thread outline-none"
										style={{ width: `${Math.max(nameOf(thread).length, 8)}ch` }}
									/>
								) : (
									<button
										type="button"
										title={thread.ask}
										onDoubleClick={() => setNaming(thread.id)}
										className="min-w-0 shrink truncate whitespace-nowrap font-mono text-sm text-text leading-4"
									>
										{nameOf(thread)}
									</button>
								)}
								<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted/0 transition-colors duration-150 group-hover:text-muted/70">
									<CloseIcon className="h-2 w-2" />
								</span>
							</div>
						);
					})}
					<button
						type="button"
						aria-label="New thread"
						className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-muted/45 transition-colors duration-150 hover:text-text"
					>
						<PlusIcon className="h-2.5 w-2.5" />
					</button>
				</div>
			</div>

			{/* every other project keeps its plain tab, and spends its spare 14px on the
			    loudest thing happening inside it — the one state no other take can draw */}
			<div className="group flex h-[26px] shrink-0 items-center rounded-md">
				<span className="h-full pr-1 pl-3 text-base text-muted leading-[24px]">spool</span>
				<ThreadMark life="running" className="mr-1.5" />
			</div>

			<button
				type="button"
				className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface"
				aria-label="Open a project folder"
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>
		</nav>
	);
}
