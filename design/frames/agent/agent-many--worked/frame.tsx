import { useEffect, useState } from "react";
import { LIVE } from "../../../shared/lib/agent-threads";
import { useLimit } from "../../../shared/lib/agent-limit";
import { CAPTURED, useModel } from "../../../shared/lib/agent-model";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { MONO_SM, SANS_BASE, useBox, useLogBox, useTextWidths } from "../../../shared/lib/many-measure";
import {
	askOf,
	framesFor,
	HAVE,
	type ManyCase,
	MANY_CASES,
	useManyCase,
	useManyDeck,
	useOnce,
	wroteFor,
} from "../../../shared/lib/many-threads";
import { type ShotRef, useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { ManyRail } from "../../../shared/ui/spool-many-rail";
import { ManyReadout } from "../../../shared/ui/spool-many-readout";
import { ModelMenu } from "../../../shared/ui/spool-model-control";
import { type BaseFrame, FrameThumb, PlayField } from "../../../shared/ui/spool-play-field";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { Elsewhere, placedFrames, Worked, WrotePlate } from "./placed";

/**
 * agent-many--worked — a conversation stands on the frames it changed.
 *
 * **Why this is not #136's placed take.** That one bound a thread to the page it was
 * started from and reached it by walking there. The shipped code has since settled that a
 * thread has no page: *"an agent asked to clean something up, or to move frames between
 * pages, writes across many pages or none, so there is no page field here to bind it
 * with — which is also why switching a thread does not move the canvas"*
 * (`src/ui/canvas/agent-threads.ts`). That is new information since #136 and it kills the
 * binding rather than the idea, because a thread does have one spatial fact: **what it
 * wrote**. The transcript already knows it — #143 made every frame name in a row a place
 * to go — so the mark goes in that frame's own label row, at the end of it, where nothing
 * is drawn today. Press it and the rail is that conversation. The canvas does not move,
 * which is the shipped rule kept rather than broken.
 *
 * It also survives the case that broke the old one outright. There, a page reached exactly
 * one conversation and the second thread on the same page was unreachable from anywhere
 * in the design. Here two threads that touched `receipt` both hang off `receipt`, side by
 * side, and both are one press away.
 *
 * **What it buys.** The rail spends nothing at all on a switcher. No row, no column, no
 * list, no overlay, no width — the shelf is free for the plan, the question and the
 * estate, at every rail width and at any number of threads. And the answer to *which
 * frames is this conversation about* stops being a question, because the conversation is
 * standing on them.
 *
 * **What it costs, and the frame counts it rather than arguing it.** A thread that asked
 * a question and wrote nothing has nowhere to stand. So does one that wrote a document
 * rather than a frame, and one whose frame is on a page you are not looking at. The
 * readout prints how many of the deck have no mark on this canvas, and in the `twelve`
 * case it is **half of them**. They fall back to a list in the corner — the exact object
 * this take set out to remove — and an idea that needs a list for half its population has
 * not removed the list. That number is the verdict: a spatial switcher works exactly as
 * far as the work is spatial, and about half of what an agent does is not.
 *
 * The second cost is scroll. A mark on a frame is only reachable while that frame is in
 * the viewport, so panning away from `cart` takes the conversation about `cart` off
 * screen with it. Nothing in this design brings it back.
 *
 * **The title, and this is the take with the strongest answer to it.** A thread is called
 * what it wrote: `cart--empty-b, cart--empty-c`, in spool's own nouns, lowercase mono,
 * the same words the transcript's rows already print. It **never truncates**, because a
 * frame name is short by construction, and the readout prints the widest of these against
 * the widest ask — they are not in the same league. It is never invented, because it is a
 * fact about the repository rather than a label anybody had to think of, which also means
 * it needs no side call to a cheap model, the thing `agent-threads.ts` rejected as *silent
 * spend on somebody's own subscription for a label*.
 *
 * It falls back twice and both fallbacks are real states. A thread that has written
 * nothing is called by its ask. A thread nobody has typed into is `new thread`. So the
 * name changes exactly once, on the first write, and then only when the work moves. There
 * is **no rename**, because the name is a fact — which is the trade: no conversation here
 * can be called what you want, and none can be called nothing.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "takes", frames: ["cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

const RAIL_W = 420;
const FLOOR_W = 200;

/** the frames this canvas is holding, in the order the field lays them out */
const BASE: readonly BaseFrame[] = [
	{ name: "menu", screen: "menu" },
	{ name: "cart", screen: "cart" },
	{ name: "receipt", screen: "receipt" },
];
const TAKES = ["cart--empty-b", "cart--empty-c"] as const;

const picture = (shot: ShotRef, width = 120) =>
	shot.frame === null ? null : <FrameThumb name={shot.frame} width={width} />;

export default function AgentManyWorkedFrame() {
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

	const here = [...BASE.map((frame) => frame.name), ...TAKES];
	const frames = placedFrames(
		BASE.map((frame) => frame.name),
		[...TAKES],
	);
	// a thread with no frame on this canvas is not reachable from it, whatever the reason
	const stranded = deck.threads.filter(
		(thread) => framesFor(thread).filter((frame) => here.includes(frame)).length === 0,
	);

	const rail = useBox<HTMLDivElement>();
	const log = useLogBox(rail.ref);
	const asks = useTextWidths(
		deck.threads.map((thread) => askOf(thread)),
		SANS_BASE,
	);
	const names = useTextWidths(
		deck.threads.map((thread) => wroteFor(thread).join(", ")).filter((name) => name !== ""),
		MONO_SM,
	);
	const widestAsk = asks.reduce((most, width) => Math.max(most, width), 0);
	const widestName = names.reduce((most, width) => Math.max(most, width), 0);

	useEffect(() => {
		onMeasured([
			`${deck.threads.length - stranded.length} of ${deck.threads.length} stand on a frame here, ${stranded.length} on nothing`,
			`written names reach ${widestName}px against ${widestAsk}px of ask, in a ${log.measure}px plate`,
			`rail spends 0px on a switcher · measure ${log.measure} at ${RAIL_W}, ${log.measure - (RAIL_W - FLOOR_W)} at the ${FLOOR_W} floor`,
		]);
	}, [onMeasured, deck.threads.length, stranded.length, widestName, widestAsk, log.measure]);

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
							nav={<WrotePlate thread={deck.open} />}
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
				<PlayField
					base={BASE}
					takes={TAKES.map((name) => ({ name, arrived: true, painted: true, revision: 0 }))}
				/>
				<Worked frames={frames} threads={deck.threads} open={deck.open.id} onOpen={deck.setOpen} />
				<Elsewhere threads={stranded} open={deck.open.id} onOpen={deck.setOpen} />
			</CanvasChrome>
		</SpoolShell>
	);
}
