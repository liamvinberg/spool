import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--ask-composer — the options over the composer, so the log keeps its
 * one-line rule perfectly. It is the tidier frame and the worse one.
 *
 * Play it, then hover the three chips one after another. That is the cost: the
 * description is 150 to 250 characters of what the choice will do to you, and here
 * it arrives one at a time in a popover. Comparing three options becomes serial
 * where the block in the previous frame makes it parallel — and the thing you are
 * comparing is the only thing that distinguishes them, because the labels are
 * `Run \`spool upgrade\``, `You fix it, I shoot` and `Ship it unverified`, none of
 * which says the daemon will restart under every canvas you have open.
 *
 * **Its case is real, which is why it is drawn rather than argued away.** #117's rule
 * is that a tool call is one line and the disclosure is the payload; a block of
 * three bordered rows inside the transcript is the largest thing this rail would
 * ever have drawn inline, larger than the 120px thumbnail #117 allowed only because
 * a picture is fixed at one moment. And the composer is where every other thing you
 * are asked to *do* already lives: #116's selection chips, #127's held prompt, the
 * model menu #118 put in the footer. A question is a thing to do. It belongs where
 * the doing happens.
 *
 * **What actually killed it is that the composer is already the free-text answer.**
 * The tool carries `response` as well as `answers`, and the binary tests `response`
 * first — so in the recommendation the composer is *already* live and typing is
 * already a first-class answer. Moving the chips down here does not add the prose
 * path, it only takes the descriptions away from the choice. Two surfaces for one
 * question where one would have done.
 *
 * Note what does **not** change between the three frames: the question itself. It is
 * a sentence the agent wrote, and the rail has drawn the agent's sentences since the
 * first frame, so it sits in the log in all three and only the options move. That is
 * the whole of what this ticket is choosing between, and it was not obvious until it
 * was drawn — the ticket asked "where does the question go", and the answer is that
 * the question was never the part that had anywhere else to be.
 *
 * Same capture and same slice as `agent-play--ask-log`.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentAskComposerFrame() {
	const capture = useCapture("claude-mcp");
	const script = useTurnScript(capture, "ask");
	// held at the question, same as `agent-play--ask-log`, so the options are pressable
	// for as long as a real one would be rather than the 84ms the capture had
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
						ask="composer"
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
