import { QUEUE_SEED, useQueue } from "../../../shared/lib/agent-queue";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--queue-strip — the queue as one line (#176).
 *
 * The band's slot, collapsed to the thing the rail already says three other ways:
 * a mono word, a count, a chevron. Press it to see what you queued and to take one
 * back. Everything else is the siblings'.
 *
 * **It is here because the rail's own rule points at it.** #117 settled that a thing
 * earns its own place only if it outlives the call that made it, which is why a plan
 * is lifted out of the log and a screenshot is not. A queued message outlives
 * nothing — its whole life is the remainder of one turn, the shortest life of
 * anything this rail draws — so the strictest reading of the rule Spool already
 * follows gives it a line rather than a column. `PlanStrip` and `EstateStrip` are
 * that line, twice, and this is the third.
 *
 * **It is also drawn to lose, and to lose by being looked at rather than by never
 * being tried.** What it hides is the exact thing the queue was built to protect.
 * #170 chose a queue over a swallowed keystroke because *losing written words is the
 * failure mode*, and `queued 2` has lost them from the screen if not from the list —
 * you are told the count of things you cannot read. Every other placement answers
 * "what did I line up" by existing; this one answers it with a click.
 *
 * **And it makes the ticket's second question worse before it is asked.** Taking a
 * message back needs the list open first, so the gesture has to be aimed through a
 * disclosure — one press to see, one to choose, one to remove. The ✕ and the split
 * click are both cheaper everywhere else.
 *
 * **What it buys is the one thing the others cannot.** It costs 34 pixels whether
 * you have queued one message or nine, so it is the only placement whose cost does
 * not grow with the queue, and the only one that cannot push the transcript around
 * while you are reading it.
 *
 * The capture is `claude-plan.json`, the only window in the repo where a plan is
 * written, worked and ticked off — nine and a half real minutes, so the log fills and
 * scrolls and the queue waits the way it would in the product. The first pair of
 * frames used `claude-turn.json`'s eight-second plan window, which is why neither
 * could show what a placement does under a transcript long enough to read back.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentQueueStripFrame() {
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, LIVE_ASK);
	const held = useQueue(QUEUE_SEED, turn.phase);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={[...railEntries(script, turn, elapsed), ...held.fired]}
						phase={turn.phase}
						queue="strip"
						queued={held.queued}
						onQueue={held.queue}
						onUnqueue={held.unqueue}
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
