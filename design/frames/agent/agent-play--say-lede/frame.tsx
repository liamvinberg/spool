import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--say-lede — the recommendation. The agent already wrote the summary,
 * so the rail shows that and keeps the working one click down.
 *
 * Play it, and let it finish. The last thing the agent says in this window is
 * 3,372 characters. Rendered it is thirteen paragraphs, a fenced block and a
 * blockquote — 1,234px of prose in a rail whose transcript is 500.
 * Here it draws as its own first paragraph, `The frame is authored and live on the
 * canvas. The shot is blocked, and one of the MCP results is worth flagging.`,
 * with `12 more` under it.
 *
 * **The corpus was measured before anything was drawn.** Four real sessions, and
 * the number in the ticket was wrong twice over. `claude-mcp.json` held the message
 * elided to 1,232 characters with `<2172 more chars of text elided>` on the end;
 * the real one is 3,372 and the fixture now carries it, scrubbed of one real email
 * address the way the visible half already was. And `claude-plan.json` has held a
 * **5,243**-character message since #117 — but that one is a sub-agent's, and
 * `claude-turn.ts:938` filters the transcript to `fromParent`, so it never reaches
 * a log at all.
 *
 * What actually reaches a transcript, across all four sessions: **thirty-five
 * messages, median 87 characters.** Twenty-seven are under 200. Then 686, 1169,
 * 1267, 1293, 3372. So the clamp fires on five rows in thirty-five — not never,
 * which is what the delta statistics suggested, and not usually either.
 *
 * **The lede is the agent's, not Spool's.** Every one of those five opens with a
 * one-sentence verdict before it starts working: `Neither server could be reached
 * — here's exactly what came back.` / `Fonts check out: HTTP 200, both families
 * served…` / `Baseline captured. The house language is:` / `**`cart--empty` — done
 * and verified.**` Five for five. So the first paragraph is not a truncation of
 * the message, it is the message's own summary, and everything after it is
 * evidence for a claim you have already read. That is #117's rule holding exactly
 * as written: the line is the receipt, the disclosure is the payload — and here,
 * uniquely, the agent wrote both halves itself.
 *
 * **It only fires on a document.** Under four paragraphs the whole thing draws,
 * because a three-paragraph message has no lede to be separated from — its first
 * sentence *is* a third of it. So the `1,169`-character reply four rows up is
 * whole, and nothing under 200 characters is ever touched. The count says how much
 * is behind the chevron in the message's own units, `12 more`, rather than in
 * characters or lines nobody thinks in.
 *
 * **The clamp waits for the stream.** While the message is arriving it is drawn in
 * full and unclamped, and it collapses to the lede when it lands. Clamping a
 * half-arrived message would hide the paragraph currently typing itself, which is
 * the one thing worth watching.
 *
 * **The height-reserving stream does not survive at this size, and this frame is
 * where you watch it stop.** #145's rule holds the finished text's height from the
 * first character so the rows above never walk a line at a time. At two lines that
 * is right and it stays. At 1,234px it would mean the transcript goes from empty
 * to two and a half screens of blank in one frame and then fills in with text for
 * twenty seconds, which is worse to watch than the walk it prevents — so a
 * document grows as it arrives and the rows above it move. Nothing is measured to
 * decide that: it is the same four-paragraph test the lede already asks, so it is
 * known from the first character rather than from a layout pass.
 *
 * **What it costs is the one thing to look at before agreeing.** The message types
 * itself out in full, then collapses to its lede when it lands. That is a jump at
 * the end of every long turn, and it is the price of not having the jump at the
 * start of one. Play it twice before deciding which jump is worse.
 *
 * **The rail had never rendered markdown.** Before this it drew the source:
 * `**bold**` kept its asterisks, a fence drew three literal backticks
 * mid-paragraph, and the numbered list that makes this message skimmable was one
 * grey block. That is not what ships, so how much room a message needs could not
 * be argued against it — `agent-play--say-raw` is what the rail did, kept as the
 * diff. The subset is the corpus's own: bold, inline code, fences, quotes, lists.
 * **No heading appears in any of the thirty-five**, so `#` is not implemented.
 *
 * The capture is `claude-mcp.json`, the fifth fixture, un-elided for this ticket.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentSayLedeFrame() {
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
						say="lede"
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
