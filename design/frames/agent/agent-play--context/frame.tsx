import { useState } from "react";
import { contextLine } from "../../../shared/lib/agent-selection";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { CHECKOUT_BAR, CHECKOUT_BAR_BOX } from "../../../shared/lib/pointed-fixtures";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type Outline, PlayField } from "../../../shared/ui/spool-play-field";
import { COMPOSER_W, PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--context — the same session, with the selection already attached.
 *
 * Type anything you like and press Enter. The point of this frame is what you did
 * not have to type: no filename, no line numbers, no "the bar at the bottom of the
 * cart screen". The chip above the field is the selection spool already holds, it
 * rides out with the message, and the element it names is wearing its outline on
 * the canvas at the same time.
 *
 * Chip and outline are one object, which is why they are the only accent on
 * screen and why hovering either one lights the other. Everything the agent does
 * stays colourless.
 *
 * Selection has always been a list; this is the list at one (#116). The plural
 * frames are to the right — the same strip at three, and at five.
 *
 * The turn is the capture's verify loop, which is the one slice of a real session
 * that is entirely about looking at a frame: the agent shoots it, then reads the
 * PNG back, then thinks about what it saw. Both waits are the real ttft the capture
 * recorded — 1.7s before the shot, 2.7s before the read — which is why the second
 * row takes noticeably longer to appear than the first.
 *
 * The row that matters is the second one. A `tool_result` comes back holding an
 * image block rather than text, and a rail that renders `look home.png` and stops
 * there loses the only moment in a turn where the agent is looking at its own
 * work. So the row opens itself and holds the picture's place at the ratio spool
 * shoots. The well is empty because the capture elides the base64 payload; it is
 * where the picture was, not a thumbnail pretending to be one.
 *
 * The turn ends the way the capture does: on a thought. 1200 estimated tokens with
 * no text to show, so the line carries a duration and nothing else.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const OUTLINES: readonly Outline[] = [
	{ id: "bar", frame: "cart", box: CHECKOUT_BAR_BOX, label: "checkout-bar" },
];

export default function AgentPlayContextFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "verify");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	const [lit, setLit] = useState<string | null>(null);
	const context = contextLine(CHECKOUT_BAR, COMPOSER_W);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				selected="cart"
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed, context)}
						phase={turn.phase}
						selection={CHECKOUT_BAR}
						lit={lit}
						onLight={setLit}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField outlines={OUTLINES} lit={lit} onLight={setLit} />
			</CanvasChrome>
		</SpoolShell>
	);
}
