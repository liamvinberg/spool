import { CAPTURED, useModel } from "../../../shared/lib/agent-model";
import { useLimit } from "../../../shared/lib/agent-limit";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { LimitLine } from "../../../shared/ui/spool-limit";
import { ModelMenu } from "../../../shared/ui/spool-model-control";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--limit-line — the window sits beside the model, and nowhere else.
 *
 * One clause is added to the footer's eighteen pixels and nothing else on screen
 * changes: `Opus (1M context) · high   weekly limit 92% · resets wed`.
 *
 * Play it. The readout is already there when the frame loads, because the fact
 * arrived on the message before this one and will still be true tomorrow. Send,
 * and four seconds in it moves to 93% — which is the entire animation, and the
 * honest one: four events landed across thirteen minutes of the capture and the
 * number moved by a single point.
 *
 * Three things the captures settled, which are why this is a line and not a
 * panel:
 *
 *   the window is chosen    `rate_limit_event` carries one `rateLimitType` out of
 *                           six the binary can name, picked upstream by the API's
 *                           representative claim and then by a threshold that
 *                           weighs utilisation against how much of the window is
 *                           left. There is nothing here to average or rank.
 *   the number is optional  at `status: "allowed"` there is no `utilization` in
 *                           the payload at all — four events in the fan-out
 *                           capture, every one a bare status and reset. So there
 *                           is no gauge to draw and no threshold to choose: the
 *                           event's existence is the threshold, and the binary
 *                           ships the one it used, 0.75.
 *   the remedy is adjacent  the CLI's own subline is `try /model sonnet · ~2×
 *                           runway`, and at refusal `Switch models to keep
 *                           working.` Its composer has nothing to point at. This
 *                           one has the menu from #118 sitting eight pixels
 *                           left, so the advice is a control instead of a
 *                           sentence, and the frame ships the menu open-able for
 *                           exactly that reason.
 *
 * What it gives up is that a developer who has never seen it can miss it, and
 * that is the whole case against — the frame to the right takes the opposite
 * position. What it gives back is that it can never become chrome. Below the
 * threshold there is no line, because below the threshold the payload has nothing
 * in it, so the surface that says "you are running out" is only ever on screen
 * when you are.
 *
 * Nothing is said about overage, and that is a position rather than an omission.
 * `isUsingOverage`, `overageStatus` and `overageDisabledReason` are billing and
 * org policy — the fan-out capture carries `org_level_disabled` — and Spool has
 * no billing relationship to narrate it from. It is also moot: if overage is on,
 * the limit is not stopping you, so there is nothing to warn about.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayLimitLineFrame() {
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
