import { useLimit } from "../../../shared/lib/agent-limit";
import { CAPTURED, useModel } from "../../../shared/lib/agent-model";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { LimitLine } from "../../../shared/ui/spool-limit";
import { ModelMenu } from "../../../shared/ui/spool-model-control";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--limit-stop — the refusal, which is the state the whole ticket is
 * actually about.
 *
 * Send once and the turn plays normally, and then it runs out: `You've hit your
 * weekly limit · resets wed` draws across the log with the binary's own
 * subline under it, and the footer readout steps forward from `weekly limit 93%`
 * to `weekly limit hit`. Send again and nothing happens for a second and a
 * half, and then the same line lands under your own words.
 *
 * That second and a half is the point of the frame. Nothing local knows the
 * window is still shut — a limit resets on a clock nobody here is holding — so
 * the only way to find out is to ask, and the refusal comes back on the beat the
 * first token would have. 1569 ms, the median `ttft_ms` across the parent
 * capture. A composer that refused instantly would be Spool guessing on the
 * agent's behalf and eventually guessing wrong, on the one day the window has
 * just reopened.
 *
 * **The refusal reads in the log, and the standing fact reads in the footer, and
 * they are two different things.** #117's test is whether a thing outlives the
 * call that made it. A weekly window outlives everything, so it is a readout.
 * Running out *on this turn* is one moment and belongs where the turn is — it is
 * the answer to "why did nothing happen", and that question is about this turn,
 * not about the week. A footer clause cannot answer it, because the eye is where
 * the reply should have been.
 *
 * Nothing here is coloured. There is one accent in this product and it means a
 * chip and a box out on the canvas are the same object; spending it on an error
 * would break the only thing it says. The refusal steps forward in brightness
 * instead, which is what the rest of the rail already does.
 *
 * **This is the one state on the page that is drawn rather than captured, and it
 * says so.** Neither parent capture contains a `rejected` event, because reaching
 * one costs a week's allowance to take a screenshot. What is not invented is its
 * shape: `rejected` is one of the three values the installed binary's header
 * parser produces, and `You've hit your ${label}` and `Switch models to keep
 * working.` are its own strings for that state, read out of the binary rather
 * than written here. The window and the reset are the capture's.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayLimitStopFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "plan");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	const deck = useModel(CAPTURED, turn.run);
	const limit = useLimit(turn.run, true);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={[...deck.before, ...railEntries(script, turn, elapsed), ...deck.after, ...limit.notes]}
						phase={turn.phase}
						model={
							<span className="flex min-w-0 items-center gap-2.5">
								<ModelMenu state={deck.state} models={deck.models} pin={deck.pin} onPick={deck.pick} />
								<LimitLine info={limit.info} />
							</span>
						}
						run={turn.run}
						onSend={
							ready
								? (text) => {
										if (limit.say(text)) return;
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
