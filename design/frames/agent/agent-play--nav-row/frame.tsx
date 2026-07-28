import { useState } from "react";
import { LIVE, LIVE_ASK, useAutoAsk, useDeck } from "../../../shared/lib/agent-threads";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { ConnectionsBody, NavRow, type Pane, deckSignal, linkCount } from "../../../shared/ui/spool-rail-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--nav-row — two rows of chrome become one, and both panes stay peers.
 *
 * It plays itself. The thread sends on boot and the plan lands nine seconds in, so
 * what you are looking at after a moment is the worst case: panes, threads and a
 * plan all wanting the top of a 420px column. Press `connections` and the pane
 * swaps under the row; press a thread and the transcript is that thread's.
 *
 * **The words go and the marks stay.** `agent` and `connections` never changed and
 * were costing 44px of a column that #117, #136 and #127 all want the shelf of. Two
 * marks fit in a fraction of that, so #136's whole strip moves up into the row they
 * vacate: 112px of chrome becomes 78.
 *
 * **The two signals are separated because they were never the same thing.**
 * Connections carries a number, beside its glyph — the selected frame's outbound
 * links, absent when nothing is selected. The agent carries a life, and it wears it
 * as the ring around its own glyph: nothing at rest, a turning arc while any thread
 * works, a closed circle once one has finished unread. A count and a motion, not one
 * number doing two jobs, and no new vocabulary to invent. The glyphs and the state's
 * place were argued on the sheet at `agent-nav-marks`; a mark hung under the icon was
 * the first drawing and the first thing rejected.
 *
 * **The open pane cannot take the bar.** The threads in this row already own the
 * 2px thread bar for the open one, and a second bar at the same height would be one
 * gesture saying two unrelated things. So a pane being open borrows the tool bar's
 * chip instead, which is how spool already draws a mode being on, and the row keeps
 * one meaning per treatment.
 *
 * **The cost is horizontal, and the second cost has no pixels at all.** Measured in
 * the browser, the cells, the divider, the plus and the caret leave 250px for names
 * where the strip on its own leaves 383, and a name floors at 112px, so a strip that
 * carried three names carries two. And the threads cannot
 * leave: they are welded to the tabs, so pressing `connections` leaves the agent's
 * conversations on screen above a pane that has nothing to do with them. The frame
 * beside this one, --nav-edge, is that cost removed and paid for in width instead.
 *
 * **The shelf holds one strip, and the rule is not this ticket's to invent.** #127
 * put signed-out on the plan's shelf on the grounds that the shelf is free — a plan
 * belongs to a turn that is running and signed-out exists because none can. Where
 * they can still collide, the thing stopping you wins and the plan's line is in the
 * log where #117 left it. Two rows is the floor here either way.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

/** the frame the hands picked, which is the only reason connections has anything to say */
const SELECTED = "menu";

export default function AgentNavRowFrame() {
	const [pane, setPane] = useState<Pane>("agent");
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, LIVE_ASK);

	const deck = useDeck(railEntries(script, turn, elapsed, undefined, "lifted"), turn);
	const signal = deckSignal(deck.threads, linkCount(SELECTED));
	// the plan belongs to the turn that wrote it, so it leaves with its thread
	const plan = deck.open.id === LIVE ? planOf(script, turn) : null;

	const nav = (
		<NavRow
			threads={deck.threads}
			open={deck.open.id}
			onOpen={(id) => {
				deck.setOpen(id);
				setPane("agent");
			}}
			pane={pane}
			signal={signal}
			onPane={setPane}
			onShut={() => setPane("agent")}
		/>
	);

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
							nav={nav}
							entries={deck.open.entries}
							plan={plan}
							phase={deck.phase}
							run={deck.run}
							onSend={ready ? deck.send : () => {}}
							onReplay={deck.replay}
						/>
					) : (
						<>
							{nav}
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
