import { useState } from "react";
import { LIVE, LIVE_ASK, useAutoAsk, useDeck } from "../../../shared/lib/agent-threads";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { ConnectionsBody, HostRow, type Pane, PaneBack, deckSignal, linkCount } from "../../../shared/ui/spool-rail-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--nav-host — nothing is a tab, because the two are not peers.
 *
 * It plays itself. Press the arrow at the end of the threads row and connections
 * pushes over everything with a way back; press back and the transcript is where
 * you left it, still running.
 *
 * **`elements` died and the agent moved into its place, which changed what this
 * rail is.** The two survivors are not equals. The agent is where the work is said
 * and it is the reason the rail widened to 420. Connections is a property of
 * whichever frame is selected, it is already drawn on the canvas as arrows, and it
 * is read for a few seconds at a time. Drawing them as two tabs spends a row of a
 * 420px column asserting a symmetry that is not there.
 *
 * So the threads keep their row at their own 34px, connections is one mark at the
 * end of it carrying its count, and there is no tab row at all: 112px of chrome
 * becomes 68, the cheapest of the three, with no new furniture and no divided panel.
 *
 * **Switching is navigation rather than tabbing, and that is the point of it.**
 * Pressing the mark pushes a pane over the whole rail with the name of where you are
 * and a way back — which is honest while there are two, and stops being honest at
 * three, because a stack of screens in a 420px column is a phone. The back caret is
 * the same gesture as esc, and the agent is what you come back to by default rather
 * than one of two things you might be looking at.
 *
 * **What it spends is the agent's own mark.** There is nowhere to put one: the
 * agent has no cell, because it is not a place you go. While you are in it that
 * costs nothing — the threads strip names every conversation and marks each one. The
 * moment you are not, the connections pane is the only thing on screen, and a thread
 * finishing behind it has nothing to say so with. --nav-shut is the other half of
 * this answer: shut the panel and both marks are back, in the strip the rail already
 * collapses to.
 *
 * **The row is still crowded and it is measured.** The plus, the divider, the mark
 * and the caret leave 306px for names where the strip on its own leaves 383, so the
 * third of #136's three names is half there. That is better than the merged row
 * manages at 250, and it is still 44px of vertical bought with horizontal, in the
 * row that was already the tightest thing in the rail.
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

export default function AgentNavHostFrame() {
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
				railWidth={420}
				railLabel="Agent"
				rail={
					pane === "agent" ? (
						<PlayRail
							nav={
								<HostRow
									threads={deck.threads}
									open={deck.open.id}
									onOpen={deck.setOpen}
									signal={signal}
									onPane={setPane}
									onShut={() => setPane("agent")}
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
