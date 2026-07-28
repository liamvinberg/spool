import { useState } from "react";
import { LIVE, LIVE_ASK, useAutoAsk, useDeck } from "../../../shared/lib/agent-threads";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { ConnectionsIcon, PanelCaret } from "../../../shared/ui/spool-icons";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { ConnectionsBody, PaneBack, linkCount } from "../../../shared/ui/spool-rail-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { ThreadStrip } from "../../../shared/ui/spool-thread-strip";

/**
 * agent-play--nav-only — no tabs, because connections is not a pane you switch to.
 *
 * It plays itself. The top of the rail is #136's strip and nothing else: threads, the
 * plus, one caret. Connections has left the chrome entirely and hangs off the
 * composer footer beside the model — `4` walks for whatever is selected, absent when
 * nothing is. Press it and the list comes up over the transcript with a way back.
 *
 * **The premise: they are not peers and never were.** The agent is where you spend the
 * session. Connections is a fact about whichever frame the hands last touched, read
 * for a few seconds at a time, and it changes when the selection changes rather than
 * when anything happens. Two tabs assert a symmetry that costs a whole row of a 420px
 * column to state, and #144's crowding is that row.
 *
 * **Why the composer footer rather than nowhere.** Deleting connections was the first
 * idea and `connections.ts` kills it in its own words: *this list is the only complete
 * one, and the only home for destinations no arrow on the canvas can reach*. Of the
 * four walks drawn here, `home` is on another page — another canvas — and `checkout`
 * is a name nothing answers to. Neither can be an arrow next to the frame. So the
 * list survives; only its door moves. And the footer is where the rail already keeps
 * facts about right now: #118 put the model there and #122 put the usage window
 * there, next to the strip that already names what is selected.
 *
 * **The cost, and it is the reason to look at --nav-pages next door.** Someone wiring
 * flows all afternoon now reaches the graph through a chat's footer, which is a strange
 * sentence. The count is also the quietest thing on the rail, so nothing advertises
 * that the list exists at all; the tab at least did that. What this buys is the whole
 * of #144: the shelf is threads at 34 and plan at 34, and there is no third row for
 * anything to be crowded out of.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

const SELECTED = "menu";

export default function AgentNavOnlyFrame() {
	const [open, setOpen] = useState(false);
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, LIVE_ASK);

	const deck = useDeck(railEntries(script, turn, elapsed, undefined, "lifted"), turn);
	const plan = deck.open.id === LIVE ? planOf(script, turn) : null;
	const links = linkCount(SELECTED);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				selected={SELECTED}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					open ? (
						<>
							<PaneBack label="connections" onBack={() => setOpen(false)} />
							<ConnectionsBody frame={SELECTED} />
						</>
					) : (
						<PlayRail
							nav={
								<ThreadStrip
									threads={deck.threads}
									open={deck.open.id}
									onOpen={deck.setOpen}
									after={
										<span className="flex w-7 shrink-0 items-center justify-center text-muted/60">
											<PanelCaret dir="right" className="h-3.5 w-2.5" />
										</span>
									}
								/>
							}
							entries={deck.open.entries}
							plan={plan}
							model={
								links === null ? null : (
									<button
										type="button"
										onClick={() => setOpen(true)}
										className="flex items-center gap-1.5 font-mono text-2xs text-muted/60 leading-3 transition-colors duration-150 hover:text-text"
									>
										<ConnectionsIcon className="h-3 w-3" />
										{links}
									</button>
								)
							}
							phase={deck.phase}
							run={deck.run}
							onSend={ready ? deck.send : () => {}}
							onReplay={deck.replay}
						/>
					)
				}
			>
				<PlayField selected={[SELECTED]} />
			</CanvasChrome>
		</SpoolShell>
	);
}
