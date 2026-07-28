import { planOf, railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--plan-pinned — the same nine minutes, with the plan out of the log.
 *
 * Type anything and press Enter. Everything below the strip is byte-for-byte the
 * transcript agent-play--plan-log draws, off the same capture and the same cues.
 * The one difference is that the list has been lifted into a strip of its own
 * under the tabs, and the log keeps the single line that says it was written.
 *
 * The strip does not break the one-line rule; it is one line. A count, and the
 * agent's own present-participle phrasing for whatever is running — `activeForm`,
 * which the agent supplies alongside `subject` precisely so that a surface never
 * has to invent a friendlier wording. Click it for the list. Shut is the resting
 * state, because seven tasks permanently open is a hundred and fifty pixels of
 * rail that answers a question nobody asked twice.
 *
 * What it buys is the thing the log cannot do. `plan 0/7` becomes `plan 0/7
 * Setting up tokens, fonts, and scenario seed` at 18:54:09 and `plan 1/7
 * Authoring the home frame` at 19:02:02, and both changes happen in front of you
 * rather than eight hundred pixels above the fold. A plan is the one object in a
 * turn that goes on changing after the turn that wrote it, and a log is the one
 * place a changing object cannot live.
 *
 * The cost is honest and it is on screen: thirty-four pixels of rail, always,
 * including for the many turns that never write a plan at all. The strip is
 * absent until one is written, which is why this frame starts without it.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlanPinnedFrame() {
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
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
						entries={railEntries(script, turn, elapsed, undefined, "lifted")}
						plan={planOf(script, turn)}
						phase={turn.phase}
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
