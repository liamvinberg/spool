import { CAPTURED, useModel } from "../../../shared/lib/agent-model";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { ModelAxes } from "../../../shared/ui/spool-model-control";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--model-engines — all three axes, and both ways an axis becomes
 * furniture.
 *
 * This is `agent-native`'s shape drawn straight: `{engine, model, effort}`, three
 * groups, engine on top. It is here to be looked at once rather than argued
 * about, because the two greyed groups are greyed for two different reasons and
 * only one of them is temporary.
 *
 *   engine    one live row. #115 settled Claude Code first, hand-written over
 *             `stream-json` against the developer's own binary; ACP is the second
 *             adapter and reaches both of the others. Until it exists, codex and
 *             opencode are rows that cannot be picked — `configured: false` doing
 *             exactly the job it exists for, greying an engine the machine cannot
 *             run instead of failing at submit.
 *   effort    every level but one is dead, and not because Spool is unfinished.
 *             This machine exports `CLAUDE_CODE_EFFORT_LEVEL=max`, and #115
 *             settled that the daemon spawns the developer's binary and inherits
 *             their environment. So the variable outranks the control. Measured,
 *             not imagined:
 *
 *               $ claude -p "/effort xhigh"      → num_turns: 0, cost: 0
 *               CLAUDE_CODE_EFFORT_LEVEL=max overrides this session
 *               — clear it and xhigh takes over
 *
 * That second one is the sharpest thing this ticket turned up, and it outlives
 * whichever frame wins. A control that draws its own state is guessing. A control
 * that shows the binary's reply cannot be wrong, because the binary is the thing
 * that knows. Whatever ships has to be able to say *your environment is holding
 * this* rather than accept a click and change nothing.
 *
 * The engine axis is also the only one of the three that cannot switch mid-thread
 * at all. Model and effort are messages into a running session, answered for no
 * turn and no token. A different engine is a different binary, a different
 * process and a different session id: picking one does not change who answers
 * next, it ends the conversation and starts another. Three rows of equal weight
 * say all three are the same kind of choice, and they are not.
 *
 * Which is the argument against this frame. The engine group is a dropdown with
 * one entry, and a picker with one entry is furniture — it earns its place the
 * day the ACP adapter lands and not before.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayModelEnginesFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "plan");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	// the pin is this machine's, read off its own environment rather than supposed
	const deck = useModel({ ...CAPTURED, effort: "max" }, turn.run, "max");

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
						model={<ModelAxes state={deck.state} models={deck.models} pin={deck.pin} onPick={deck.pick} />}
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
