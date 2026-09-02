import { useState } from "react";
import { contextLine } from "shared/lib/agent-selection";
import { railEntries, useCapture, useTurnScript } from "shared/lib/claude-turn";
import { enteredFrame } from "shared/lib/pointed-fixtures";
import { useTicker, useTurn } from "shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "shared/ui/spool-canvas-chrome";
import { type Outline, PlayField } from "shared/ui/spool-play-field";
import { COMPOSER_W, PlayRail } from "shared/ui/spool-play-rail";
import { SpoolShell } from "shared/ui/spool-shell";

/**
 * agent-play--entered — the recommendation. The same chip, minus the ✕.
 *
 * You are inside `cart`. You did not put it in the composer; stepping into a
 * frame did, because `canvas.tsx:820` serves the entered frame when nothing is
 * picked and nothing is selected. So the chip is there, and the question this
 * row of four asks is what it should look like.
 *
 * **It has to be drawn at all.** Whatever the strip says is what the `<selection>`
 * block carries, and #116 fixed that as the promise: a turn nobody can audit is a
 * turn nobody can trust. Leaving the chip out while the prompt still names the
 * frame is the one failure the strip exists to prevent — and it costs more since
 * #121, because a write under `design/` never asks, so the frame in this chip is
 * the frame that gets edited without a prompt.
 *
 * **It must not read weaker.** Entering is the strongest thing you can say about
 * what you mean. You are not near the frame, you are in it, and the canvas agrees
 * with the rail: `overlays.tsx:108` puts entered in the same ring list as
 * selected, and the label swaps its name for a filled `live · esc exits`. A faded
 * chip would hedge about the one act on the canvas that is not a guess. The frame
 * to the right draws the hedge so it can be compared rather than argued.
 *
 * **The ✕ goes, because it has nowhere to land.** Every other chip's ✕ deselects
 * out on the canvas — one state, not two. The entered frame's only canvas-side
 * retraction is esc, and esc is a mode change, not a removal: it hands the
 * keyboard back, stops the frame owning its own presses, and ends the walk you
 * were in the middle of. That is a large lever to hang off an 8px glyph in the
 * composer. Nor is there anything else the ✕ could mean, because the strip cannot
 * empty while you are inside: the daemon serves the entered frame unconditionally.
 *
 * Nothing is lost by dropping it. There is no state where this chip has a
 * neighbour to be told apart from — a pick outranks it, a canvas selection
 * outranks it, and any press outside the frame has already left it — so the ✕
 * would only ever be a second, smaller esc, sitting further from the hands.
 *
 * Playable both ways: press esc and watch the chip go with the badge, then
 * double-click any frame to step into it and watch the chip come back naming
 * that one. Send a turn while inside and the record under your words says `cart`,
 * because the strip is the promise and the transcript is the receipt.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayEnteredFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "plan");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	const [inside, setInside] = useState<string | null>("cart");
	const [lit, setLit] = useState<string | null>(null);
	const held = enteredFrame(inside);
	const outlines: readonly Outline[] = held.map((entry) => ({ id: entry.id, frame: entry.frame }));

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed, contextLine(held, COMPOSER_W, "plain"))}
						phase={turn.phase}
						selection={held}
						entered="plain"
						lit={lit}
						onLight={setLit}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField
					outlines={outlines}
					lit={lit}
					onLight={setLit}
					entered={inside}
					onEnter={setInside}
					onExit={() => setInside(null)}
				/>
			</CanvasChrome>
		</SpoolShell>
	);
}
