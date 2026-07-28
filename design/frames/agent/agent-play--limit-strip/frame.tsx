import { useLimit } from "../../../shared/lib/agent-limit";
import { CAPTURED, useModel } from "../../../shared/lib/agent-model";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { LimitStrip } from "../../../shared/ui/spool-limit";
import { ModelMenu } from "../../../shared/ui/spool-model-control";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--limit-strip — the window takes the plan's slot, and says the whole
 * sentence.
 *
 * The loud answer, drawn properly so the comparison is fair rather than rigged.
 * It gets the binary's own sentence in full — `You've used 92% of your weekly
 * limit · resets wed` — and the binary's own lever as something to click
 * rather than something to retype. Clicking it is exactly typing it: `/model
 * sonnet` is answered by the binary for zero turns and zero tokens, and the reply
 * lands in the transcript under it, which is #118's rule and not a second source
 * of truth.
 *
 * The case for it is the ticket's own worry. A developer who has never heard of a
 * weekly window watches the agent stop and has no way to interpret it, and a
 * clause in a footer is not going to reach that person. This one cannot be
 * missed.
 *
 * Three things wrong with it, and they are structural rather than a matter of
 * degree:
 *
 *   it stacks       the plan already owns this slot, and a plan and a limit are
 *                   both true across a whole turn. #117 put the plan here because
 *                   it outlives the call that made it; a weekly window outlives
 *                   the plan. Both being right is exactly the problem — the
 *                   transcript starts two rows further down for the rest of the
 *                   session.
 *   it peaks early  it is at its loudest the moment it has least to say. The
 *                   binary's threshold is 0.75, so this strip is full height at
 *                   76% — where nothing has happened, nothing is going to happen
 *                   for days, and the only available reading is that something is
 *                   wrong.
 *   it doubles      the remedy it prints is the control in the footer. Two things
 *                   on one screen offering one action, and the sentence is the
 *                   worse of the two because it has to be read and then obeyed.
 *
 * Play it against the frame to the left. Same fact, same evidence, same moment;
 * the only question is what it costs to be told.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayLimitStripFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "plan");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	const deck = useModel(CAPTURED, turn.run);
	const limit = useLimit(turn.run);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={[...deck.before, ...railEntries(script, turn, elapsed), ...deck.after]}
						phase={turn.phase}
						header={
							<LimitStrip
								info={limit.info}
								model={deck.state.value}
								effort={deck.state.effort}
								onLever={(text) => {
									deck.say(text);
								}}
							/>
						}
						model={<ModelMenu state={deck.state} models={deck.models} pin={deck.pin} onPick={deck.pick} />}
						run={turn.run}
						onSend={
							ready
								? (text) => {
										if (deck.say(text)) return;
										turn.send(text);
									}
								: () => {}
						}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
