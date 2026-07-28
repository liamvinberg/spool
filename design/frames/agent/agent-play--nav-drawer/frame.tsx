import { LIVE, LIVE_ASK, useAutoAsk, useDeck } from "../../../shared/lib/agent-threads";
import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow, RailTabs } from "../../../shared/ui/spool-canvas-chrome";
import { PanelCaret } from "../../../shared/ui/spool-icons";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlanStrip, PlayRail } from "../../../shared/ui/spool-play-rail";
import { ConnectionsBody } from "../../../shared/ui/spool-rail-nav";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { ThreadStrip } from "../../../shared/ui/spool-thread-strip";

/**
 * agent-play--nav-drawer — the agent across the bottom, where width is free.
 *
 * It plays itself. Everything #144 is about is visible in the first row of the drawer:
 * the threads and the plan are **side by side** rather than stacked, because a 1192px
 * row has room for both. The crowding was never really about tabs — it was about a
 * 420px column being asked to hold five things vertically. Turn the column into a bar
 * and the whole question stops existing.
 *
 * The inspector keeps its own rail at the 300px it ships at, with one tab, which is a
 * title.
 *
 * **What it costs is the canvas, and this canvas cannot afford it.** Frames here are
 * phone-shaped: authored 240×520, drawn 329px tall at this zoom, in rows. A right rail
 * takes width, and width is what a page of phones has spare — 772×812 of viewport
 * still holds two rows of frames. A 300px drawer leaves 1192×512, and the second row
 * is gone: look at the bottom of the canvas, where the takes would land. #114's fanout
 * puts three sub-agent frames on that row while the transcript streams, so this shape
 * hides exactly the thing the feature is for.
 *
 * **And the transcript is the wrong shape for a bar.** A log is tall and narrow by
 * nature: 260px of drawer holds about six rows where the rail holds twenty. Prose that
 * runs the full 1192px is unreadable — the agent's sentences here are real, measured at
 * a median 53 characters per delta, and they arrive as paragraphs — so a wide drawer
 * needs a reading measure it is not being given, and the composer becomes a text field
 * the width of the window to type one sentence into.
 *
 * So this is the frame that proves the premise rather than the frame that wins: the
 * strips stop competing, and the two things the rail was actually good at — a long log
 * and a canvas with vertical room — are both worse.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

const SELECTED = "menu";

const DRAWER_H = 300;

export default function AgentNavDrawerFrame() {
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, LIVE_ASK);

	const deck = useDeck(railEntries(script, turn, elapsed, undefined, "lifted"), turn);
	const plan = deck.open.id === LIVE ? planOf(script, turn) : null;

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<div className="flex h-full w-full flex-col">
				<div className="min-h-0 flex-1">
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
					</CanvasChrome>
				</div>
				<div
					aria-label="Agent"
					className="flex shrink-0 flex-col border-border border-t bg-bg"
					style={{ height: DRAWER_H }}
				>
					<PlayRail
						nav={
							<div className="flex shrink-0 items-stretch">
								<div className="min-w-0 flex-1">
									<ThreadStrip threads={deck.threads} open={deck.open.id} onOpen={deck.setOpen} />
								</div>
								<div className="flex w-[480px] shrink-0 items-stretch border-border border-l">
									{plan === null ? (
										<span className="flex h-[34px] items-center border-border border-b px-3.5 font-mono text-2xs text-muted/45 leading-3">
											no plan yet
										</span>
									) : (
										<div className="min-w-0 flex-1">
											<PlanStrip plan={plan} />
										</div>
									)}
								</div>
								<button
									type="button"
									aria-label="Collapse agent"
									className="flex w-9 shrink-0 items-center justify-center border-border border-b border-l text-muted/60 transition-colors duration-150 hover:text-text"
								>
									<PanelCaret dir="right" className="h-3.5 w-2.5" />
								</button>
							</div>
						}
						entries={deck.open.entries}
						phase={deck.phase}
						run={deck.run}
						onSend={ready ? deck.send : () => {}}
						onReplay={deck.replay}
					/>
				</div>
			</div>
		</SpoolShell>
	);
}
