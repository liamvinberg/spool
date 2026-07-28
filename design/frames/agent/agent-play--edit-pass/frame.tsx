import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--edit-pass — one row per make-it-and-look-at-it loop.
 *
 * Same capture, same two minutes, collapsed the whole way. The run swallows the
 * `spool shot` and the `look` that close it, so two minutes of work is three
 * rows, and the picture the agent looked at becomes the payload of the row that
 * made it look. Nineteen rows become three.
 *
 * This is the argument that the unit was never the edit and never the run — it
 * is the pass. Six edits, a shot, a look, and then six more decisions: that is
 * one loop, and it is the loop the agent actually runs. Spool can see it because
 * `spool shot` is spool's own verb and `.spool/verify/<frame>.png` is spool's
 * own path, so the rail can recognise its own verify loop where a general
 * transcript could only see a Bash call and a Read.
 *
 * Two things it costs, both visible here.
 *
 *   The rail stops saying that the agent looked. #117 settled `shot home` and
 *   `look home` as their own rows on the grounds that a tool call is ceremony
 *   and the line is its receipt; this deletes two receipts. What is left saying
 *   it is the picture, which opens by itself when the image lands — so the row
 *   shows that it looked rather than telling you.
 *
 *   The well is empty, and here that is the capture rather than the product.
 *   `claude-edits.json` elides its four PNGs the way every fixture does, and the
 *   Streak project's frames have no components in this repo to draw at 120px.
 *   Read this row against `agent-play--shot-open`, which has both.
 *
 * The one thing to watch for is a run with no shot after it. The last thing the
 * agent does in a session is often to change a file and stop, and a pass row is
 * then a run row wearing a name it did not earn.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentEditPassFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "pass");
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
