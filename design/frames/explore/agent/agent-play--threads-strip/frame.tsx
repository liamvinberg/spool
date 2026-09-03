import { LIVE_ASK, useAutoAsk, useDeck } from "shared/lib/spool/agent-threads";
import { railEntries, captureEvents, useTurnScript } from "shared/lib/explore/agent/claude-turn";
import { useTicker, useTurn } from "shared/lib/spool/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { PlayField } from "shared/ui/explore/agent/play-field";
import { PlayRail } from "shared/ui/spool/play-rail";
import { SpoolShell } from "shared/ui/spool/shell";
import { ThreadStrip } from "shared/ui/spool/thread-strip";
import claudeTurnCapture from "shared/captures/claude-turn.json";

/**
 * agent-play--threads-strip — every conversation on screen at once, and the room
 * that costs.
 *
 * A copy of agent-play with one row added between the tabs and the log. Four
 * threads: the one streaming in front of you on `app`, three designers still
 * working on `takes`, one that finished on `site` twenty-two minutes ago that
 * nobody has read, and an hour-old copy deck that has been. Click any of them and
 * the transcript is theirs; type into one and the message goes there, which sets
 * it running.
 *
 * The live thread sends itself on boot, because a frame about threads you are not
 * watching has to also show the one you are.
 *
 * The bet. Nothing is behind anything. A thread finishing while you are on another
 * page changes a mark you are already looking at, and switching costs one click
 * with no intermediate surface, which is the fastest any of these three can be.
 *
 * The cost, and it is drawn rather than argued. A thread's only name is what the
 * human asked, and asks are sentences. At 420 the row holds three names at ninety
 * six pixels each before it starts scrolling, and ninety six pixels is nine
 * characters of mono: `three take`, `shoot home`. The fourth is under the fade on
 * the right. So the strip is honest about how many threads it can carry, and the
 * answer is three.
 *
 * Two things it cannot say, both of which the list in the next frame can. Which
 * page a thread belongs to is nowhere in the row, so switching to `takes` puts a
 * transcript about `cart--empty-b` next to a canvas showing `cart`, `menu` and
 * `receipt`, and nothing on screen explains the mismatch. And a running thread's
 * live step has no room at all: the mark says something is happening and the row
 * has no width left to say what.
 *
 * The mark is the whole vocabulary. It turns while a thread works, settles to a
 * solid dot when it has finished unread, and is nothing once it has been read. No
 * colour, because state in this rail has been motion since the first frame and the
 * one accent belongs to the selection.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

export default function AgentThreadsStripFrame() {
	const capture = captureEvents(claudeTurnCapture);
	const script = useTurnScript(capture, "plan");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, LIVE_ASK);

	const deck = useDeck(railEntries(script, turn, elapsed), turn);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={deck.open.entries}
						header={
							<ThreadStrip threads={deck.threads} open={deck.open.id} onOpen={deck.setOpen} />
						}
						phase={deck.phase}
						run={deck.run}
						onSend={ready ? deck.send : () => {}}
						onReplay={deck.replay}
					/>
				}
			>
				<PlayField />
			</CanvasChrome>
		</SpoolShell>
	);
}
