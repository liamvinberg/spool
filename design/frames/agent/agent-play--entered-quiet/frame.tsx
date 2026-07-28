import { useState } from "react";
import { contextLine } from "../../../shared/lib/agent-selection";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { enteredFrame } from "../../../shared/lib/pointed-fixtures";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type Outline, PlayField } from "../../../shared/ui/spool-play-field";
import { COMPOSER_W, PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--entered-quiet — the hedge, drawn so it can be rejected by eye.
 *
 * The reading behind it: a chip you chose is evidence, a chip that appeared is an
 * inference, and the composer should not present them in the same voice. So the
 * accent bar goes to a quarter, the label goes to muted, and the fill drops from
 * raised to surface. Same words, softer claim.
 *
 * Two things are wrong with it, and they are easier to see than to say.
 *
 * The first is that it is not an inference. Entering is the most specific act the
 * canvas has — you are inside the frame, using it — and the canvas already says so
 * at full strength: the same thread ring a selected frame wears, plus a filled
 * badge where the name used to be. A rail that whispers about the thing the canvas
 * is shouting reads as a bug in one of them.
 *
 * The second is that the dimming has no lever behind it. Faded usually means
 * pending, disabled, or lower priority, and none of those are true: this chip is
 * exactly as live as any other, it goes into the prompt with the same bytes, and
 * since #121 the frame it names is edited without asking. Making the loudest
 * consequence the quietest thing on screen is the wrong way round.
 *
 * Compare it with the frame to its left by looking, not by reading. If the quiet
 * chip is more comfortable, the discomfort it is soothing is real and belongs
 * somewhere — but the composer is not where a doubt about authority gets filed.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayEnteredQuietFrame() {
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
						entries={railEntries(script, turn, elapsed, contextLine(held, COMPOSER_W, "quiet"))}
						phase={turn.phase}
						selection={held}
						entered="quiet"
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
