import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--edit-log — a call is a row, which is the rule as it stands.
 *
 * Type anything and press Enter and leave it for two minutes. Thirteen edits to
 * one frame, in three runs of six, four and three, each run ending where the
 * agent goes and looks at what it changed. Nineteen rows for one problem.
 *
 * The capture is `fixtures/captures/claude-edits.json`, spliced from the Streak
 * parent for this question: 19:01:03 to 19:03:07, the shortest window that holds
 * more than one run and every boundary between them. The three older fixtures
 * all cut somewhere inside a run, which is why no frame here has ever shown one
 * end.
 *
 * One thing is fixed rather than argued, in all three of these frames. `edit`
 * had no subject at all, because `label()` named `Bash`, `Read`, `Write` and
 * `Agent` and nothing else, so a long transcript ended on six bare `edit ›`
 * rows. The subject is the frame rather than the file: `frames/home/frame.tsx`
 * and the geometry sidecar beside it are both the frame, and `edit frame.tsx`
 * six times names nothing at all.
 *
 * That fix is what this frame is for. It is the honest version of doing nothing
 * else — every call still gets its line, the lines now say which frame, and the
 * question is whether that was ever the problem. Six rows that read `edit home`
 * are six rows that say the same thing six times. The two frames to the right
 * are the two ways of saying it once.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentEditLogFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "none");
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
