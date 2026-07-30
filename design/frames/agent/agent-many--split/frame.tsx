import { useEffect, useState } from "react";
import { LIVE } from "../../../shared/lib/agent-threads";
import { useLimit } from "../../../shared/lib/agent-limit";
import { CAPTURED, useModel } from "../../../shared/lib/agent-model";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useBox, useLogBox } from "../../../shared/lib/many-measure";
import {
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
import { numberOf, ThreadPlate, Watch } from "./split";

/**
 * agent-many--split — the rail holds two threads, and the switcher only ever lists what
 * is moving.
 *
 * Every other take here answers *how do I get to a conversation*. This one answers a
 * different question first: **why is the thing you are not watching invisible?** The
 * whole reason to run agents in parallel is that one finishes while you are reading
 * another, and every switcher on this page reports that as a five-pixel change to a mark.
 * So the rail splits: what you are reading is the transcript, and what is happening
 * elsewhere is a live pane above it, which opens in place into the other thread's own
 * rows.
 *
 * **The list is bounded by activity rather than by count, which is the whole economy.**
 * Working, stuck, and finished-unread are the three lives that get a row; read gets
 * nothing. At one thread there is no pane at all and the rail is a transcript with a
 * plate over it — this is the only take here that costs *less* than today at the
 * population every project starts with. At twelve threads with two working it is two
 * rows. A project with forty finished conversations pays exactly what a project with one
 * pays. Every other take here pays by the thread.
 *
 * **Two transcripts do not fit, and that is a measurement rather than a preference.** The
 * frame prints the rail's height, what the plates and the composer take out of it, and
 * how tall `claude-plan`'s log actually grows: split down the middle, each side gets a box
 * the log outruns several times over, and the top of a message is the part worth reading
 * (#148). So the second thread is a live *index* — the state mark, the verb, the subject,
 * in the transcript's own vocabulary — and prose is one dimmed line and never a
 * paragraph. What a watch pane is for is *what is it doing now*, and that is rows.
 *
 * **The title: identity and description are two jobs, and one string has been doing
 * both.** `4` never truncates, never changes, and is sayable — *the one in thread 4* is a
 * sentence a person can say, which no prefix of an ask is. Once identity lives in the
 * number, the sentence beside it is free: truncate it, rewrite it, or leave it as what
 * you typed. Renaming replaces the sentence and never the number. It matters here more
 * than anywhere else because two conversations are on screen at once and a watch row
 * gives an ask about half the room a tab does. An unstarted thread is `7 · new thread`,
 * where the number carries the whole identity and does it fine. The cost is that a number
 * is not a memory aid, and in a real project the sequence would have holes in it, because
 * a permanent handle has to be permanent.
 *
 * **What it cannot do, and it is not a small thing.** There is no path from here to a
 * conversation that finished and was read. The count in the pane's header opens the full
 * list as a disclosure, which is the least this take can do and is frankly borrowed from
 * the takes beside it. On the evidence of these five frames, this shape wants pairing
 * with `agent-many--find` — it is the only one that is genuinely good at the live half
 * and genuinely has nothing to say about history.
 *
 * **What it spends.** The shelf now holds a plate, this pane, and #117's plan strip, which
 * is the three-occupant case #180 found and nobody has ordered. The frame prints the total
 * chrome above the log so that cost is a number rather than an impression.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const RAIL_W = 420;
const FLOOR_W = 200;

const picture = (shot: ShotRef, width = 120) =>
	shot.frame === null ? null : <FrameThumb name={shot.frame} width={width} />;

export default function AgentManySplitFrame() {
	const { picked, pick } = useManyCase();
	const [measured, setMeasured] = useState<readonly string[]>([]);
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="min-h-0 flex-1">
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
	// the pane opens on whatever is working, because that is what a watch pane is for
	const [expanded, setExpanded] = useState<string | null>(null);
	const [all, setAll] = useState(false);

	const rail = useBox<HTMLDivElement>();
	const shelf = useBox<HTMLDivElement>();
	const log = useLogBox(rail.ref);
	const moving = deck.moving.filter((thread) => thread.id !== deck.open.id);

	useEffect(() => {
		onMeasured([
			`rail ${rail.box.h}px · chrome above the log ${shelf.box.h}px · log box ${log.h}px`,
			`log grown to ${log.grown}px, so a half-rail pane holds ${log.h === 0 ? 0 : Math.round((log.h / 2 / Math.max(log.grown, 1)) * 100)}% of it`,
			`${moving.length} moving of ${deck.threads.length} · rows ${moving.length * 26}px`,
			`measure ${log.measure} at the ${RAIL_W} default, ${log.measure - (RAIL_W - FLOOR_W)} at the ${FLOOR_W} floor`,
		]);
	}, [onMeasured, rail.box.h, shelf.box.h, log.h, log.grown, log.measure, moving.length, deck.threads.length]);

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
					<div ref={rail.ref} className="flex min-h-0 flex-1 flex-col">
						<ManyRail
							entries={deck.open.entries}
							phase={deck.phase}
							run={deck.run}
							/* both halves of the split are one node, so the frame can measure what the
							   shelf costs rather than estimating it a piece at a time */
							nav="outside"
							header={
								<div ref={shelf.ref} className="flex shrink-0 flex-col">
									<ThreadPlate
										number={numberOf(deck.threads, deck.open.id)}
										thread={shown}
										onRename={(name) => setNamed({ ...named, [deck.open.id]: name })}
									/>
									<Watch
										threads={deck.threads}
										moving={moving}
										open={deck.open.id}
										expanded={expanded}
										onExpand={setExpanded}
										onOpen={deck.setOpen}
										all={all}
										onAll={setAll}
									/>
								</div>
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
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
