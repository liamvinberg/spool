import { railEntries, captureEvents, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";
import claudeMcpCapture from "shared/captures/claude-mcp.json";

/**
 * agent-say-paragraph--real-ghost: the unit take on a real turn.
 *
 * Not the scripted message. This is `claude-mcp.json`, a capture of a live `claude -p`
 * turn: the reads and searches before the message, two MCP connectors that could not be
 * reached, and a 3,372 character report with three bolded findings, a blockquote, two
 * fenced blocks and a closing paragraph. What a take looks like on a message that long,
 * inside the rows around it, is the only test that counts.
 *
 * Type anything in the composer and press Enter to play it; replay from the same place.
 *
 * The arriving paragraph is on screen at 30% and comes up when whole. On a message this
 * long the dim text is most of a screen at times, which is the thing to judge.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function Frame() {
	const capture = captureEvents(claudeMcpCapture);
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
						say="ghost"
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
