import { QUEUE_SEED, useQueue } from "shared/lib/explore/agent/agent-queue";
import { LIVE_ASK, useAutoAsk } from "shared/lib/spool/agent-threads";
import { railEntries, useCapture, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * agent-play--queue-box — the queue never leaves the composer (#176).
 *
 * Same turn and the same two messages, stacked inside the box you type in rather
 * than anywhere in the rail. Type a third and press Enter and it joins the stack
 * directly above your cursor; hover one and take it back; leave it and the stack
 * empties into the log as the turn ends.
 *
 * **This is the reading the first two placements do not offer.** `--queue-tail` and
 * `--queue-band` disagree about *where in the transcript's world* a queued message
 * belongs, and they agree on the premise that it belongs there at all. It does not
 * have to. The log is where things that have happened live; the composer is where
 * your words live before they go. A message you have committed but not sent has not
 * happened, so on that reading it never left the second surface, and the question
 * "how does a not-yet-receipt survive in a log of receipts" simply does not arise.
 *
 * **Three things stop being rules and become geometry.**
 *
 * Firing is the send it already is: the stack leaves this box and lands in the log,
 * which is the journey every message in the transcript already made, so there is
 * nothing new to read. The band's teleport is the same motion without the prior
 * meaning.
 *
 * Take-back is a drop rather than a jump. #170 settled one invariant covering both
 * exits — *words that leave the queue un-fired land back in the box* — and here the
 * box is eighteen pixels below the row, so the invariant is drawn rather than
 * stated. It also makes the ticket's second question nearly answer itself: the row
 * is sitting on the field it returns to.
 *
 * And the stack is what fires together. #170 settled that every queued message goes
 * down stdin at once and **the binary runs one turn over all of them** — one turn,
 * not one per message. A stack in a single box says that; a run of separate rows in
 * the log says the opposite, and the tail says it most strongly of all by putting
 * each row on the 14px gap that means *turn boundary*.
 *
 * **What it costs is room, and the log pays.** The composer grows upward, so a queue
 * of six is six rows the transcript does not have. It caps at the band's own 164px
 * and scrolls inside itself, which means the placement that promised to keep your
 * words on screen can hide them too — just inside its own box rather than off the
 * bottom of the log. **The second cost is a blurred surface**: the composer was the
 * one place unambiguously yours to write in, and it now holds things you have
 * already committed to sending. The dim and the `queued` marker are carrying that,
 * the same distinction they carry in the other three, but here they carry it against
 * a live cursor rather than against a log.
 *
 * **The chips are the open question this placement asks loudest.** #170 settled that
 * a queued message carries the `<selection>` block from its own Enter, and #116 that
 * the chips are the visible promise of what rides with it — but the queued row shows
 * `queued` where a fired row shows its `context`, so in every placement here the
 * thing you approved at Enter is invisible for the whole wait. In this one the
 * composer's own `SelectionStrip` is nine pixels below, drawing exactly that promise
 * for the message you are typing now, which makes its absence on the rows above the
 * hardest to defend.
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

export default function AgentQueueBoxFrame() {
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
						queue="box"
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
