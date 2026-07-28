import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-stop--edge — the same turn, with the stop hanging off the live end of the
 * log rather than sitting in the chrome.
 *
 * The honest case for it: it points at what it stops. A stop in the footer is a
 * control about *the turn*, an abstraction; a stop under the row that is actually
 * running is about that row, and the thing you are trying to stop is usually one
 * specific act you just watched start — the `edit` you did not want, the `Bash` that
 * is about to run for two minutes.
 *
 * **Watch it for ten seconds and the case dies.** It travels. The live edge moves
 * every time a row lands, so the one control on screen whose whole job is to be
 * pressable in a hurry is the one control that will not hold still — and it moves
 * *fastest* exactly when the turn is going wrong and rows are piling up. The footer
 * is fixed and 18px from the cursor that just pressed Enter.
 *
 * It also scrolls away. The transcript follows the live end only while the reader is
 * already there (`spool-play-rail.tsx:530`); scroll up to read what the agent said
 * two rows ago — which is *why* people stop turns — and the stop leaves the box.
 * A control you can lose by reading is not a control.
 *
 * And it breaks what the log is. Every other thing in this transcript is a receipt
 * for something that already happened; #145's question was the sole exception and it
 * earned it by being a thing the agent asked, in the agent's own words. A button
 * that changes the future, sitting in the past tense, is the second exception and it
 * has no such claim — it is Spool's control, not the agent's, and Spool's controls
 * live in Spool's chrome.
 *
 * Everything else here is `agent-stop`, which holds the argument.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentStopEdgeFrame() {
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
						stop="edge"
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
