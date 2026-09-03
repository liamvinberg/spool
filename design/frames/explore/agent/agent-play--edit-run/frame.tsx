import { railEntries, captureEvents, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";
import claudeEditsCapture from "shared/captures/claude-edits.json";

/**
 * agent-play--edit-run — the run is the row, and the count climbs while it runs.
 *
 * Same capture and the same two minutes as the frame to the left. Six edits to
 * `home` become one row that reads `edit home ×6`, and the ×N is live: the row
 * arrives as `edit home`, and every further edit lands on it rather than under
 * it. Nineteen rows become nine.
 *
 * The rule, and it is the whole of the rule: **consecutive writes to one frame
 * are one row, and the next thing the log draws ends it.** Nothing about time,
 * nothing about spool's own verbs, nothing that had to be tuned.
 *
 *   it is writes, not edits. In the fan-out capture a delegate goes `Edit, Edit,
 *   Write` and then `Edit, Write` — it switches to rewriting the file whole
 *   partway through, and that is still one act.
 *
 *   time cannot be the rule. Measured on both parents: gaps inside a run reach
 *   15.2s and the shortest gap between two runs is 17.5s. No threshold separates
 *   them, so any number picked here would be fitted to one capture.
 *
 *   a different file ends it, and in the captures that clause never fires after
 *   the opening writes. 51 writes make 29 runs and not one run longer than a
 *   single call ever spans two files: the agent finishes with a frame before it
 *   picks up the next one.
 *
 *   bookkeeping does not end it. `TaskUpdate` sits between the last edit and the
 *   shot in the first run here and draws no row, because #117 moved the plan out
 *   of the log. A call that draws nothing cannot break a run.
 *
 * What actually sits in every gap between two runs is the agent going and
 * looking at what it just changed — `shot home`, `look home`, and then the next
 * run. The rule does not mention that and does not need to: the shot draws a
 * row, and drawing a row is what ends a run.
 *
 * The disclosure holds a path and nothing more, exactly as a single edit's does.
 * The run adds no payload — six edits to one file is one file, and the count in
 * the subject is the entire difference between the six. The frame to the right
 * takes the collapse one step further and swallows the looking too.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentEditRunFrame() {
	const capture = captureEvents(claudeEditsCapture);
	const script = useTurnScript(capture, "session", "run");
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
