import { CAPTURED, useModel } from "shared/lib/spool/agent-model";
import { railEntries, captureEvents, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { ModelMenu } from "shared/ui/spool/model-control";
import { PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";
import claudeTurnCapture from "shared/captures/claude-turn.json";

/**
 * agent-play--model-menu — the same line, made a button.
 *
 * Open it. Nothing in this menu is written here. It is one control request on the
 * running session, rendered:
 *
 *   → {"subtype":"list_models"}
 *   ← five entries, each with a `value`, a `displayName`, a `description`,
 *     and its own `supportedEffortLevels`
 *
 * Which means the picker has no maintenance and no staleness. A new model appears
 * because the developer updated their CLI; a retired one disappears the same way;
 * Spool ships nothing and caches nothing, because the reply arrives on a session
 * that is already open. The fixture beside this frame is that reply, captured
 * whole.
 *
 * **Five rows, not ten.** `/model`'s usage line accepts ten aliases. `list_models`
 * offers five. Inputs are not choices, and the gap between them deleted two axes
 * an earlier draft of this frame had drawn:
 *
 *   the policy group   `default` comes back as an ordinary row reading `Default
 *                      (recommended)`. `best` and `opusplan` are accepted if you
 *                      type them and are not offered here. There was no
 *                      models-versus-policies split to make; the reply had
 *                      already made it.
 *   the width switch   `opus[1m]` is one entry called `Opus (1M context)`. Not a
 *                      model wearing a toggle. One row, one name.
 *
 * Both had been Spool inventing structure, and structure invented is structure to
 * keep in sync. What is left is a flat list, which is the shape that survives a
 * list Spool does not own.
 *
 * **Effort belongs to the model, and now says so.** Each entry carries
 * `supportedEffortLevels`; `haiku` carries none, so select it and the effort row
 * is not greyed but gone. Hover a level for the CLI's own sentence — `max` warns
 * you off itself: *May use excessive tokens resulting in long response times or
 * overthinking. Use sparingly for the hardest tasks.* Spool did not write that
 * and should not have to. (`auto` is the one gap in the data: `/effort auto` is
 * accepted, no model lists it, so it stays reachable by typing and out of the
 * control.)
 *
 * **The one thing here that is not in the reply is the rule across the log.** A
 * click leaves no trace, and a transcript spanning two models while saying so
 * nowhere is a lie about who said what, so the switch draws itself into the log
 * where it took effect. That is the whole cost of a button over a typed command:
 * the command was already its own record.
 *
 * Typing still works, because the menu is a shortcut for the message and never a
 * second source of truth. `/model haiku` and a click on `Haiku` are the same
 * message to the same binary; one leaves a rule and one leaves a reply. The
 * readout follows the reply either way, which is what keeps it from ever being
 * wrong — the frame to the right is what happens when a control believes itself
 * instead.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayModelMenuFrame() {
	const capture = captureEvents(claudeTurnCapture);
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
						model={<ModelMenu state={deck.state} models={deck.models} onPick={deck.pick} />}
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
