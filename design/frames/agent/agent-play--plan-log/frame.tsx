import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--plan-log — the plan in the transcript, played long enough to see
 * what that costs.
 *
 * Type anything and press Enter, then leave it alone for half a minute. This is
 * the same vocabulary as agent-play and nothing about the plan is changed: it is
 * one row, its disclosure opens as the list writes itself, and it stays where it
 * was written.
 *
 * What is new is the length. agent-play plays the first nine seconds of a
 * session; this plays nine minutes and thirty-eight of it, forty-five rows,
 * off a third capture spliced for exactly this question (shared/fixtures/
 * claude-plan.json). It is the same Streak session the other two are windows
 * into — the repo just never kept the middle before, which is why no frame here
 * has ever shown a plan doing anything after it was written.
 *
 * It does plenty. The plan lands at 18:52:35. Task 1 starts at 18:54:09 and does
 * not finish until 19:02:02, and task 2 starts a second later. So the three
 * moments that make a plan a plan — a task starting, landing, and the next one
 * taking over — are all minutes and dozens of rows downstream of the row that
 * holds the list.
 *
 * Watch the top of the rail rather than the bottom. The plan block is the
 * tallest thing in the transcript, it is written first, and the transcript is
 * bottom-anchored, so it is the first thing carried off the top. By the time
 * task 1 is ticked the list it belongs to is long gone, and the tick lands in a
 * place nobody is looking at.
 *
 * That is the case against the log, made by the log. agent-play--plan-pinned is
 * the same nine minutes with the plan lifted out.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlanLogFrame() {
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
