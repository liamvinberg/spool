import { useEffect, useRef, useState } from "react";
import { LIVE } from "../../../shared/lib/agent-threads";
import { useLimit } from "../../../shared/lib/agent-limit";
import { CAPTURED, useModel } from "../../../shared/lib/agent-model";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { MONO_XS, SANS_BASE, useBox, useLogBox, useTextWidths } from "../../../shared/lib/many-measure";
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
import { Dock, Finder, matches } from "./finder";

/**
 * agent-many--find — threads get no chrome, because spool already knows how to find
 * things.
 *
 * Every other answer on this page starts by deciding how much of a 420px rail a list of
 * conversations deserves. This one refuses the question. The rail is the conversation and
 * nothing else: no strip, no column, no plate, **zero pixels above the transcript**, which
 * is the first time since #136 that the log has started at the top of the rail. Switching
 * is typing, in the palette spool already opens over the canvas for frames.
 *
 * **Why this is not #136's rejected menu.** That one put a line in the rail that opened a
 * list *over the transcript*: you paid a row forever, and choosing covered the
 * conversation you were choosing to leave. Four differences, and each is the reason the
 * old cost is gone. The surface is spool's own finder rather than a new one, so there is
 * one filtering idea in the app rather than two. It opens over the *canvas*, which has
 * nothing to say while you are picking, so the transcript stays readable the whole time.
 * It matches the *inside* of a thread — the ask, what it wrote, the line it is on — so
 * `cart--empty` finds the conversation that made it. And its resting state is not in the
 * rail at all.
 *
 * **What it leaves on screen, and where.** One line, bottom left of the canvas, mirrored
 * off the tool bar: the open thread's name, the count, and a mark for each thread that is
 * moving. That is the whole ambient state.
 *
 * **The composer footer was the obvious home and the range is what rules it out.** #184
 * measured its occupants at 243px — the model at 160 truncating, a 10px gap, the stop at
 * 73 — against a box that is the rail less 29. At the 420 default that is 391 of box and
 * 148 to spare, so a door with a count in it fits with room over. At the 200 floor the
 * box is 171 and **the two things already there are 72px over before anything is added**.
 * The frame measures the door's own width and prints it against both, because a control
 * that exists at the default and vanishes at the floor is a control that is not there:
 * #184's own conclusion was that the row is the model and the stop *and nothing else*,
 * and the limit left the footer rather than take that bet. So the resting state goes to
 * the canvas, which has the same room at every rail width because it has nothing to do
 * with the rail.
 *
 * **The title, and this take's answer is that there should not be one.** A name is a
 * label somebody has to write and remember writing. The whole first message is already
 * the best description of a conversation that will ever exist, and the only reason it is
 * a bad *name* is that a tab is 112px at its floor and capped at 220 (`agent-rail.tsx`,
 * `OPEN_TAB` and `OPEN_MAX`, since the open tab stopped growing to fill the row) — about
 * twenty-five characters, which is a fragment of every one of these sentences. A palette
 * row is not: the frame prints the
 * widest ask in this deck against the measure a row gives it, and at 560 the widest of the
 * twelve lands **inside one line with pixels to spare** — the app's own `so when the like
 * shot patches or disappears its li…` is whole here, tail and all, unwrapped and uncut,
 * while ten of the twelve are over the strip's 112px floor. So there is no rename, because renaming exists to make a thing findable and
 * this is strictly better at that than a label ever was. **An unstarted thread is not in
 * the finder at all**: it has nothing in it to match, so it exists only as the thread you
 * are in, and its name is the composer's own placeholder waiting for the first sentence.
 *
 * **What it costs.** Nothing on screen says a conversation is running unless you look at
 * one line in a corner of the canvas — which is a smaller, quieter signal than a strip
 * that is always in your reading path, and the `elsewhere` case is where you should judge
 * that. Switching is two acts rather than one, and the second is typing. And a palette
 * that opens over the canvas cannot be the thing you glance at, because it covers what
 * you are looking at: it is a door, not a display.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const RAIL_W = 420;
const FLOOR_W = 200;
const PALETTE_W = 560;
/** what #184 measured the footer's occupants at, and the box they get at each end of the range */
const FOOTER_WANTED = 243;
const FOOTER_BOX_420 = 391;
const FOOTER_BOX_200 = 171;

const picture = (shot: ShotRef, width = 120) =>
	shot.frame === null ? null : <FrameThumb name={shot.frame} width={width} />;

export default function AgentManyFindFrame() {
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

	// the palette boots open, because the list is what this frame is asking you to judge;
	// esc shuts it and the resting state is the one line on the canvas
	const [finding, setFinding] = useState(true);
	const [query, setQuery] = useState("");
	const [at, setAt] = useState(0);
	const found = matches(deck.threads, query);

	const rail = useBox<HTMLDivElement>();
	const log = useLogBox(rail.ref);
	const palette = useBox<HTMLDivElement>();
	const row = useRef<HTMLSpanElement | null>(null);
	const [rowW, setRowW] = useState(0);
	const asks = deck.threads.map((thread) => askOf(thread));
	const widths = useTextWidths(asks, SANS_BASE);
	const door = useTextWidths([`${deck.threads.length} threads`], MONO_XS);
	const widest = widths.reduce((most, width) => Math.max(most, width), 0);
	const doorW = (door[0] ?? 0) + 24;
	const cut = widths.filter((width) => width > 112).length;

	useEffect(() => {
		const tick = () => setRowW(row.current?.clientWidth ?? 0);
		tick();
		const timer = window.setInterval(tick, 400);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") setFinding(false);
			if (!finding) return;
			if (event.key === "ArrowDown") setAt((index) => Math.min(index + 1, found.length - 1));
			if (event.key === "ArrowUp") setAt((index) => Math.max(index - 1, 0));
			if (event.key === "Enter") {
				const hit = found[at];
				if (hit !== undefined) {
					deck.setOpen(hit.id);
					setFinding(false);
				}
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	});

	useEffect(() => {
		onMeasured([
			`chrome above the log 0px · log measure ${log.measure} at the ${RAIL_W} default, ${log.measure - (RAIL_W - FLOOR_W)} at the ${FLOOR_W} floor`,
			`widest ask ${widest}px · palette row measure ${rowW}px · ${cut} of ${asks.length} over the strip's 112px floor`,
			`palette ${palette.box.w}×${palette.box.h} over an ${log.h + 116}px viewport`,
			`a footer door wants ${doorW}px: fits the ${FOOTER_BOX_420 - FOOTER_WANTED}px spare at ${RAIL_W}, and the floor is ${FOOTER_WANTED - FOOTER_BOX_200}px over before it`,
		]);
	}, [onMeasured, log.measure, log.h, widest, rowW, cut, asks.length, palette.box.w, palette.box.h, doorW]);

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
							/* the whole proposal in one prop: the rail draws nothing above the transcript */
							nav="outside"
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
				<Dock open={deck.open} threads={deck.threads} moving={deck.moving} onOpen={() => setFinding(true)} />
				{finding ? (
					<Finder
							threads={deck.threads}
							open={deck.open.id}
							query={query}
							onQuery={(text) => {
								setQuery(text);
								setAt(0);
							}}
							pick={at}
							onPickAt={setAt}
							onOpen={(id) => {
								deck.setOpen(id);
								setFinding(false);
							}}
						width={PALETTE_W}
						probe={row}
						panel={palette.ref}
					/>
				) : null}
			</CanvasChrome>
		</SpoolShell>
	);
}
