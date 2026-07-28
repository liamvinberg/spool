import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--say-lines — the obvious answer, drawn so it can lose by being looked
 * at rather than by never being tried.
 *
 * Play it. The message is rendered, then cut at twelve lines — 240px — with a fade
 * into the background and `show all` under it. It is what every chat interface
 * does, it is trivially predictable, and the cut lands wherever the cut lands.
 *
 * **The count is arbitrary and cannot stop being arbitrary.** Twelve lines is a
 * number Spool invented. The corpus offers nothing to derive it from: in-transcript
 * messages are 33, 41, 41, …, 87 (median), …, 686, 1169, 1267, 1293, 3372
 * characters, which is not a distribution with a knee in it — it is a pile of short
 * replies and a handful of reports. Any threshold either fires on all five long
 * ones or on none, so the number is doing no work that a rule about *kind* would
 * not do better.
 *
 * **A height cut does not know what it is cutting.** Watch where the fade lands in
 * this capture: partway through the second numbered finding, mid-sentence. Move
 * the threshold two lines either way and it lands inside the blockquote, or inside
 * the palette's code block, cutting a colour list in half. `agent-play--say-lede`
 * cuts on a boundary the agent wrote, so it can never do this.
 *
 * **The fade is the part that reads worst.** It says *there is more* without
 * saying how much more, so a message with two hidden lines and one with fifty look
 * identical until you press. Spool has met this before and answered it the other
 * way twice: #135's run says `edit home ×6` rather than fading a list, and #117's
 * plan strip carries its count. `12 more` is the same answer a third time.
 *
 * **What it is genuinely better at.** It is honest about being a mechanical rule,
 * and it never mis-fires: a long message with no paragraph breaks — a wall the
 * agent wrote in one block — has no lede to split on and would draw whole under
 * the recommendation. There is no such message in the corpus, across all
 * fifty-nine assistant messages in four sessions, but there is no rule saying
 * there cannot be. That is the one case this frame covers and the other does not,
 * and it is the argument for keeping a height cap as a backstop *under* the lede
 * rather than instead of it.
 *
 * The capture is `claude-mcp.json`, un-elided for this ticket.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentSayLinesFrame() {
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
						say="lines"
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
