import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--mcp-quiet — the log holds work, and loading a tool is not work. Play
 * it and watch what is missing.
 *
 * Naming is `agent-play--mcp-ask`'s. The only difference is that no `ToolSearch`
 * draws a row, ever — and the frame is here because of what that costs, not what it
 * saves.
 *
 * **The saving is real.** MCP tools are deferred: `init.tools` offers zero `mcp__*`
 * entries and `get_context_usage` prices what is held back at 58,732 tokens against
 * 3,013 loaded. So the agent must `ToolSearch` before it can call, and every foreign
 * beat is two calls where a `read` is one: four searches for three calls in this
 * window. Drawing the searches more than doubles the foreign half of the log to say
 * the binary loaded a tool, which is Claude Code's own bookkeeping and not something
 * the developer asked for — the same argument #135 already accepted for `TaskUpdate`,
 * which moves the plan and draws nothing.
 *
 * **The cost is the thing this frame is for.** Somewhere in here the agent was asked
 * for Figma and went looking. `claude.ai Figma` is one of eight connectors on this
 * machine in `needs-auth`, and a connector nobody has signed in to does not offer a
 * failing tool — it offers **no tool**. `ToolSearch` answered
 * `No matching deferred tools found`, and the agent then said nothing about it:
 * grep the whole 787-event capture and Figma is never mentioned in a single word of
 * prose. It flagged the Notion miss at length and the odd Drive result at length.
 * The connector it could not reach at all, it skipped in silence.
 *
 * So in this frame the developer asked for Figma tokens, got a frame with no Figma
 * tokens in it, and there is nothing anywhere on screen that says why. That is
 * [#126](https://github.com/liamvinberg/spool/issues/126)'s promise — a designer
 * pulling a design into Spool is the difference between a canvas and a toy — failing
 * with no receipt.
 *
 * **The honest reading of the pair.** A search that found its tool is machinery. A
 * search that found nothing is the only trace an unreachable connector leaves
 * anywhere in the stream. Those are not the same event, so the recommendation draws
 * the second and drops the first, and the frame to the right draws both.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentMcpQuietFrame() {
	const capture = useCapture("claude-mcp");
	const script = useTurnScript(capture, "mcp");
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
						entries={railEntries(script, turn, elapsed, undefined, "log", "none")}
						phase={turn.phase}
						mcp="ask"
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
