import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--mcp-tool — the row says what was called, not only where. Same data,
 * both of the binary's names, and it is the tool's name that gives it away.
 *
 * `notion Notion-Search`. `google drive Search Files`. In a third session on the
 * same machine the same shape produces `eidra artifacts artifact_help`.
 *
 * **The position this frame holds is a good one.** `ask Notion` says the agent went
 * to Notion and not what it did there — searched, created a page, moved twenty of
 * them. A log whose whole job is to say what happened arguably owes the verb, and
 * the binary sends a name for it, so printing it invents nothing. Spending the verb
 * slot on the server is how you keep both: the left column stays the scannable one
 * and the subject carries the act.
 *
 * **It loses on the strings, and only on the strings.** `display_name` is not
 * Claude's, it is the connector author's, and there is no convention across servers:
 * Title-Case with a redundant server prefix, Title-Case with a space, bare
 * snake_case. Three servers, three answers. `server_display_name` has been clean in
 * every case measured, because it is registry copy rather than code.
 *
 * So this row is legible when the author was tidy and reads like a stack frame when
 * they were not, and nothing in the data says which you are getting. That is the
 * whole argument: **the subject slot is the one the eye scans, and a name Spool
 * cannot vouch for does not belong in it.** `artifact_help` behind a chevron is a
 * fact; `artifact_help` as the subject of a row is Spool presenting somebody's
 * function name as a noun.
 *
 * It also spends the verb slot on a word that is not a verb, which every other row
 * on this rail keeps for one — `read`, `edit`, `shot`, `delegate`, `think`. Small
 * next to the first cost, and worth writing down: it is a second thing this shape
 * has to give up.
 *
 * Everything else is `agent-play--mcp-ask`'s and unchanged: the ✕ on the refused
 * Drive call, the disclosure holding the human's own sentence, the one discovery row
 * where Figma was not there to be found.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentMcpToolFrame() {
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
						entries={railEntries(script, turn, elapsed, undefined, "log", "empty")}
						phase={turn.phase}
						mcp="tool"
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
