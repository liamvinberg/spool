import { LIVE_ASK, useAutoAsk, useDeck } from "../../../shared/lib/agent-threads";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";
import { ThreadHeader } from "./menu";

/**
 * agent-play--threads-menu — one line at rest, and a list you go to.
 *
 * The same four threads as the frame to the left, reached the other way. The rail
 * keeps one line: the name of the thread you are in, then the state of everything
 * you are not looking at compressed into two marks, then how many there are. Click
 * it and the list comes down over the log. It boots open, because the list is what
 * this frame is asking you to judge; click anywhere to shut it and the resting
 * state is what is left.
 *
 * The bet. A thread has four facts and only one of them fits in a tab. Given a
 * list, all four fit and nothing is truncated to nine characters: the ask, the
 * page it belongs to, when it last moved, and the line it is on. `takes · now ·
 * write cart--empty-b` answers where a conversation is without opening it, which
 * is the question you actually have about a thread running somewhere else. Adding
 * a fifth thread costs nothing here, and the tab strip has already run out of
 * room at four.
 *
 * The cost. Switching is now two clicks and a surface in between, and the surface
 * covers the thing you were reading. Worse, at rest the rail tells you only that
 * something is happening, never what: the two marks by the count are a ring and a
 * dot, and finding out which thread they belong to is the click. So this trades a
 * strip that is always slightly wrong for a line that is always slightly vague.
 *
 * The header line obeys the same rule the plan strip does. One line, a count, and
 * the list is not the resting state.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
	{ name: "site", frames: ["home"] },
];

export default function AgentThreadsMenuFrame() {
	const capture = useCapture("claude-turn");
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
							<ThreadHeader threads={deck.threads} open={deck.open.id} onOpen={deck.setOpen} listed={true} />
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
