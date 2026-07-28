import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-stop--field — the same turn, with the stop inside the composer box where
 * every other chat surface puts it.
 *
 * ChatGPT and Claude.ai both morph the send arrow into a stop square in place, so
 * the control never moves and the eye already knows where it is. It is the most
 * borrowed answer available and the reason to take it seriously.
 *
 * **The borrow does not survive the transplant, because Spool has no send button.**
 * Enter sends (`spool-play-rail.tsx:1533`) and nothing else does. Those surfaces do
 * not have a stop *button*, they have a send button that becomes one — one slot, two
 * jobs, and the morph is the whole idea. Spool has no such slot, so this frame is
 * not adopting a convention, it is **adding the send button Spool deliberately does
 * not have, purely so that stop has somewhere to be**, and then leaving it empty for
 * the 99% of the time no turn is running.
 *
 * Look at what that costs in the box. #116 fought this box down to one line of
 * selection above the prompt, and the chip strip is measured against
 * `COMPOSER_W = 420 - 28 - 24`. A 28px control at the field's edge takes width from
 * the prompt at every height, and it is beside the *text*, so it reads as belonging
 * to what you are typing — which is exactly backwards: the thing it stops is above
 * it in the log, not below it in the field. The footer's slot is under the whole
 * composer and reads as being about the turn.
 *
 * The second cost is the empty one. A control that is present-then-absent inside a
 * bordered box makes the box itself change shape: the textarea's width jumps by 36px
 * the moment a turn starts and back when it ends, under a cursor that is mid-word.
 * The footer slot is 18px of chrome nothing else is using and nothing reflows around
 * it.
 *
 * Everything else here is `agent-stop`, which holds the argument.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentStopFieldFrame() {
	const capture = useCapture("claude-interrupt");
	const script = useTurnScript(capture, "stop");
	const turn = useTurn(script.cues, undefined, script.cut ?? undefined);
	const elapsed = useTicker(turn.run, script.total, turn.waiting || turn.phase === "stopped");
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
						stop="field"
						onStop={turn.cut}
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
