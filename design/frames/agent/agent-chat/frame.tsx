import { useState } from "react";
import { contextLine } from "../../../shared/lib/agent-selection";
import { CAPTURED, useModel } from "../../../shared/lib/agent-model";
import { QUEUE_SEED, useQueue } from "../../../shared/lib/agent-queue";
import { useLimit } from "../../../shared/lib/agent-limit";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import {
	type Collapse,
	type Slice,
	railEntries,
	planOf,
	useCapture,
	useFanoutScript,
	useTurnScript,
} from "../../../shared/lib/claude-turn";
import { enteredFrame } from "../../../shared/lib/pointed-fixtures";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { LimitLine } from "../../../shared/ui/spool-limit";
import { ModelMenu } from "../../../shared/ui/spool-model-control";
import { type BaseFrame, type Outline, PlayField } from "../../../shared/ui/spool-play-field";
import { COMPOSER_W, PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { cn } from "../../../shared/lib/utils";

/**
 * agent-chat — the rail as decided, and the only frame that draws all of it (#180).
 *
 * Twenty-seven tickets, each argued against its own capture and drawn on its own
 * frame. This is the compile: every winner baked in, every loser gone, one set of
 * props, and a picker that walks the same rail through eight captures. Nothing here
 * is a new decision and nothing is reopened — the picker is a case list rather than
 * a variations switcher, because every case is a state the product will have.
 *
 * **The defaults were the pre-decision rail, and that is the concrete half of the
 * compile.** `PlayRail` carries the variation switches the tickets that argued them
 * left behind, and their defaults are where the rail stood before those tickets:
 * `say="raw"` is the renderer #148 *rejected*, `shot="well"` predates #117,
 * `stop="none"` predates #165 and `queue="none"` predates #176. Only four frames on
 * this page ever passed `say`, so sixty-three of them still draw the loser — the
 * bare `|` strokes in their transcripts are `raw` reserving a message's height and
 * drawing the caret over it before a character has landed. Here every switch is
 * passed at its decided value, on every case, unconditionally. That is the whole
 * claim: a winner stops being an option and becomes the component.
 *
 * **What the compile found, which no single ticket could.**
 *
 * *The per-case wiring collapses to one expression.* #145's frame reaches into the
 * script for the ask row's `liveCue` to park the turn; #165's reaches for
 * `script.cut`; #165's also freezes the ticker on `phase === "stopped"` where #145's
 * freezes on `turn.waiting`. Written side by side they are one line — a hold if the
 * script has a question in it, a cut if it has a stop in it, a frozen clock if
 * either is true. Every frame that wired one of these by hand was writing the
 * general rule as a special case, and `Case` below is that rule once.
 *
 * *The composer footer is over budget, and it is the one fault here that is a
 * defect rather than an observation.* Its own comment calls it "an 18px line [with]
 * room for one quiet thing on the left". #118 put the model there, #122 put the
 * limit beside it on the explicit ground that #118 "already put that menu in the
 * same eighteen pixels", and #165 then put the stop on the right. Measured in this
 * frame at the rail's real 420: the box is **391px**, and the three of them want
 * **433** — model 160, gap 10, limit 179, stop 73. What the row does with the
 * overflow is worse than clipping. The model wraps to **24px inside an 18px line**,
 * and the limit is squeezed 179 → 163 so `resets wed` renders as `resets…` — which
 * takes out the half #122 needs, since its whole argument is that the remedy is a
 * model switch and you cannot judge one without knowing when the window turns over.
 * A/B on identical content: with `stop="none"` the same span is 350×12 on one line
 * with 41px to spare. **Three decisions were each right alone and the third one
 * broke the first two**, and no frame could see it because no frame drew all three.
 *
 * *The composer nearly doubles when it is holding words.* #116's chips, #118's
 * model, #122's limit and #176's queue all landed in a surface #116 bounded on
 * purpose. Measured: the box is **116px** at rest and **227px** holding #176's two
 * queued messages, and the composer region with its footer goes 173 → 284. That is
 * inside #176's own 164px cap on the stack and it is still the tallest object in
 * the rail on the one case where nothing is being said.
 *
 * *The shelf has five possible occupants and nothing ever ordered them.* Above the
 * transcript `PlayRail` stacks `nav`, `header`, `PlanStrip`, `AskShelf` and
 * `EstateStrip`, put there by #136, #117, #145 and #142 one at a time. Two of them
 * declare 34px each, which is the 68px #144 already measured and accepted; what
 * #144 did not measure is three. No ticket says which goes above which, or what
 * happens when a question arrives while a plan is up.
 *
 * *The `fanout` case is the one nobody argued.* `fromParent` gates ten sites in
 * `claude-turn.ts`, so a delegate's own calls never reach the transcript: twelve
 * writes in `claude-fanout.json`, none of them drawn. What the rail shows is three
 * `delegate` rows with a live step, and the twelve frames they write arrive on the
 * canvas instead. That is consistent with #117 and it fell out of the projection
 * rather than being decided. Drawn beside the other seven it holds, and the reason
 * it holds is #143's: the frame is the place, and here the place is the canvas.
 *
 * **The captures.** All eight are real, all archived, all sliced by
 * `shared/lib/claude-turn.ts`. Each case is one capture and one slice and nothing
 * else — the rail's props do not move between them.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

/** the project's own frames, which is what a `jump` row is allowed to reach (#143) */
const HAVE = ["menu", "cart", "receipt"] as const;

/** the kaffe frames the fan-out's three designers each start from */
const FANOUT_BASE: readonly BaseFrame[] = [
	{ name: "cart", screen: "cart" },
	{ name: "menu", screen: "menu" },
];

/** the three the fan-out writes, in the order the folder sorts them */
const FANOUT_TAKES = ["cart--empty", "cart--empty-b", "cart--empty-c"] as const;

interface Case {
	readonly id: string;
	readonly capture: string;
	/** absent on the fan-out, which has its own projection */
	readonly slice: Slice | null;
	readonly collapse: Collapse;
	/** whether the composer opens holding messages that have not gone yet (#176) */
	readonly queued: boolean;
	/**
	 * What the case sends itself on boot.
	 *
	 * It is the frame's own words rather than the capture's, and it has to be:
	 * every window in `claude-turn.ts` opens at the request that *answers* the
	 * prompt, so none of the eight fixtures holds a user message at all. Checked,
	 * not assumed. `plan` and `queued` use the ask the threads deck already carries.
	 */
	readonly ask: string;
	/** what this case is here to show, and whose decision it is */
	readonly says: string;
}

const CASES: readonly Case[] = [
	{
		id: "turn",
		capture: "claude-edits",
		slice: "session",
		collapse: "run",
		queued: false,
		ask: "tidy the receipt and shoot it",
		says: "the ordinary turn. six edits are one row, and its name is the way to the frame · #135 #143",
	},
	{
		id: "plan",
		capture: "claude-plan",
		slice: "session",
		collapse: "none",
		queued: false,
		ask: LIVE_ASK,
		says: "nine and a half minutes with a plan on the shelf, written in 9s and worked for the rest · #117",
	},
	{
		id: "fanout",
		capture: "claude-fanout",
		slice: null,
		collapse: "none",
		queued: false,
		ask: "three takes on the empty cart, restrained to expressive",
		says: "three delegates at once, out of order and minutes apart, frames landing on the canvas · undecided",
	},
	{
		id: "foreign",
		capture: "claude-mcp",
		slice: "mcp",
		collapse: "none",
		queued: false,
		ask: "check what the tokens are called in Notion",
		says: "a call that is not spool's. the server is the subject, the verb is spool's own · #142",
	},
	{
		id: "message",
		capture: "claude-mcp",
		slice: "say",
		collapse: "none",
		queued: false,
		ask: "explain what you just changed",
		says: "3,372 characters, rendered whole, arriving at the rate the backlog sets · #148 #149 #163",
	},
	{
		id: "question",
		capture: "claude-mcp",
		slice: "ask",
		collapse: "none",
		queued: false,
		ask: "set up the thing we talked about",
		says: "the turn stops and waits for you. answer it, type past it, or dismiss it · #145 #162",
	},
	{
		id: "queued",
		capture: "claude-plan",
		slice: "session",
		collapse: "none",
		queued: true,
		ask: LIVE_ASK,
		says: "two messages committed and not sent, stacked in the box they were typed in · #170 #176",
	},
	{
		id: "stopped",
		capture: "claude-interrupt",
		slice: "stop",
		collapse: "none",
		queued: false,
		ask: "redo the whole checkout",
		says: "esc mid-argument. one flat stroke, neither done nor failed, and a bare verb · #165",
	},
];

export default function AgentChatFrame() {
	const [picked, setPicked] = useState<string>(CASES[0]?.id ?? "turn");
	const shown = CASES.find((entry) => entry.id === picked) ?? (CASES[0] as Case);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="min-h-0 flex-1">
				{/* keyed, so switching a case remounts the turn rather than resuming someone else's clock */}
				<Case key={shown.id} spec={shown} />
			</div>
			<Picker cases={CASES} picked={picked} onPick={setPicked} says={shown.says} />
		</div>
	);
}

/**
 * One case, and the rail that does not change between them.
 *
 * Every hook here is unconditional and every prop on `PlayRail` is a constant or a
 * derivation — the case supplies a capture and a slice, and nothing else.
 */
function Case({ spec }: { spec: Case }) {
	const capture = useCapture(spec.capture);
	const turnScript = useTurnScript(capture, spec.slice ?? "session", spec.collapse);
	const fanoutScript = useFanoutScript(spec.slice === null ? capture : undefined);
	const script = spec.slice === null ? fanoutScript : turnScript;

	/*
	 * The generalisation the separate frames could not see.
	 *
	 * #145's frame parks its turn by reaching for the ask row's `liveCue`; #165's
	 * cuts its turn by reaching for `script.cut`; both freeze the ticker, on
	 * different conditions. There is one rule under all of it: a script that holds a
	 * question parks on it, a script that holds a stop lands on it, and the clock
	 * stops whenever the turn has. A case that has neither passes undefined twice
	 * and plays straight through, which is what the other six do.
	 */
	const asked = script.rows.find((row) => row.kind === "ask");
	const turn = useTurn(
		script.cues,
		asked?.kind === "ask" ? (asked.liveCue ?? undefined) : undefined,
		script.cut ?? undefined,
	);
	const elapsed = useTicker(turn.run, script.total, turn.waiting || turn.phase === "stopped");
	const ready = script.cues.length > 0;

	const model = useModel(CAPTURED, turn.run);
	const limit = useLimit(turn.run);
	const held = useQueue(spec.queued ? QUEUE_SEED : [], turn.phase);
	// a case sends itself on boot, so picking one lands you in a turn already running
	// rather than in front of an empty rail with a decision behind every state in it
	useAutoAsk(ready, turn.send, spec.ask);


	const [inside, setInside] = useState<string | null>("cart");
	const [lit, setLit] = useState<string | null>(null);
	const [pointed, setPointed] = useState<string | null>(null);
	const [landed, setLanded] = useState<string | null>(null);
	const selection = enteredFrame(inside);
	const outlines: readonly Outline[] = selection.map((entry) => ({ id: entry.id, frame: entry.frame }));

	const takes = FANOUT_TAKES.map((name) => {
		const take = fanoutScript.takes.find((candidate) => candidate.name === name);
		return {
			name,
			arrived: take !== undefined && turn.at(take.arriveCue),
			painted: take?.paintCue != null && turn.at(take.paintCue),
			revision: take === undefined ? 0 : take.changeCues.filter((cue) => turn.at(cue)).length,
		};
	});
	const fanout = spec.slice === null;
	const landedTakes = takes.filter((take) => take.arrived).map((take) => take.name);
	const pages: readonly PageRow[] = fanout
		? [{ name: "app", frames: [...FANOUT_BASE.map((frame) => frame.name), ...landedTakes].sort(), active: true, open: true }]
		: PAGES;

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages}
				selected={landed ?? undefined}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={[
							...model.before,
							...railEntries(script, turn, elapsed, contextLine(selection, COMPOSER_W, "plain"), "lifted", "empty"),
							...model.after,
							...held.fired,
						]}
						plan={planOf(script, turn)}
						phase={turn.phase}
						/* every one of these is a decision rather than a mode, so none of them is conditional */
						say="read"
						shot="open"
						mcp="ask"
						ask="log"
						jump="name"
						stop="footer"
						queue="box"
						entered="plain"
						selection={selection}
						have={[...HAVE, ...landedTakes]}
						lit={lit}
						onLight={setLit}
						pointed={pointed}
						onPoint={setPointed}
						onJump={setLanded}
						model={
							<span className="flex min-w-0 items-center gap-2.5">
								<ModelMenu state={model.state} models={model.models} pin={model.pin} onPick={model.pick} />
								<LimitLine info={limit.info} />
							</span>
						}
						queued={held.queued}
						onQueue={held.queue}
						onUnqueue={held.unqueue}
						draft={held.draft}
						onDraft={held.setDraft}
						onStop={turn.cut}
						onDeny={turn.cut}
						onAnswer={turn.resume}
						run={turn.run}
						onSend={
							ready
								? (text) => {
										if (model.say(text)) return;
										turn.send(text);
									}
								: () => {}
						}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField
					{...(fanout ? { base: FANOUT_BASE } : {})}
					takes={fanout ? takes : []}
					outlines={outlines}
					lit={lit}
					onLight={setLit}
					entered={inside}
					onEnter={setInside}
					onExit={() => setInside(null)}
					selected={landed === null ? [] : [landed]}
					pointed={pointed}
					center={landed}
				/>
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * The case list, outside the product on purpose.
 *
 * It is not chrome spool has or will have, so it does not borrow spool's chrome: a
 * mono strip below the app, in the register the canvas uses for things the machine
 * would print. Every entry is a capture the rail plays with the identical props, so
 * nothing here is being compared — this walks one design through eight of its
 * states, which is the only reading a single frame can give that eight frames
 * cannot.
 */
function Picker({
	cases,
	picked,
	onPick,
	says,
}: {
	cases: readonly Case[];
	picked: string;
	onPick: (id: string) => void;
	says: string;
}) {
	return (
		<div className="flex h-11 shrink-0 flex-col justify-center gap-1 border-border border-t bg-surface/40 px-5">
			<div className="flex items-center gap-3">
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">case</span>
				<div className="flex items-center gap-0.5">
					{cases.map((entry) => (
						<button
							key={entry.id}
							type="button"
							onClick={() => onPick(entry.id)}
							className={cn(
								"rounded px-1.5 py-0.5 font-mono text-2xs leading-3 transition-colors",
								entry.id === picked ? "bg-raised text-text" : "text-muted/70 hover:text-text",
							)}
						>
							{entry.id}
						</button>
					))}
				</div>
				<span className="min-w-0 flex-1 truncate text-right font-mono text-2xs text-muted/45 leading-3">{says}</span>
			</div>
		</div>
	);
}
