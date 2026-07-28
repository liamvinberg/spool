import { useState } from "react";
import { LIVE, LIVE_ASK, useAutoAsk, useDeck } from "../../../shared/lib/agent-threads";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { ConnectionsBody, type Pane, RailColumn, deckSignal, linkCount } from "../../../shared/ui/spool-rail-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { ThreadStrip } from "../../../shared/ui/spool-thread-strip";

/**
 * agent-play--nav-edge — the panes move outside the panel, into a strip of their own.
 *
 * It plays itself, and the caret at the foot of the column closes the panel and
 * leaves the column standing — which is the whole argument, so press it. Press an
 * icon to come back, or the other icon to come back into the other pane.
 *
 * **This is the shape the rail already collapses to, made permanent.** Today
 * `inspector.tsx:142` shuts to a 44px strip holding one glyph and a link count, and
 * that strip is the only thing the rail says about itself while it is closed. Give
 * it a cell per pane and it is the tab row, standing where a closed panel can still
 * use it.
 *
 * **What that buys is the state nothing else can draw.** With the panes inside the
 * panel, a thread finishing while the panel is shut is invisible, and so is a thread
 * finishing while you are reading connections. Out here both marks are on screen
 * whatever the panel is doing. The link count is the one number in the strip and it
 * stands down when its own list is open, because a list of two says two better than
 * a digit does; the agent never carries a number at all, since a second one in a
 * 44px strip is the complaint moved rather than fixed.
 *
 * **Inside, each pane owns the whole panel.** The threads strip belongs to the
 * agent, so it leaves with it: connections gets all 420px and nothing above it
 * naming conversations it has no relationship to. That is the cost --nav-row draws
 * and cannot pay.
 *
 * **The cost is width, permanently.** 44px next to a 420px panel is 464 of a 1440
 * window, and the viewport drops from 772 to 728 to hold two icons that are only
 * ever pressed to change pane. It is also new furniture: spool has two rails and a
 * floating tool bar, and this is a third kind of edge, on the right only, with
 * nothing answering it on the left.
 *
 * **The shelf holds one strip, and the rule is not this ticket's to invent.** #127
 * put signed-out on the plan's shelf on the grounds that the shelf is free — a plan
 * belongs to a turn that is running and signed-out exists because none can. Where
 * they can still collide, the thing stopping you wins and the plan's line is in the
 * log where #117 left it.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

const SELECTED = "menu";

const PANEL_W = 420;
const COLUMN_W = 44;

export default function AgentNavEdgeFrame() {
	const [pane, setPane] = useState<Pane>("agent");
	const [shut, setShut] = useState(false);
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
				railWidth={shut ? COLUMN_W : PANEL_W + COLUMN_W}
				railLabel="Agent"
				rail={
					<div className="flex min-h-0 flex-1">
						{shut ? null : (
							<div className="flex min-w-0 flex-1 flex-col">
								{pane === "agent" ? (
									<PlayRail
										nav="outside"
										entries={deck.open.entries}
										header={
											<ThreadStrip
												threads={deck.threads}
												open={deck.open.id}
												onOpen={deck.setOpen}
											/>
										}
										plan={plan}
										phase={deck.phase}
										run={deck.run}
										onSend={ready ? deck.send : () => {}}
										onReplay={deck.replay}
									/>
								) : (
									<ConnectionsBody frame={SELECTED} />
								)}
							</div>
						)}
						<RailColumn
							pane={shut ? null : pane}
							signal={signal}
							onPane={(next) => {
								setPane(next);
								setShut(false);
							}}
							onToggle={() => setShut(!shut)}
							divided={!shut}
						/>
					</div>
				}
			>
				<PlayField selected={[SELECTED]} />
			</CanvasChrome>
		</SpoolShell>
	);
}
