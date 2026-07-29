import { QUEUE_SEED, useQueue } from "../../../shared/lib/agent-queue";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--queue-back — taking one back into a box that is not empty (#176).
 *
 * The placement is settled and this frame is the winner's: the queue lives in the
 * composer. What is under test here is the other half of the ticket — the gesture
 * that retracts a queued message, and what its words do to a half-written one.
 *
 * The frame opens mid-sentence. `make the header sticky and give the` is in the
 * field, two messages are waiting above it, and a turn is running. Hover the first
 * queued row and press its ✕: the row leaves the stack and its words land in the
 * field, above what you were typing, with a blank line between them.
 *
 * **The gesture had two candidates and #170 killed one of them without meaning to.**
 * [#143](https://github.com/liamvinberg/spool/issues/143) split a row's click once
 * already — the text does one thing, the ✕ another — and the ticket asked whether a
 * queued row should split the same way, text taking the message back into the
 * composer and ✕ deleting it outright. It cannot, because there is nothing to split:
 * #170 settled **one** invariant covering both exits, *words that leave the queue
 * un-fired land back in the box*, so deleting outright is not an outcome the model
 * has. A split click needs two destinations and this row has one. So the ✕ stands
 * alone, in the list-entry vocabulary #170 named — the chips' and the thread tabs',
 * never [#162](https://github.com/liamvinberg/spool/issues/162)'s dismiss, which
 * refuses the agent's question and sends a real `{behavior:"deny"}` down the wire.
 * This sends nothing anywhere; spool shortens its own list.
 *
 * **What is left of the gesture question is smaller and is answered by the
 * placement.** With one destination, the whole row could have been the target — press
 * anywhere and it drops into the field. It stays a ✕ because the row is two lines of
 * your own prose and a pressable paragraph is a paragraph you cannot select a word
 * of; and because in this placement the row is *inside the composer*, where every
 * other press already means put the caret here.
 *
 * **The merge goes above, and that is not taste.** The queue's order is the order
 * these were going to be said in, so appending under the draft would reverse a
 * message against the one being written. And the caret is mid-word: anything landing
 * below it moves the text the hand is on, while anything landing above leaves the
 * tail of the box exactly where it was. Both point the same way, which is also the
 * lean #170 wrote down.
 *
 * **The blank line is doing real work.** Two messages that come back become one blob
 * of text in one field, so a stop that hands back two and an Enter that follows sends
 * **one** message where two were queued. That is not a loss of meaning — #170 settled
 * that the queue fires into one turn anyway — but it is the one place in the round
 * trip that is not reversible, and the blank line is what leaves the seam visible
 * enough to split by hand.
 *
 * **What comes back is the words and not the selection.** A queued message carries
 * the `<selection>` block from its own Enter (#170), and taking it back drops the
 * text into a composer whose chips are whatever the hands are pointing at *now*. So
 * the round trip can silently re-aim a message: retract `make this red` while
 * pointing at a different frame and *this* has moved. It is drawn as it is because
 * the alternative — restoring the old selection on the canvas — reaches out of the
 * rail and moves the world to undo a typing decision, which is worse. But it is the
 * sharpest form of the chips question this ticket leaves open.
 *
 * The capture is `claude-plan.json`, the same window the four placements play.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

/**
 * Cut off mid-clause on purpose: the merge is only a question when there is a caret
 * sitting in an unfinished sentence, and a tidy draft would answer an easier one.
 */
const WRITING = "make the header sticky and give the";

export default function AgentQueueBackFrame() {
	const capture = useCapture("claude-plan");
	const script = useTurnScript(capture, "session");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, LIVE_ASK);
	const held = useQueue(QUEUE_SEED, turn.phase, WRITING);

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
						queue="box"
						queued={held.queued}
						onQueue={held.queue}
						onUnqueue={held.unqueue}
						draft={held.draft}
						onDraft={held.setDraft}
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
