import { useState } from "react";
import { LIVE, LIVE_ASK, lastLine, useAutoAsk, useDeck } from "../../../shared/lib/agent-threads";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow, RailTabs } from "../../../shared/ui/spool-canvas-chrome";
import { PanelCaret } from "../../../shared/ui/spool-icons";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { AgentOrbit, ConnectionsBody } from "../../../shared/ui/spool-rail-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { ThreadStrip } from "../../../shared/ui/spool-thread-strip";

/**
 * agent-play--nav-dock — the agent leaves the rail and floats bottom right.
 *
 * It plays itself. Press the caret in the card's own strip and it drops to a pill in the
 * corner, still turning, still carrying the last line it wrote; press the pill and it is
 * back. The inspector keeps its rail on the right, at the 300px it ships at, and there
 * is no tab row anywhere because nothing shares a surface with anything.
 *
 * **This is the other way to dissolve #144.** The crowding came from one 420px column
 * having to hold two panes, three strips and a transcript. Give the agent its own object
 * and the column is only ever the inspector — one tab, which is a title.
 *
 * **What it buys.** The agent can go away completely, which no rail can: a pill in the
 * corner is the smallest an always-live conversation has been on this page, and it is
 * still honest, because the ring turns and the line is real. The canvas also stops being
 * squeezed by the thing you are talking to.
 *
 * **What it costs, drawn rather than argued.**
 *
 * *It covers the canvas.* A 420×560 card over the bottom right corner is sitting on
 * whatever frames are there — the third column of this page is behind it. #114's whole
 * bar is *the frame you are watching repaints while the transcript is still streaming*,
 * and a panel that covers the frames is in a fight with its own reason to exist.
 *
 * *A card over cards.* Every frame on this canvas is already a bordered rounded
 * rectangle on the same plane, and this is another one, which is why it cannot lift with
 * a shadow the way a floating panel usually would — spool has no shadows and the frames
 * would then look flat by comparison. It separates on border and background alone.
 *
 * *Two things float already.* The tool bar is bottom centre. Anything docked bottom right
 * is a second floating object in the same band, and the corner is also where a resize
 * handle wants to be.
 *
 * *And the rail comes back anyway.* Connections still needs a home, so the right side
 * still exists — 300px of rail plus 420px of card is more of the window spoken for than
 * the 464 that --nav-edge spends, only now it is spent in two places.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

const SELECTED = "menu";

export default function AgentNavDockFrame() {
	const [shut, setShut] = useState(false);
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, LIVE_ASK);

	const deck = useDeck(railEntries(script, turn, elapsed, undefined, "lifted"), turn);
	const plan = deck.open.id === LIVE ? planOf(script, turn) : null;
	const said = lastLine(deck.open.entries);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				selected={SELECTED}
				tool="select"
				railWidth={300}
				railLabel="Inspector"
				rail={
					<>
						<RailTabs tabs={["connections"]} active="connections" />
						<ConnectionsBody frame={SELECTED} />
					</>
				}
			>
				<PlayField selected={[SELECTED]} />
				{shut ? (
					<button
						type="button"
						onClick={() => setShut(false)}
						className="absolute right-5 bottom-5 z-30 flex h-11 max-w-[300px] items-center gap-2.5 rounded-lg border border-border-raised bg-bg/95 pr-4 pl-3 backdrop-blur transition-colors duration-150 hover:border-muted/45"
					>
						<AgentOrbit life="running" />
						<span className="min-w-0 truncate font-mono text-muted text-sm leading-4">{said}</span>
					</button>
				) : (
					<div className="absolute right-5 bottom-5 z-30 flex h-[560px] w-[420px] flex-col overflow-hidden rounded-lg border border-border-raised bg-bg">
						<PlayRail
							nav={
								<ThreadStrip
									threads={deck.threads}
									open={deck.open.id}
									onOpen={deck.setOpen}
									after={
										<button
											type="button"
											aria-label="Collapse agent"
											onClick={() => setShut(true)}
											className="flex w-7 shrink-0 items-center justify-center text-muted/60 transition-colors duration-150 hover:text-text"
										>
											<PanelCaret dir="right" className="h-3.5 w-2.5" />
										</button>
									}
								/>
							}
							entries={deck.open.entries}
							plan={plan}
							phase={deck.phase}
							run={deck.run}
							onSend={ready ? deck.send : () => {}}
							onReplay={deck.replay}
						/>
					</div>
				)}
			</CanvasChrome>
		</SpoolShell>
	);
}
