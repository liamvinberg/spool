import { railEntries, useCapture, useFanoutScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--subagents — the turn that hands work off three ways, and then
 * waits four minutes.
 *
 * Type anything and press Enter. The agent opens three rows, one per designer,
 * and they run at the same time for the rest of the turn while their frames
 * appear on the canvas underneath. This is the frame the whole prototype is
 * for, and until now the best moment in it was invented.
 *
 * It plays 425 events captured from a real fan-out (shared/fixtures/
 * claude-fanout.json, projection in shared/lib/claude-turn.ts). Three sub-agents,
 * all `subagent_type: "designer"`, briefed on one frame and three angles —
 * restrained, re-order, expressive — in a kaffe project whose `cart` and `menu`
 * are the two frames on the top row. The rail and the canvas finally name the
 * same project.
 *
 * Four things the capture settled, all of which the invented version had wrong:
 *
 *   they arrive out of order, and unevenly. `cart--empty` lands at 20:42:35,
 *   `cart--empty-c` at 20:45:40, `cart--empty-b` at 20:46:43 — so the third
 *   column fills before the second, and the gaps are 2:24, 3:05 and 1:03 rather
 *   than three beats in a row. The columns are name order because that is where
 *   each designer put its own frame.json; the arrivals are not sorted at all.
 *
 *   arriving is not finishing. Every designer writes its frame, shoots it, reads
 *   the PNG back and then keeps editing — `cart--empty` is rewritten four more
 *   times while the human is already looking at it, and each rewrite blinks the
 *   frame on the canvas because that is what spool does when a source changes.
 *
 *   two of the three never report. One task_updated lands inside the window, so
 *   the turn ends with one row checked, two still turning, and `cart--empty-b`
 *   still an empty socket four seconds after it appeared. Nothing is rounded up
 *   to a finish that did not happen.
 *
 *   the live step is a snapshot, not a log. Sixty-seven task_progress events
 *   carry a human-readable step; each row holds the one it is on and drops it
 *   the moment the task lands, because by then the frame it wrote is on the
 *   canvas and there is nothing left to disclose.
 *
 * Time. Six minutes thirty-seven becomes twenty-five seconds: intervals under
 * 3.7s divided by 9, everything past that by 34, so the long waits stay in
 * proportion to each other and the uneven stagger stays uneven. Average 15.7x.
 *
 * Still unrendered though the fixture carries them: the receipt, the token
 * counts and durations on every progress event, `rate_limit_event`, `init`, the
 * background-task lifecycle, and the one finished designer's written report.
 */

const PROJECT: readonly BaseFrame[] = [
	{ name: "cart", screen: "cart" },
	{ name: "menu", screen: "menu" },
];

/** the three frames the turn writes, in the order the folder sorts them */
const TAKES = ["cart--empty", "cart--empty-b", "cart--empty-c"] as const;

export default function AgentPlaySubagentsFrame() {
	const capture = useCapture("claude-fanout");
	const script = useFanoutScript(capture);
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;

	const takes = TAKES.map((name) => {
		const take = script.takes.find((candidate) => candidate.name === name);
		return {
			name,
			arrived: take !== undefined && turn.at(take.arriveCue),
			painted: take?.paintCue != null && turn.at(take.paintCue),
			revision: take === undefined ? 0 : take.changeCues.filter((cue) => turn.at(cue)).length,
		};
	});

	// spool watches the folder, so a frame is in the Pages rail as soon as its file is
	const pages: readonly PageRow[] = [
		{
			name: "root",
			frames: [...PROJECT.map((frame) => frame.name), ...takes.filter((take) => take.arrived).map((take) => take.name)].sort(),
			active: true,
			open: true,
		},
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages}
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
				<PlayField base={PROJECT} takes={takes} />
			</CanvasChrome>
		</SpoolShell>
	);
}
