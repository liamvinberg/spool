import { useState } from "react";
import { LIVE, LIVE_ASK, useAutoAsk, useDeck } from "../../../shared/lib/agent-threads";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import {
	ConnectionsBody,
	HostRow,
	type Pane,
	PaneBack,
	RailColumn,
	deckSignal,
	linkCount,
} from "../../../shared/ui/spool-rail-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--nav-shut — the rail closed, with two marks in it instead of one.
 *
 * This is the state the question started in. A 44px strip is all that is left of
 * the rail when it is shut, and today it holds one glyph and one number: the
 * selected frame's link count, which is the only thing a closed rail says about
 * itself. There is an agent behind it now. Two threads are working and one finished
 * unread while the panel was down, and none of that reaches the strip.
 *
 * So the strip gets a cell per pane. Press either one and the panel opens to it;
 * press the caret and it shuts again. It plays while it is shut, so the mark turns
 * without the panel: leave it closed and watch.
 *
 * **The two signals are different shapes because they are different things.** The
 * agent's is a life, worn as the ring around its own glyph: nothing at rest, a
 * turning arc while anything works, a closed circle once something finished unread.
 * Connections keeps the number, beside its glyph, and it keeps it alone — the agent
 * counting its working threads here was drawn first and read as `2` and `2`, one
 * number doing two jobs moved rather than fixed. How many is what the threads strip
 * is for, and it is one press away. Never colour either: state in this rail has been
 * motion since the first frame and the one accent belongs to the selection.
 *
 * **This is also --nav-host's other half.** That frame gives the agent no cell,
 * because it is not a place you go — and pays for it the moment the panel is not
 * showing it. Here it has one, for exactly as long as the rail is not drawing the
 * threads itself. The column exists, but only while it is the only thing there;
 * --nav-edge is the version that keeps it open forever, at 44px of window.
 *
 * **What it still cannot say is what stopped.** A turn waiting on an approval and a
 * turn working look identical from out here — #121 settled that nobody is notified
 * of a waiting approval, so a fourth life is a decision this frame is not allowed to
 * take on its own, and the gap is real either way.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

const SELECTED = "menu";

const PANEL_W = 420;
const COLUMN_W = 44;

export default function AgentNavShutFrame() {
	const [shut, setShut] = useState(true);
	const [pane, setPane] = useState<Pane>("agent");
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, LIVE_ASK);

	const deck = useDeck(railEntries(script, turn, elapsed, undefined, "lifted"), turn);
	const signal = deckSignal(deck.threads, linkCount(SELECTED));
	const plan = deck.open.id === LIVE ? planOf(script, turn) : null;

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				selected={SELECTED}
				tool="select"
				railWidth={shut ? COLUMN_W : PANEL_W}
				railLabel="Agent"
				rail={
					shut ? (
						<RailColumn
							pane={null}
							signal={signal}
							onPane={(next) => {
								setPane(next);
								setShut(false);
							}}
							onToggle={() => setShut(false)}
							divided={false}
						/>
					) : pane === "agent" ? (
						<PlayRail
							nav={
								<HostRow
									threads={deck.threads}
									open={deck.open.id}
									onOpen={deck.setOpen}
									signal={signal}
									onPane={setPane}
									onShut={() => setShut(true)}
								/>
							}
							entries={deck.open.entries}
							plan={plan}
							phase={deck.phase}
							run={deck.run}
							onSend={ready ? deck.send : () => {}}
							onReplay={deck.replay}
						/>
					) : (
						<>
							<PaneBack label="connections" onBack={() => setPane("agent")} />
							<ConnectionsBody frame={SELECTED} />
						</>
					)
				}
			>
				<PlayField selected={[SELECTED]} />
			</CanvasChrome>
		</SpoolShell>
	);
}
