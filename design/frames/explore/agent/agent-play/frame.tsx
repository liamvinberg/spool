import { railEntries, useCapture, useTurnScript } from "shared/lib/claude-turn";
import { useTicker, useTurn } from "shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool-canvas-chrome";
import { PlayField } from "shared/ui/spool-play-field";
import { PlayRail } from "shared/ui/spool-play-rail";
import { SpoolShell } from "shared/ui/spool-shell";

/**
 * agent-play — the baseline, and a working one.
 *
 * Not a picture of a turn: type in the composer, press Enter, and a real turn
 * replays in front of you. Whatever you typed becomes your turn verbatim, because
 * the prompt is yours and the answer is the specimen.
 *
 * The answer is no longer written by hand. It is projected off 236 events captured
 * from a live `claude -p --output-format stream-json` run (shared/fixtures/
 * claude-turn.json, projection in shared/lib/claude-turn.ts). This frame plays the
 * first slice of that session: the agent reads one spool skill topic, writes a
 * seven-task plan, thinks for 1.4 seconds, and says what it is about to do.
 *
 * What plays is still deliberately small. Everything a turn could also emit — the
 * receipt, the token count, the cost, the rate limit, the lifecycle noise — is in
 * the fixture and is not here, and the frame is the argument for leaving it out.
 *
 * Three things the capture corrected:
 *   the plan          seven TaskCreate calls in a row are one row, not seven. The
 *                     tool call is ceremony; the list is the object, and it is the
 *                     only thing in a turn that outlives the turn. So it is the
 *                     fan-out's own disclosure, opened by the turn as it is
 *                     written, and one line for the rest of the session.
 *   the wording       the agent supplies both phrasings — `subject` for the
 *                     settled form, `activeForm` for while it runs — so the rail
 *                     never has to invent a friendlier one. This capture creates
 *                     seven tasks and starts none, so all seven rest.
 *   prose last        it is not last because it is a summary. In the real message
 *                     the blocks arrive thinking, then text, then tool_use: the
 *                     agent narrates and then acts. This slice ends on the
 *                     narration because the delegation it announces is the next
 *                     frame.
 *
 * The motion language the other two inherit:
 *   rows arrive     a box opens to the row's own height and the row rises into
 *                   it, so the log above glides instead of jumping.
 *   the mark        the ring keeps turning as it shrinks away and the check
 *                   strokes through the space it leaves. One gesture.
 *   the subject     lands on the fragment that first carries it, which is never
 *                   the first one: a tool block opens with a name and an empty
 *                   input, and the argument arrives in uneven pieces behind it.
 *   prose           lands in the two chunks it really arrived in, 376ms apart,
 *                   into a block that already holds its final height.
 * Under reduced motion every cue fires at once and the turn is already settled.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "plan");
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
