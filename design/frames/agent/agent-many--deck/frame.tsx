import { useEffect, useRef, useState } from "react";
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
	UNSTARTED,
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
import { Pager, PAGER_H } from "./pager";

/**
 * agent-many--deck — you do not pick a thread, you step to it, and the chrome never grows.
 *
 * The strip's cost is per thread and so is every list's: 36px of mark each, 34px of cell
 * each, 52px of row each. This is the one shape whose cost is flat. One 34px line holds
 * the plus, the thread you are in, the mark of the one before it, the mark of the one
 * after it, where you are in the deck, and one aggregate mark for anything happening
 * anywhere. It is identical at four threads and at four hundred, and it is the only take
 * here that needs no answer at all to the width question — nothing in the row is a list,
 * so nothing in it gets tighter as the deck fills. The frame prints what the name gets at
 * the 420 default (`agent-rail.tsx:68`) and at the 200 floor, which is the only width in
 * the range where any of these takes actually hurts.
 *
 * **Where it breaks, and the readout found it rather than the argument.** Flat is not the
 * same as small. The plus, the two steps and the count cell are fixed furniture, and at
 * the 200 floor they leave the name almost nothing — the number is on the strip and it is
 * brutal. So a shipped version of this has to shed, and the order is forced: the count
 * goes first, because position is the least useful of the three things in the row when
 * there is no room to read the one you are in. Nothing else here has a shedding problem,
 * because nothing else here has fixed furniture on both sides of the name.
 *
 * **What you are buying with that.** Everything on the shelf is contested: #117 wants a
 * plan strip there, #145 wants a question there, #142 wants the estate there, #127 wants
 * the signed-out strip there, and #180 found five possible occupants nobody had ordered.
 * A switcher whose height is fixed and whose width is spent means the threads stop
 * competing for the shelf as the project grows.
 *
 * **What it costs, and the cost is real.** Reaching the ninth conversation is eight
 * presses through eight transcripts. Worse: **the deck can tell you something is
 * happening but never which thread it is happening in.** The aggregate mark says
 * *somewhere*, and finding out means paging until you land on it. In the `elsewhere` case
 * the takes land at six seconds and the whole event is one mark appearing beside a number
 * — judge it there, because that is the case this design is weakest on and the case the
 * feature exists for. A deck is honest about scale and vague about state, which is the
 * exact mirror of the strip.
 *
 * **The title, and this take's answer is that a thread's name should be live.** Your ask
 * is what you wanted twenty minutes ago. The rail's last line is what the thread is doing
 * now, in spool's own nouns, and on a pager the name is the only thing you have — so the
 * name is `write cart--empty-b` while a turn runs and the ask once it settles. **This
 * deliberately breaks a sibling of the rail's own no-re-sorting rule**, which exists so
 * nothing moves out from under a cursor already reaching for it: here nothing moves, but
 * what the one label *says* changes while you read it. The order is still fixed, and that
 * is what the rule was protecting. An unstarted thread reads `new thread` in mono, and
 * the mono is not decoration — an ask is a sentence a person typed and every derived name
 * is spool printing, so they take different registers. **The strip today prints both in
 * mono**, which is the one place this page's own voice rule is not being kept: the same
 * bytes render sans in the transcript ten pixels below.
 *
 * **Renaming is not offered.** A name that is derived cannot be edited without the next
 * tool call overwriting it, and a name that stops being live the moment you touch it is
 * two designs in one control.
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

export default function AgentManyDeckFrame() {
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

	/*
	 * The take's title rule, in one expression.
	 *
	 * A thread that is working says what it is doing; a thread that has stopped says what
	 * it was asked; a thread nobody has typed into says so. The first and third are spool's
	 * own words and take the mono register, the second is the human's and takes the
	 * sentence one.
	 */
	const open = deck.open;
	const working = open.life === "running" || open.life === "streaming";
	const live = working && open.last !== "";
	const label = live ? open.last : askOf(open);
	const machine = live || open.ask === "";

	const rail = useBox<HTMLDivElement>();
	const log = useLogBox(rail.ref);
	const name = useRef<HTMLSpanElement | null>(null);
	const [nameW, setNameW] = useState(0);
	const widths = useTextWidths(
		deck.threads.map((thread) => askOf(thread)),
		SANS_BASE,
	);
	const widest = widths.reduce((most, width) => Math.max(most, width), 0);
	const overrun = widths.filter((width) => width > nameW).length;

	useEffect(() => {
		const tick = () => setNameW(name.current?.clientWidth ?? 0);
		tick();
		const timer = window.setInterval(tick, 400);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		onMeasured([
			`chrome ${PAGER_H}px at ${deck.threads.length} threads, ${PAGER_H}px at any number`,
			`name gets ${nameW}px at the ${RAIL_W} default, ${nameW - (RAIL_W - FLOOR_W)}px at the ${FLOOR_W} floor`,
			`widest ask ${widest}px, so ${overrun} of ${widths.length} truncate here`,
			`showing "${label}" · log measure ${log.measure}`,
		]);
	}, [onMeasured, deck.threads.length, nameW, widest, overrun, widths.length, label, log.measure]);

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
							nav={
								<Pager
									threads={deck.threads}
									open={deck.open.id}
									onOpen={deck.setOpen}
									moving={deck.moving.filter((thread) => thread.id !== deck.open.id)}
									label={label === "" ? UNSTARTED : label}
									machine={machine}
									probe={name}
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
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
