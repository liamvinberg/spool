import { useState } from "react";
import { useAutoAsk } from "../../../shared/lib/agent-threads";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type BaseFrame, PlayField } from "../../../shared/ui/spool-play-field";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--jump-gone — the transcript outlived the frame, and says so.
 *
 * The same thread as `agent-play--jump-name`, restored after a restart
 * ([#120](https://github.com/liamvinberg/spool/issues/120) keeps a stored picture
 * of the rail in `~/.spool/`), and `home` has been deleted since. It arrives
 * already there rather than waiting to be typed into, because a restored thread is
 * something you find, not something you start — the same reason the threads frames
 * send themselves.
 *
 * Every row still names `home` and not one of them is a place to go. The name is
 * struck through and dimmed and the rest of the row is untouched, so the chevron
 * still opens the path it always held. Hovering does nothing, because there is
 * nothing anywhere to light: no frame on any page, and no page holding it.
 *
 * **The words are already the product's.** `inspector.tsx:563` disables a
 * connection row whose destination nothing answers to, strikes the name and prints
 * `missing` beside it, under the comment *"a destination no frame answers to is
 * real information, not a place to go"*. This is that, one rail over. What it does
 * not copy is the trailing `missing`: a connections row is a list of destinations
 * and needs to say which one is broken, while a log row is a receipt for something
 * that did happen — the strike says the frame is gone, and adding a word would
 * read as the call having failed, which it did not.
 *
 * **Nothing is removed and nothing is renumbered.** `edit home ×6` still says six,
 * because six edits happened. The log is a record of a session, and a frame
 * deleted afterwards does not unhappen it — which is also why the rows stay `done`
 * rather than going grey: the state mark is about the call.
 *
 * **Why the rail cannot work this out on its own.** Absent from the project covers
 * two states that look identical from in here and read as opposites: a frame the
 * turn is one beat from writing, and a frame nothing will bring back. Only the
 * second is struck, so `gone` is a list the rail is handed rather than a guess it
 * makes from what is missing.
 *
 * A run row is where this lands hardest and it lands the same: one name, one
 * strike, one count that still stands.
 */

const APP: readonly BaseFrame[] = [
	{ name: "cart", screen: "cart" },
	{ name: "menu", screen: "menu" },
	{ name: "receipt", screen: "receipt" },
];

/** the ask this thread was started with, still in the composer's record of it */
const ASK = "tighten the spacing on home and re-shoot it";

export default function AgentPlayJumpGoneFrame() {
	const capture = useCapture("claude-edits");
	const script = useTurnScript(capture, "session", "run");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	useAutoAsk(ready, turn.send, ASK);

	const [pointed, setPointed] = useState<string | null>(null);

	// `site` is still a page and it is empty now, which is the whole of what the
	// project has to say about the frame this transcript is about
	const pages: readonly PageRow[] = [
		{ name: "app", frames: APP.map((frame) => frame.name), active: true, open: true },
		{ name: "takes", frames: ["cart--empty", "cart--empty-b", "cart--empty-c"] },
		{ name: "site", frames: [] },
	];

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed)}
						phase={turn.phase}
						jump="name"
						have={APP.map((frame) => frame.name)}
						gone={["home"]}
						pointed={pointed}
						onPoint={setPointed}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField base={APP} pointed={pointed} />
			</CanvasChrome>
		</SpoolShell>
	);
}
