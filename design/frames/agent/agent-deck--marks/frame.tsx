import { useEffect, useState } from "react";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import { useWidth } from "../../../shared/lib/deck-fit";
import { CASE_SAYS, type DeckCase, type DeckThread, drawn, useDeck, whole } from "../../../shared/lib/deck-threads";
import { cn } from "../../../shared/lib/utils";
import { DeckApp, useDeckTurn } from "../../../shared/ui/spool-deck-app";
import { CaseStrip, DeckShell } from "../../../shared/ui/spool-deck-shell";
import { PlusIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * agent-deck--marks — the chrome carries state, the rail carries the name.
 *
 * Every other take here is trying to fit sentences into a bar. This one asks why a bar
 * is being given sentences at all. A persistent row has exactly one job that nothing
 * else in the app can do: tell you, without being looked at, that something happened
 * somewhere you are not. That job needs no words. The other job — finding the
 * conversation you half remember — needs all the words there are, and a row is a bad
 * place for it whatever its width.
 *
 * So the two are split. The bar gets a cluster of marks, one 14px box per thread, in
 * recency order, the open one under a 2px thread bar. No names, ever. The rail gets one
 * quiet line above the transcript: the open thread's ask, whole, with its age — which
 * is where you already are when you want to read it, and it costs 24px against the
 * strip's 34.
 *
 * **It is the only take here whose width never moves.** The readout measures the
 * cluster on every case: twelve threads is the same object as four plus eight boxes,
 * and it is smaller than one open tab. Nothing truncates because nothing has anything
 * to truncate. A thirteenth thread costs 20 pixels and a hundredth costs 20 pixels,
 * which is a sentence no other candidate on this page can write.
 *
 * **Hovering is what makes it legible, and the room for that was already there.** The
 * middle of the app bar is empty in the shipped chrome, so a mark under the cursor
 * prints its ask across it in one muted mono line. That is a real answer rather than a
 * tooltip: no surface opens, nothing covers anything, and the reading position is the
 * same one the zoom readout already uses.
 *
 * **The title: there is none in the chrome, and that is the proposal.** A mark is
 * identity by position, not by name, so the chrome never has to shorten anything or
 * store anything. The rail's line is the ask, entire, because it has 392px and one
 * line of it. An unstarted thread is a box with nothing in it and a rail line reading
 * `new thread` — the only take here where an unstarted thread costs literally nothing
 * to draw, since `read` already draws no mark.
 *
 * **What that leans on, and it must be said out loud.** Position is the whole of a
 * thread's identity here, so #136's *nothing re-sorts* stops being a preference and
 * becomes load-bearing: a cluster that re-ordered would silently swap which
 * conversation a muscle-memory press opens. The strip could survive breaking that rule
 * badly; this cannot survive it at all.
 *
 * **What it costs is drawn at twelve, and it is bad.** Twelve marks measure 308px, and
 * the readout counts how many of them draw a glyph: eight of the twelve are `read` or
 * are the thread you are reading, so they draw nothing at all. What is on screen is
 * three marks and eight empty boxes — correct, and unreadable as a set of
 * conversations. You cannot tell which dot is which without hovering each one, and
 * there is no reason to prefer the fourth box to the seventh. At four it is excellent
 * and at twelve it is a row of gaps, the exact inverse of `--shelf`, which is excellent
 * at four and gives up at twelve for the opposite reason.
 *
 * It costs nothing to the rail either way: `agent-rail.tsx:68` ships 420 in a 200–480
 * drag range, and a cluster in the app bar does not move when the rail does — while the
 * one line it does put in the rail is a single truncating name, which is the cheapest
 * thing in here to lose at 200.
 *
 * **On the word.** `src/ui/app.tsx:316` already gives the neighbouring button the
 * title `Threads` for the flow layer. This take is the least exposed to that, because
 * it never writes the word anywhere: what it puts in the bar is marks, and what names
 * a thread lives in the rail.
 */

const CASES = [
	{ id: "one", label: "1" },
	{ id: "four", label: "4" },
	{ id: "twelve", label: "12" },
	{ id: "elsewhere", label: "elsewhere" },
] as const;

export default function AgentDeckMarksFrame() {
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
	const [over, setOver] = useState<string | null>(null);
	const under = rail.threads.find((thread) => thread.id === over);

	return (
		<DeckShell
			middle={
				// the bar's empty middle, spent only while the cursor is on a mark: no
				// surface opens and nothing is covered
				under === undefined ? null : (
					<span className="min-w-0 truncate font-mono text-2xs text-muted/70 leading-3">{whole(under)}</span>
				)
			}
			right={
				<Cluster
					threads={rail.threads}
					open={rail.open.id}
					onOpen={rail.setOpen}
					onPoint={setOver}
					deck={deck}
					onMeasure={onMeasure}
				/>
			}
		>
			<DeckApp
				nav={<RailName thread={rail.open} />}
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

/** the cluster: one box per thread, and the box is the same 14px whatever is in it */
function Cluster({
	threads,
	open,
	onOpen,
	onPoint,
	deck,
	onMeasure,
}: {
	threads: readonly DeckThread[];
	open: string;
	onOpen: (id: string) => void;
	onPoint: (id: string | null) => void;
	deck: DeckCase;
	onMeasure: (line: string) => void;
}) {
	const [box, width] = useWidth<HTMLDivElement>(deck);

	useEffect(() => {
		if (width === 0) return;
		const quiet = threads.filter((thread) => thread.life === "read" || thread.life === "streaming").length;
		onMeasure(
			`${threads.length} marks are ${width}px wide · nothing truncates and nothing can · ` +
				`${quiet} of them draw no glyph at all, which is what twelve looks like`,
		);
	}, [width, threads, onMeasure]);

	return (
		<div ref={box} className="flex h-full items-center gap-1.5" onMouseLeave={() => onPoint(null)}>
			<button
				type="button"
				aria-label="New thread"
				className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted/45 transition-colors duration-150 hover:bg-surface hover:text-text"
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>
			{threads.map((thread) => {
				const on = thread.id === open;
				return (
					<button
						key={thread.id}
						type="button"
						title={thread.ask}
						aria-current={on ? "true" : undefined}
						onClick={() => onOpen(thread.id)}
						onMouseEnter={() => onPoint(thread.id)}
						className={cn(
							"relative flex h-7 w-[18px] shrink-0 items-center justify-center rounded-sm transition-colors duration-150",
							on ? "bg-surface" : "hover:bg-surface/60",
						)}
					>
						<ThreadMark life={drawn(thread.life)} />
						{on ? <span className="absolute inset-x-[2px] bottom-0 h-[2px] rounded-full bg-thread" /> : null}
					</button>
				);
			})}
		</div>
	);
}

/**
 * The rail's own line: the name, where there is room for it.
 *
 * 24px against the strip's 34, because it holds one sentence and nothing else — no
 * plus, no ✕, no neighbours. Everything that was in the strip except the name is now
 * in the bar, and everything the bar cannot say is here.
 */
function RailName({ thread }: { thread: DeckThread }) {
	return (
		<div className="flex h-6 shrink-0 items-center gap-3 border-border border-b px-3.5">
			<span className="min-w-0 flex-1 truncate font-mono text-sm text-text leading-4">{whole(thread)}</span>
			<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{thread.since}</span>
		</div>
	);
}
