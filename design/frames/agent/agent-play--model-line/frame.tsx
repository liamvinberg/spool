import { CAPTURED, useModel } from "../../../shared/lib/agent-model";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { ModelLine } from "../../../shared/ui/spool-model-control";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--model-line — no picker. The model is a fact, and the composer is
 * already the control.
 *
 * One line is added to the baseline and nothing else: `opus 5[1m] · high`, in the
 * 18px slot the send hint had. It is not a button. There is nothing to open.
 *
 * Play it, because the argument is the interaction rather than the picture:
 *
 *   /model              prints what you are on and what else there is
 *   /model sonnet       switches
 *   /model opus[1m]     switches to the long-context alias
 *   /effort xhigh       switches effort
 *   anything else       goes to the agent as your turn, exactly as before
 *
 * None of that is built. Sent into a `--print` session those are answered by the
 * binary itself before the model ever sees them, measured at **zero turns and
 * zero tokens**, so the composer has been a model picker the whole time:
 *
 *   $ claude -p --output-format json "/model sonnet"    → num_turns: 0, cost: 0
 *   Set model to Sonnet 5 for this session only
 *
 * Every reply in this frame is quoted from that binary rather than written here,
 * down to the wording of the usage line and the description of each effort level.
 *
 * Three things the probes settled, which are the reason this frame is drawn at all:
 *
 *   the list is not ours   `/model` reports the aliases the installed version
 *                          knows, so Spool never ships a table to go stale behind
 *                          an update. `agent-native` hardcodes options per engine
 *                          because it drives several; #115 settled that we drive
 *                          one.
 *   effort is not an axis  the CLI's own readout is `Haiku 4.5 (effort: high)`,
 *                          and `/effort xhigh` names the models it even applies
 *                          to. It is a property of the model, so it reads as one:
 *                          after the dot, on the same line, never in a field of
 *                          its own.
 *   nothing is persisted   every reply ends `for this session only`. A control in
 *                          someone else's tool must not quietly edit their config,
 *                          and this one cannot.
 *
 * What it gives up is discoverability, and that is the whole case against it:
 * nobody finds `/model` who does not already know it. What it gives back is that
 * the switch writes its own record. You typed a line, the binary answered under
 * it, and the transcript already says which model took over and when — the frame
 * to the right has to manufacture that.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayModelLineFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "plan");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	const deck = useModel(CAPTURED, turn.run);

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
						model={<ModelLine state={deck.state} models={deck.models} />}
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
