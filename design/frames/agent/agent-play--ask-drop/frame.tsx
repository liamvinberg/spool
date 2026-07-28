import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--ask-drop — what the capture actually did, at the capture's own speed.
 * Nobody answers, and the finding is that this is not a stall.
 *
 * Play it and do nothing. The question arrives, the options are up for **84
 * milliseconds** — measured, `11:32:46.606` to `.690` — and then
 * `The user did not answer the questions.` comes back. The agent thinks for 6.6s
 * across five `thinking_tokens` beats and says:
 *
 *     Understood, I'll leave your install alone. One verification I can still do
 *     without spool: confirm the font URL actually resolves, since a font miss was
 *     one of the two risks I named.
 *
 * **It read the silence as an answer and picked the cautious option for you.** Not
 * a retry, not an error, not a hang — an inference, stated out loud, and then it
 * carried on and ran a `curl`. Compare it to the three options it had just offered:
 * that is option three, `Ship it unverified`, chosen on your behalf by a program
 * that had no idea whether you were in the room.
 *
 * That is the whole case for drawing the question. The alternative to a rail that
 * asks is not a rail that never asks — it is this, every time, invisibly.
 *
 * **This frame is the only one of the four with no hold on the clock**, which is why
 * it is a frame rather than a state of the other three. `useTurn`'s `hold` parks the
 * turn on the question because that is what these events do with a client attached;
 * here nothing parks, so the 84ms is real and the option list is genuinely
 * unpressable. Two honest readings of one capture, and they need different clocks.
 *
 * **What the capture cannot show, and this frame does not pretend to.** Nobody ever
 * answered, so there is no recorded continuation for an answered question anywhere.
 * In `agent-play--ask-log` an answer resumes into *this* tail — which happens to be
 * coherent if you press `Ship it unverified`, since that is the option the agent
 * inferred, and incoherent if you press either of the other two. The prototype says
 * so rather than papering over it, and closing that gap needs a capture with a
 * client on the other end, not a better frame.
 *
 * Same capture and slice as `agent-play--ask-log`: `claude-mcp.json`, from the
 * request that produced the explanation through the recovery line.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentAskDropFrame() {
	const capture = useCapture("claude-mcp");
	const script = useTurnScript(capture, "ask");
	// no hold: the clock runs the capture's own intervals end to end, so the question
	// is up for the 84ms it was really up for
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
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						ask="log"
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
