import { type ReactNode, useState } from "react";
import { useLimit } from "../lib/agent-limit";
import { CAPTURED, useModel } from "../lib/agent-model";
import { useQueue } from "../lib/agent-queue";
import { contextLine } from "../lib/agent-selection";
import {
	type Collapse,
	type Script,
	type Slice,
	planOf,
	railEntries,
	useCapture,
	useTurnScript,
} from "../lib/claude-turn";
import { enteredFrame } from "../lib/pointed-fixtures";
import { type PlayEntry, type ShotRef, type Turn, type TurnPhase, useTicker, useTurn } from "../lib/turn-play";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { ModelMenu } from "./spool-model-control";
import { FrameThumb, type Outline, PlayField } from "./spool-play-field";
import { COMPOSER_W, PlayRail } from "./spool-play-rail";

/**
 * Everything under the app bar, identical in all five takes on where the threads go.
 *
 * The whole family varies one thing and this is the constant it varies it against:
 * the same capture, the same canvas, the same rail at 420 with every switch passed at
 * the value its own ticket decided, exactly as `agent-chat` compiled them. So a
 * difference between two of these frames is a difference in the chrome and cannot be
 * anything else.
 *
 * `nav` is what stands above the transcript, and in four of the five takes it is
 * `"outside"` — nothing at all, which is the premise being tested: the threads have
 * left the rail. The rail gets #136's 34px back, and what that buys is visible at the
 * top of the log rather than argued.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: ["home"] },
	{ name: "directing", frames: [] },
];

const HAVE = ["menu", "cart", "receipt"] as const;

const SHOT_W = 120;
const picture = (shot: ShotRef, width = SHOT_W) =>
	shot.frame === null ? null : <FrameThumb name={shot.frame} width={width} />;

/** the turn behind every frame in this family: nine and a half minutes with a plan in it */
export function useDeckTurn(capture = "claude-plan", slice: Slice = "session", collapse: Collapse = "none") {
	const events = useCapture(capture);
	const script = useTurnScript(events, slice, collapse);
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total, turn.waiting);
	return { script, turn, elapsed, ready: script.cues.length > 0 };
}

export function DeckApp({
	nav,
	script,
	turn,
	elapsed,
	stored,
	phase,
	run,
	onSend,
	onReplay,
}: {
	nav: ReactNode | "outside";
	script: Script;
	turn: Turn;
	elapsed: number;
	/** a thread that is not the live replay, drawn from what it already said */
	stored: readonly PlayEntry[] | null;
	phase: TurnPhase;
	run: number;
	onSend: (text: string) => void;
	onReplay: () => void;
}) {
	const model = useModel(CAPTURED, run);
	const limit = useLimit(run);
	const held = useQueue([], phase);

	const [inside, setInside] = useState<string | null>("cart");
	const [lit, setLit] = useState<string | null>(null);
	const [pointed, setPointed] = useState<string | null>(null);
	const [landed, setLanded] = useState<string | null>(null);
	const selection = enteredFrame(inside);
	const outlines: readonly Outline[] = selection.map((entry) => ({ id: entry.id, frame: entry.frame }));

	const entries =
		stored ?? railEntries(script, turn, elapsed, contextLine(selection, COMPOSER_W, "plain"), "lifted", "empty");
	const plan = stored === null ? planOf(script, turn) : null;

	return (
		<CanvasChrome
			pages={PAGES}
			selected={landed ?? undefined}
			tool="select"
			railWidth={420}
			railLabel="Agent"
			rail={
				<PlayRail
					entries={[...model.before, ...entries, ...model.after, ...held.fired]}
					plan={plan}
					phase={phase}
					nav={nav}
					say="read"
					shot="open"
					shotView={picture}
					mcp="ask"
					ask="log"
					jump="name"
					stop="footer"
					queue="box"
					entered="plain"
					selection={selection}
					have={[...HAVE]}
					lit={lit}
					onLight={setLit}
					pointed={pointed}
					onPoint={setPointed}
					onJump={setLanded}
					model={
						<ModelMenu
							state={model.state}
							models={model.models}
							pin={model.pin}
							limit={limit.info}
							onPick={model.pick}
						/>
					}
					queued={held.queued}
					onQueue={held.queue}
					onUnqueue={held.unqueue}
					draft={held.draft}
					onDraft={held.setDraft}
					run={run}
					onSend={(text) => {
						if (model.say(text)) return;
						onSend(text);
					}}
					onReplay={onReplay}
				/>
			}
		>
			<PlayField
				takes={[]}
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
	);
}
