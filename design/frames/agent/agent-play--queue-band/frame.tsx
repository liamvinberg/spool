import { QUEUE_SEED, useQueue } from "../../../shared/lib/agent-queue";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--queue-band — the same queue, in a place of its own (#176).
 *
 * Same turn, same two messages, same rows. The one difference is that they stand
 * between the log and the composer rather than inside the log, on a strip that does
 * not scroll. Type a third and press Enter; hover one and take it back; leave it and
 * watch what firing looks like from here.
 *
 * **The transcript stays receipts-only, which is the whole case.** Every entry
 * `railEntries` builds is past tense — a call that ran, a sentence that arrived, an
 * answer that was given — and #145 had to argue a fifth entry kind into existence for
 * a question precisely because it was "the one thing in the log that has not happened
 * yet". Putting the queue in the log puts a second such thing there, and unlike the
 * question it is not the agent's, not on the agent's clock, and can be taken back.
 * A band keeps the log's one rule intact and asks the dim to carry nothing.
 *
 * **It is on screen when the log is not.** The band is fixed, so scrolling back
 * thirty rows to check what the agent did with `tokens.css` does not take what you
 * have queued off the bottom of the screen with it. That is the state the tail
 * variant cannot hold, and it is not exotic: a turn long enough to be worth queueing
 * against is a turn long enough to read back through.
 *
 * **What it costs is the teleport, and this frame now shows it rather than
 * describing it.** A row here is *not* where its receipt lands. When the turn ends
 * the message leaves this strip and reappears in the log with the rail's undimmed
 * user row, so firing is a disappear and an appear rather than an undim in place.
 * Two rows firing in order is that twice, and the band collapses out from under them
 * as the last one goes. Whether that reads as the message moving or as two different
 * objects is the thing to watch with all four frames open.
 *
 * **It also spends the rail's last free surface.** #117's shelf above the transcript
 * already has three claimants — the plan, the rate limit, the login — and this takes
 * the matching strip below, which nothing else has claimed and which sits between the
 * two things a developer looks at most. It has to be worth that, and it is only worth
 * it if the log's purity is worth it.
 *
 * **It is unlabelled on purpose.** `PlanStrip` and `EstateStrip` both open with a
 * mono word and a count, and a band could easily do the same — but the rows already
 * say `queued`, once each, and a strip that says `queued 2` over two rows that each
 * say `queued` is the interface repeating itself three times. The rule at the top and
 * the composer's own rule under it are what make it a place; the words are the rows'.
 * `--queue-strip` is what happens when the label wins instead.
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

export default function AgentQueueBandFrame() {
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
						queue="band"
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
