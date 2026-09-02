import { railEntries, useCapture, useTurnScript } from "shared/lib/claude-turn";
import { useTicker, useTurn } from "shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool-canvas-chrome";
import { PlayField } from "shared/ui/spool-play-field";
import { PlayRail } from "shared/ui/spool-play-rail";
import { SpoolShell } from "shared/ui/spool-shell";

/**
 * agent-play--ask-log — the recommendation. The turn stops, and the thing that
 * stops it is wide for exactly as long as nobody has answered it.
 *
 * Play it. The agent finishes a long explanation, opens an `AskUserQuestion`, and
 * **the question types itself in** — eleven `input_json_delta` fragments in the
 * capture, splitting mid-token, the same three beats every tool call gets. Then
 * three options land with their descriptions under them. Press one: the block
 * collapses and your choice appears in the log as your own words. Press nothing
 * and watch what the capture actually did.
 *
 * **The ticket asked whether these are one state or three. They are not even three
 * of a kind.** Read off 2.1.220 and `claude-mcp.json`:
 *
 *   `AskUserQuestion`      arrives as a `can_use_tool` control request — #121's own
 *                          channel — with `requires_user_interaction: true`, which
 *                          is present on that one ask and absent on the other
 *                          eleven. The words are the **agent's**.
 *   `elicitation`          its own subtype, its own `accept | decline | cancel`,
 *                          and the words are an **MCP server's**.
 *   `request_user_dialog`  its own subtype, and Spool can decline to be able to
 *                          receive it at all: `dialog_kinds` is declared at
 *                          `initialize` and the CLI "treats ABSENCE as 'cannot
 *                          display' and fails closed", degrading the flow instead
 *                          of parking a dialog. The words are **Claude Code's**.
 *
 * So only one of the three is a question in the agent's voice, and it is the only
 * one that is reachable, captured, and drawn here. The other two are argued in the
 * ticket, not drawn, because there is nothing to look at that a decision turns on.
 *
 * **The premise that Spool could refuse this one is false, and it costs a flag.**
 * The tool's `isEnabled()` is `if (_n() && !Sue()) return false` — under `-p` it
 * exists only when a permission-prompt tool is wired, and `Sue()` is exactly
 * `--permission-prompt-tool`, which #121 settled Spool passes and which approvals
 * cannot work without. Spool does not get to have approvals and not have this. And
 * `checkPermissions` returns `behavior: "ask"` unconditionally, so no allow rule
 * can ever pre-answer it either.
 *
 * **Answering it is not "rendering someone else's option list", because the tool
 * models prose as a first-class answer and ranks it higher.** The input schema
 * carries `answers` (keyed by question text), `annotations`, and **`response`** —
 * and in `mapToolResultToToolResultBlockParam` the `response` branch is tested
 * *before* the answers branch. Three different sentences go back:
 *
 *   picked on-menu    `Your questions have been answered: … You can now continue
 *                      with these answers in mind.`
 *   said something    `The user answered: … Read the answers carefully — they may
 *                      request clarification, changes, or that you not proceed —
 *                      and follow what they actually say.`
 *   nothing           `The user did not answer the questions.`
 *
 * The off-menu sentence is the *stronger* instruction. So the composer staying live
 * beside the options is not a fallback, it is the path the binary prefers, and this
 * frame keeps both: press an option or just type.
 *
 * **What settled the placement was the `description` field.** Each option carries
 * 150 to 250 characters saying what it costs — `Side effect: the daemon restarts
 * under any canvas you currently have open` is the entire reason to pick a
 * different one. Three of those are readable side by side in a block and are not
 * readable at all in a chip, which is what the next frame shows.
 *
 * **Nothing permanent is added to the rail.** The question is a sentence the agent
 * wrote, so it is drawn where the agent's sentences are drawn. The answer is a
 * sentence the developer chose, so it lands in the shape the rail already gives the
 * developer's words — the 2px accent rail from the top of the turn. Agent, then
 * human, which is what a thread is (#136). The option list is the only new geometry
 * and it exists only while the question is open.
 *
 * **The verb slot could not take it, which is why the answer is not a row.** #142
 * spent `ask` on every call that left the building, and `ask Notion` sitting one row
 * above `asked Shot fix` is two words the eye cannot separate at that size. There
 * was no word left, and needing none turned out to be the better answer.
 *
 * **An unanswered question is neither a state nor a stall — the agent answers for
 * you.** Under `-p` the result lands 84ms later, and the capture's next events are
 * five `thinking_tokens` beats and then `Understood, I'll leave your install alone.`
 * It read the silence as the most cautious option and carried on. That prose is the
 * next entry here and it plays for free. It is also the strongest argument for
 * drawing the question at all: the alternative is not "no question", it is the agent
 * quietly choosing on your behalf.
 *
 * The capture is `claude-mcp.json`, sliced from the request that produced the
 * explanation through the agent's recovery line — the only question in either parent
 * capture. **There is one, not two**: the ticket, the map and #141 all say two, and
 * the parent holds a single `AskUserQuestion` tool_use id. Third miscount on this
 * map, and the third time the fixture was the thing that settled it.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentAskLogFrame() {
	const capture = useCapture("claude-mcp");
	const script = useTurnScript(capture, "ask");
	// the turn parks the moment the options have finished arriving, because that is
	// what the same events do with a client attached. Leave it parked and nothing
	// happens — which is the honest half of it: the agent is not burning anything
	// while you think, and it is not going to move until you say something.
	const held = script.rows.find((row) => row.kind === "ask");
	const turn = useTurn(script.cues, held?.kind === "ask" ? (held.liveCue ?? undefined) : undefined);
	const elapsed = useTicker(turn.run, script.total, turn.waiting);
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
						ask="log"
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
						onAnswer={turn.resume}
					/>
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
