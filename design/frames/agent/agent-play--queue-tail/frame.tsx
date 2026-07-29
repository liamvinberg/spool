import { QUEUE_SEED, useQueue } from "../../../shared/lib/agent-queue";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--queue-tail — the queue at the end of the log (#176).
 *
 * The turn sends itself on boot with two messages of yours already waiting on it.
 * Type a third and press Enter — the composer has stopped refusing. Hover one and
 * take it back. Leave it alone and the turn ends, at which point the queue goes out.
 *
 * **What is already settled and is not this frame's to move.** The composer accepts a
 * message while a turn is running and Enter queues it rather than dropping it; a
 * second Enter queues a second, so it is a list; Spool holds that list rather than
 * the binary, and it fires in order the moment the running turn ends. A queued
 * message has not happened, so it must not read as a receipt: it is your own words,
 * dimmed, with a lowercase mono `queued` under it and a ✕ to take it back.
 *
 * **The queue is the tail of the transcript**, under the live edge, in the order it
 * will go out. That spot is not near where the receipt will land, it *is* where the
 * receipt lands: the row is already in the log, already in the developer's own 2px
 * accent rail, already sitting on the 14px `gapBefore` gives a turn boundary. So
 * firing is an undim in place. Nothing enters, nothing leaves, nothing above it
 * moves, and the interface never has to explain that the thing you were looking at
 * over there is now this thing over here. That is the claim, and this frame now
 * plays it: the turn runs to its end rather than parking forever, so the rows are on
 * screen before and after the moment that is supposed to cost nothing.
 *
 * **What it costs is the log's one rule.** `railEntries` is past tense end to end —
 * a call that ran, a sentence that arrived, an answer that was given — and #145 had
 * to argue a fifth entry kind into existence for a question because it was "the one
 * thing in the log that has not happened yet". This puts a second one there, and
 * unlike the question it is not the agent's and not on the agent's clock. The dim is
 * carrying that whole distinction, and the siblings are the argument that it should
 * not have to.
 *
 * **The transcript scrolls, so the queue scrolls with it.** Read back thirty rows
 * while a long turn runs and what you have queued is off the bottom of the screen
 * with no mark saying so. That is the honest second cost and it is the band's whole
 * case; against it, the scroll is *already* pinned to the live end and the queue
 * rides the same pin, so it is off screen exactly when the live edge is, which is
 * when you have chosen to be reading something else.
 *
 * **Where the second thing you said goes is not a question here.** Two queued
 * messages are two rows in the order they fire, because that is what they will be
 * when they fire. #135's run-collapsing is the opposite case and does not apply —
 * those are one verb repeated on one frame by the machine, and these are two
 * different things a person decided to say.
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

export default function AgentQueueTailFrame() {
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	// the turn asks itself, because a queue with nothing running is not a queue
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
						queue="tail"
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
