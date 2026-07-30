import { useEffect, useState } from "react";
import { LIVE } from "../../../shared/lib/agent-threads";
import { useLimit } from "../../../shared/lib/agent-limit";
import { CAPTURED, useModel } from "../../../shared/lib/agent-model";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { SANS_BASE, useBox, useLogBox, useTextWidths } from "../../../shared/lib/many-measure";
import {
	askOf,
	HAVE,
	type ManyCase,
	MANY_CASES,
	useManyCase,
	useManyDeck,
	useOnce,
} from "../../../shared/lib/many-threads";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { ManyRail } from "../../../shared/ui/spool-many-rail";
import { ManyReadout } from "../../../shared/ui/spool-many-readout";
import { ModelMenu } from "../../../shared/ui/spool-model-control";
import { FrameThumb, PlayField } from "../../../shared/ui/spool-play-field";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Nameplate, SPINE_W, Spine } from "./spine";

/**
 * agent-many--spine — threads cost a column, and the column does not run out.
 *
 * The strip's break was always width. #136 measured four names at 112px each and called
 * that the floor; #144 kept the bet and removed the constraint by collapsing everything
 * that is not open to a 36px mark, which buys the room back and spends the names to do
 * it. Turn the row ninety degrees and the constraint is gone rather than traded: the rail
 * is 864px tall here, a cell is 34, and the frame prints how many fit. Twelve threads is
 * half a column, and a hundred scrolls a column that was always going to scroll, in the
 * axis a rail has spare.
 *
 * **What it proposes.** A 34px column of marks down the rail's outer edge: the plus at
 * the top, one cell per thread in recency order, the open one carrying the same accent
 * the open tab carries, turned to face the panel it owns. Nothing in the column is a
 * name. Hover a cell and the thread arrives to the left of it over the log — its ask at
 * the width a sentence needs, its last line in the rail's nouns, its age and its ✕ — and
 * a press opens it. Above the transcript sits one 34px nameplate saying which thread you
 * are in, and pressing that renames it.
 *
 * **It stands on the outer edge on purpose.** The inner edge is the drag handle
 * (`agent-rail.tsx:398` is a 12px column with pointer capture on it), and the outer edge
 * is the one the rail already collapses to. `--nav-edge` drew that strip with a cell per
 * *pane* and paid 44px of window for it; this puts threads in it and takes the 34 out of
 * the rail's own 420, so shutting the panel to the strip would leave every thread exactly
 * where it already was.
 *
 * **What it costs, measured rather than argued.** The log's measure drops by the column at
 * every rail width, and the readout prints both ends of the range that matters:
 * `agent-rail.tsx:68` is `RAIL_WIDTH = 420` with `MIN_WIDTH` 200 and `MAX_WIDTH` 480, and
 * #144 moved the default there from the inspector's old 300 *because the transcript is a
 * column of prose rather than a list of names*. At the 420 default the column is a
 * twelfth of the rail, which is affordable. **The squeeze is the 200 floor**, where it is
 * a sixth and the log's measure drops to the number the readout prints — that is the
 * honest bottom of this idea, and it is the width at which it should be judged. Two
 * thresholds soften it: the rail snaps to the 44px strip below 144 and collapses below
 * 72, so the column and the panel go away together rather than the column eating a rail
 * nobody can read. Against all of it, this is the only take here whose chrome does not
 * grow with the number of threads at all.
 *
 * **The second cost is the real one: twelve read threads are twelve identical blank
 * cells.** The mark draws working, waiting and unread, and read is a hollow dot — so a
 * column of old conversations is a column of near-nothing with a hover behind each one.
 * This take bets that a switcher's job is *what is moving now*, which a column answers at
 * a glance and better than any row, and that finding one two-hour-old conversation is a
 * different job that it does badly. The `twelve` case draws that cost rather than
 * describing it.
 *
 * **The title, and why it ends up as chrome.** The obvious home for a thread's name is
 * the head of its own log, the way a document carries one. The transcript refuses it: it
 * is bottom-anchored by design, so the head of a nine-minute conversation is far above
 * the box, and the readout prints exactly how far as the log grows. A title you cannot
 * see is not a title. So the nameplate is 34px of chrome, the ask is its default, and
 * this is **the one take here where renaming earns its keep** — the column shows no
 * names, so what you called a thread is all that stands between twelve marks and a hover
 * hunt. An unstarted thread reads `new thread` in mono, because that is the machine
 * saying there is nothing to say yet rather than a name anybody chose.
 *
 * **What it does not touch.** Nothing is coloured for state, nothing re-sorts, the accent
 * stays on the open one and on the selection, and the marks are #161's three readings
 * unchanged.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const RAIL_W = 420;
/** the bottom of the drag range (`agent-rail.tsx:71`), which is where every claim about room is tested */
const FLOOR_W = 200;
const CELL = 34;

const picture = (shot: ShotRef, width = 120) =>
	shot.frame === null ? null : <FrameThumb name={shot.frame} width={width} />;

export default function AgentManySpineFrame() {
	const { picked, pick } = useManyCase();
	const [measured, setMeasured] = useState<readonly string[]>([]);
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="min-h-0 flex-1">
				{/* keyed, so a new population starts a clean clock rather than resuming one */}
				<Case key={picked.id} spec={picked} onMeasured={setMeasured} />
			</div>
			<ManyReadout cases={MANY_CASES} picked={picked.id} onPick={pick} says={picked.says} measured={measured} />
		</div>
	);
}

function Case({ spec, onMeasured }: { spec: ManyCase; onMeasured: (lines: readonly string[]) => void }) {
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useOnce(ready, () => turn.send("plan the whole build before you write anything"));

	const model = useModel(CAPTURED, turn.run);
	const limit = useLimit(turn.run);
	const deck = useManyDeck(railEntries(script, turn, elapsed, undefined, "lifted"), turn, spec);
	const [named, setNamed] = useState<Readonly<Record<string, string>>>({});

	const rail = useBox<HTMLDivElement>();
	const log = useLogBox(rail.ref);
	const widths = useTextWidths(
		deck.threads.map((thread) => askOf(thread)),
		SANS_BASE,
	);
	const widest = widths.reduce((most, width) => Math.max(most, width), 0);
	const fits = Math.floor((rail.box.h - CELL) / CELL);
	// the nameplate keeps the rail's gutters and gives the age its own room
	const plate = log.measure === 0 ? 0 : log.measure - 30;

	useEffect(() => {
		onMeasured([
			`column ${SPINE_W} · ${fits} cells in ${rail.box.h}px of rail · ${deck.threads.length} in it`,
			`log measure ${log.measure} at the ${RAIL_W} default, ${log.measure - (RAIL_W - FLOOR_W)} at the ${FLOOR_W} floor`,
			`log ${log.grown}px, box ${log.h}px, its head ${log.head}px down and climbing`,
			`widest ask ${widest}px against ${plate}px of nameplate`,
		]);
	}, [onMeasured, fits, rail.box.h, deck.threads.length, log.measure, log.h, log.grown, log.head, widest, plate]);

	const open = named[deck.open.id];
	const shown = open === undefined ? deck.open : { ...deck.open, ask: open };

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={RAIL_W}
				railLabel="Agent"
				rail={
					<div ref={rail.ref} className="flex min-h-0 flex-1">
						<div className="flex min-w-0 flex-1 flex-col">
							<ManyRail
								entries={deck.open.entries}
								phase={deck.phase}
								run={deck.run}
								nav={
									<Nameplate
										thread={shown}
										onRename={(name) => setNamed({ ...named, [deck.open.id]: name })}
									/>
								}
								plan={deck.open.id === LIVE ? planOf(script, turn) : null}
								have={HAVE}
								shotView={picture}
								model={
									<ModelMenu
										state={model.state}
										models={model.models}
										pin={model.pin}
										limit={limit.info}
										onPick={model.pick}
									/>
								}
								onSend={ready ? deck.send : () => {}}
								onReplay={deck.replay}
								onStop={turn.cut}
							/>
						</div>
						<Spine threads={deck.threads} open={deck.open.id} onOpen={deck.setOpen} height={rail.box.h} />
					</div>
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
