import { useMemo } from "react";
import { graceCues, useLimit } from "shared/lib/spool/agent-limit";
import { CAPTURED, useModel } from "shared/lib/spool/agent-model";
import { railEntries, useCapture, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { LimitLine } from "shared/ui/spool/limit";
import { ModelMenu } from "shared/ui/spool/model-control";
import { PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * agent-play--limit-stop — running out in the middle of a session, which is the
 * state the whole ticket is actually about.
 *
 * The frame to the left is what is true right now. This is the moment it stops
 * being true, and the two are one design at two moments rather than two designs.
 *
 * **Reaching the limit is not a wall. It is a wind-down.** The installed binary
 * carries this string and injects it into the running conversation:
 *
 *   [Usage limit reached — grace window active. Wrap up: finish or checkpoint;
 *    don't start subagents or long work.]
 *
 * with `anthropic-ratelimit-unified-grace-status`, a per-claim
 * `-grace-5h-utilization` / `-grace-7d-utilization`, and `rateLimitGraceActive`
 * on the same parsed info the stream carries. So the agent is *told*, in the
 * conversation, to land what it is holding and start nothing new.
 *
 * Play it. The turn runs, the plan is written, and then the window closes. What
 * happens next is the whole argument for drawing this at all:
 *
 *   the rows in flight finish     the grace instruction is "finish or
 *                                 checkpoint", so a call that had already started
 *                                 keeps its cues and lands
 *   nothing new starts            the delegation the agent announced never
 *                                 happens, and neither does anything after it
 *   the line says why             one rule across the log, and the readout in the
 *                                 footer goes from `weekly limit 93%` to `weekly
 *                                 limit hit`
 *
 * **Without that line this reads as the agent losing the thread.** It says it
 * will delegate the copy pass and start building in parallel, and then it does
 * not, and there is nothing anywhere to explain it. That silence is the failure
 * mode the ticket is chasing, and it is not the empty screen everyone pictures.
 * It is a turn that half happened.
 *
 * Send again and it takes a second and a half before anything comes back. That
 * beat has to be there: nothing local knows the window is still shut, because a
 * limit resets on a clock nobody here is holding, so the only way to find out is
 * to ask. 1569 ms is the measured median `ttft_ms` across the parent capture, so
 * the refusal arrives when the first token would have. A composer that refused
 * instantly would be Spool guessing on the agent's behalf, and it would guess
 * wrong on the one morning the window has just reopened.
 *
 * **The refusal reads in the log and the standing fact reads in the footer, and
 * that split is #117's test applied twice.** A weekly window outlives every call
 * that made it, so it is a readout. Running out *on this turn* is one moment and
 * belongs where the turn is, because "why did nothing happen" is a question about
 * the reply that never came, and the eye is already there.
 *
 * Nothing here is coloured. There is one accent in this product and it means a
 * chip and a box out on the canvas are the same object; spending it on an error
 * would break the only thing it says. The refusal steps forward in brightness,
 * which is what the rest of the rail already does.
 *
 * **The one state on this page that is drawn rather than captured, and it says
 * so.** Neither parent capture holds a `rejected` event, because reaching one
 * costs a week's allowance to take a screenshot. Its shape is not invented:
 * `rejected` is one of three values the binary's header parser produces, `429`
 * and `"type":"rate_limit_error"` are what it watches for on the wire, and every
 * sentence on screen is its own string. The window and the reset are the
 * capture's.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

/**
 * The row the window closes on: the plan is written, and the work it planned
 * never starts. Chosen by position rather than by a time, so it stays true if the
 * capture is resliced.
 */
const CLOSES_ON = 2;

export default function AgentPlayLimitStopFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "plan");

	const closing = script.rows[CLOSES_ON];
	const closesAt = closing === undefined ? null : (script.cues.find((cue) => cue.name === closing.cue)?.at ?? null);
	// the cue list is identity-compared by the turn's effect, so a fresh array per
	// render would clear and restart every timer and nothing would ever land
	const cues = useMemo(() => {
		if (closesAt === null) return script.cues;
		return graceCues(script.cues, closesAt, script.rows.slice(0, CLOSES_ON).map((row) => row.key));
	}, [script, closesAt]);

	const turn = useTurn(cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = cues.length > 0;
	const deck = useModel(CAPTURED, turn.run);
	const limit = useLimit(turn.run, closesAt);

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
