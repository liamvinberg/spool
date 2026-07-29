import { useRef, useState } from "react";
import { LIVE_ASK, useAutoAsk } from "../../../shared/lib/agent-threads";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail, type Queued } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--queue-tail — the queue at the end of the log (#170).
 *
 * The turn sends itself on boot and parks four tasks into writing the plan, so what
 * is on screen is a turn in flight: one row done, a ring turning on a list that is
 * still being written, and two messages of yours standing under it. Type a third and
 * press Enter — the composer has stopped refusing. Hover one and take it back.
 *
 * **What is already settled and is not this frame's to move.** The composer accepts a
 * message while a turn is running and Enter queues it rather than dropping it; a
 * second Enter queues a second, so it is a list; Spool holds that list rather than
 * the binary, and it fires in order the moment the running turn ends. A queued
 * message has not happened, so it must not read as a receipt: it is your own words,
 * dimmed, with a lowercase mono `queued` under it and a ✕ to take it back.
 *
 * **The one thing left is where the row stands, and this is the answer that costs
 * nothing to fire.** The queue is the tail of the transcript, under the live edge,
 * in the order it will go out. That spot is not near where the receipt will land, it
 * *is* where the receipt lands: the row is already in the log, already in the
 * developer's own 2px accent rail, already sitting on the 14px `gapBefore` gives a
 * turn boundary. So firing is an undim in place. Nothing enters, nothing leaves,
 * nothing above it moves, and the interface never has to explain that the thing you
 * were looking at over there is now this thing over here.
 *
 * **What it costs is the log's one rule.** `railEntries` is past tense end to end —
 * a call that ran, a sentence that arrived, an answer that was given — and #145 had
 * to argue a fifth entry kind into existence for a question because it was "the one
 * thing in the log that has not happened yet". This puts a second one there, and
 * unlike the question it is not the agent's and not on the agent's clock. The dim is
 * carrying that whole distinction, and the sibling frame is the argument that it
 * should not have to.
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
 * The capture is `claude-turn.json`'s plan window, `agent-play`'s own. It is parked
 * rather than played out because the state this frame is about is the running one,
 * and a turn that settles takes the queue with it.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

/**
 * What you say to a turn you are not going to interrupt for it.
 *
 * Both are follow-ups to the plan being written on screen: the capture's agent is
 * about to build a Swedish habit tracker across `home`, `habit-detail` and
 * `add-habit`, and neither of these is worth an `interrupt` — the first reorders work
 * that has not started, the second is a detail the copy pass will want. That is the
 * case for a queue in one line: the alternative to holding them is stopping the turn.
 */
const SEED: readonly Queued[] = [
	{ id: "order", text: "hold off on add-habit until i've seen home" },
	{ id: "chips", text: "swedish weekday chips on the week strip, not mon tue wed" },
];

export default function AgentQueueTailFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "plan");
	// the clearest mid-flight beat this capture has: `skill scenarios` settled above,
	// and the plan four of its seven tasks in with the ring still turning. The turn
	// parks there and stays, because the state being drawn is the running one
	const plan = script.rows.find((row) => row.kind === "tool" && row.counts);
	const turn = useTurn(script.cues, plan?.kind === "tool" ? plan.children[3]?.cue : undefined);
	const elapsed = useTicker(turn.run, script.total, turn.waiting);
	const ready = script.cues.length > 0;
	// the turn asks itself, because a queue with nothing running is not a queue
	useAutoAsk(ready, turn.send, LIVE_ASK);

	// interface state and not turn state: Spool holds the queue, so the only thing that
	// can name a message is the thing that took it. The counter is why — two identical
	// messages are a real thing to type twice, and the ✕ has to reach exactly one
	const [queued, setQueued] = useState<readonly Queued[]>(SEED);
	const taken = useRef(0);
	const queue = (text: string) => {
		taken.current += 1;
		const id = `said${taken.current}`;
		setQueued((waiting) => [...waiting, { id, text }]);
	};
	const unqueue = (id: string) => setQueued((waiting) => waiting.filter((message) => message.id !== id));

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						queue="tail"
						queued={queued}
						onQueue={queue}
						onUnqueue={unqueue}
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
