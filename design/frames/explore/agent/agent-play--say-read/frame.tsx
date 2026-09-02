import { railEntries, useCapture, useTurnScript } from "shared/lib/claude-turn";
import { useTicker, useTurn } from "shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool-canvas-chrome";
import { PlayField } from "shared/ui/spool-play-field";
import { PlayRail } from "shared/ui/spool-play-rail";
import { SpoolShell } from "shared/ui/spool-shell";

/**
 * agent-play--say-read — rendered and not clamped at all. The frame that asks
 * whether structure on its own is the answer.
 *
 * Play it against `agent-play--say-raw` and the difference is larger than a clamp
 * would be. The same 3,372 characters become a verdict, three bolded findings, a
 * blockquote holding the sentence the Drive connector emitted, a palette in a code
 * block, a second fenced block of three failing verbs, and a closing paragraph
 * about why the agent stopped. It is a document, and it is legible without opening
 * anything.
 *
 * **So this is a real candidate and not a strawman.** The argument for it: every
 * rule the log has about room exists because the thing being shortened was
 * *ceremony* — a tool call is machinery, six writes are one action, a screenshot
 * is fixed at one moment. The agent's own words are none of those. They are the
 * only thing in the rail nobody can reconstruct from somewhere else, and #117's
 * test — does it outlive the call that made it — a message passes trivially,
 * because there was no call.
 *
 * **What it costs.** Rendered, this message is 1,234px in a transcript of 500,
 * two and a half screens. The follow-the-end scroll parks you on its last
 * paragraph, so you land at the end of a report whose verdict is two screens up
 * and reading it means scrolling backwards through your own log. Three of the five
 * long messages in the corpus are mid-turn rather than final, and those push real
 * rows out of sight rather than only arriving tall.
 *
 * **And the strongest thing that can be said for it.** Claude Code renders all of
 * this and clamps none of it, and nobody complains, because its transcript *is* the
 * window. The counter is that Spool's is 420 wide beside the thing the message is
 * about — but #145 gave it a scrollbar, so a message that does not fit is no longer
 * a message you cannot reach. That is the whole argument, and it is why this frame
 * is a candidate rather than a strawman.
 *
 * **What it settles regardless of which frame wins.** The rail renders markdown
 * now, and that was never a decision anybody made — it drew source because nobody
 * had drawn a message long enough to have structure. Whichever clamp lands, this
 * part of the frame ships.
 *
 * **The stream is the other thing to watch here, and it is shared with the
 * recommendation.** #145's rule reserved the finished message's full height from
 * the first character so the rows above never walk a line at a time. At 1,234px
 * that would mean the transcript goes from empty to two and a half screens of
 * blank in one frame and then fills in with text for the next twenty seconds. The
 * rule was written for a two-line sentence and it does not survive at this size:
 * a message of four paragraphs or more now grows as it arrives, and the rows above
 * it move. That is the third of the ticket's three questions, and it is answered
 * the same way whichever of these frames wins.
 *
 * The capture is `claude-mcp.json`, un-elided for this ticket.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentSayReadFrame() {
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
						say="read"
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
