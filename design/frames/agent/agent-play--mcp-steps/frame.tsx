import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--mcp-steps — the two-step drawn as two steps. Every search is a row.
 *
 * `find notion search page`, `find google drive search file`, `find figma design
 * variables colors`, and then — several rows and a paragraph of prose later — the
 * calls. Seventeen rows where the recommendation draws fourteen.
 *
 * **The position is the rail's own default, and that is its best argument.** One
 * line per tool call, no exceptions, decided by the call happening rather than by
 * Spool judging it interesting. `ToolSearch` is a tool the agent chose and ran, and
 * every other tool it chooses and runs gets a line. Dropping a whole tool from the
 * log means Spool has an opinion about which of the agent's actions count, and the
 * moment there is a list of those the list needs maintaining.
 *
 * It also makes the pause honest. The searches are fast here — 68ms, 95ms, 94ms —
 * but they are two round trips before anything leaves the machine, and a log that
 * hides them makes a foreign call look like a local one.
 *
 * **What it costs, on screen above.** The row it adds says the same thing every
 * time: the agent went and got a tool. And the subject is the query, which is the
 * agent's own words and therefore not inventable-away — `+figma get code variables
 * styles frame` is a bag of search terms sitting in the slot where `cart` and `home`
 * sit everywhere else on this rail.
 *
 * **The two-step is not adjacent, which is the finding that decided it.** The
 * intuition was `find X` then `ask X`, a pair you could read as one act or collapse
 * into one row the way #135 collapses six edits. It is not what happens. The agent
 * searched three times in 800ms, up front, then thought, then narrated, then made its
 * first call eight seconds later — so the searches arrive as a block of machinery
 * with nothing beside them, and the calls arrive detached from the searches that
 * loaded them. There is no pair to collapse and no adjacency to read.
 *
 * So the choice is not between honest and tidy. It is between one row per call and
 * one row per act, and this map already chose one row per act twice: #117 for the
 * plan's seven creates, #135 for a frame's six edits. Here the acts and the calls are
 * not even in the same part of the log.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentMcpStepsFrame() {
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
						entries={railEntries(script, turn, elapsed, undefined, "log", "all")}
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
