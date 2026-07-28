import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--say-raw — what the rail did before this ticket. Here as the diff,
 * not as a candidate.
 *
 * Play it. The same 3,372-character message the other three frames draw, rendered
 * the way every frame on this page rendered it until now: as source. `**The shot
 * failed, so I have not checked my work.**` keeps its four asterisks, `` `spool
 * shot receipt` `` keeps its backticks, and the fenced block draws three literal
 * backticks in the middle of a paragraph. The two-space-indented lines inside the
 * fence hold their own indentation, so the palette reads as a wrapped run-on.
 *
 * Nobody decided this. Claude Code writes markdown because its own surface is a
 * terminal that renders it, and nothing in `spool-play-rail.tsx` ever did — the
 * rail's own author never noticed because the median message on this page is 87
 * characters and a one-sentence reply has no markers in it. It surfaces the moment
 * a message is long enough to have structure, which is exactly the moment this
 * ticket is about.
 *
 * **This frame is why the clamp could not be argued first.** The ticket asked how
 * much room a message may take. Measured on this frame the answer is several
 * screens of unbroken grey — but that is the height of the *source*, and the
 * source is not what ships. Rendered, the same message is
 * thirteen paragraphs with a quote and a code block, and the thing that makes it
 * long is the same thing that makes it skimmable. So the question had to be
 * re-asked against `agent-play--say-read` before any clamp could be chosen, and
 * the answer changed.
 *
 * It is worth noticing what the source treatment costs beyond height. The message
 * is a report with a verdict, three numbered findings, a palette and a blocker;
 * as source none of that is visible without reading every word, so a reader who
 * only wants to know whether the work landed has to read 3,372 characters to find
 * `The frame is authored and live on the canvas.` in the first line. The clamp
 * question and the render question are the same question asked twice.
 *
 * The capture is `claude-mcp.json`, un-elided for this ticket: it had held this
 * message cut to 1,232 characters, which is the number the ticket was written
 * against and 2,140 characters short of the real one.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentSayRawFrame() {
	const capture = useCapture("claude-mcp");
	const script = useTurnScript(capture, "say");
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
						entries={railEntries(script, turn, elapsed, undefined, "log", "empty")}
						phase={turn.phase}
						mcp="ask"
						say="raw"
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
