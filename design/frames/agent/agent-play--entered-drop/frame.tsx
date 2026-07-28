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
 * agent-play--entered-drop — what the rail already does, finally looked at.
 *
 * No flag, no special case: hand `stripOf` the frame `canvas.tsx:820` serves and
 * this is the chip that comes out, ✕ and all. It is the baseline the other three
 * are diffs against, and drawing it is the point — #116 left the fallback undrawn
 * with a proposal attached, and a proposal nobody has looked at is not a decision.
 *
 * Press the ✕ and see the problem. The strip mirrors the canvas, so removal has to
 * reach out there, and out there the only thing that stops you pointing at the
 * frame you are inside is leaving it. So the ✕ ejects you: the badge goes, the
 * ring goes, the keyboard comes back to the canvas, and whatever you were part-way
 * through inside the frame is over. Every other ✕ in this composer drops a
 * selection ring. This one ends a mode.
 *
 * It is also the only ✕ with nothing to disambiguate. #116 kept per-entry removal
 * because two picks of one list row are one string in the rail and two boxes on
 * the canvas — the ✕ earns its place by reaching a member you cannot otherwise
 * name. Here there is exactly one member and there can never be two: a pick
 * outranks the fallback, a canvas selection outranks it, and a press anywhere
 * outside the frame has already left it (`canvas.tsx:1682`).
 *
 * Esc does the same thing from the keyboard, where the hands already are.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayEnteredDropFrame() {
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
						entries={railEntries(script, turn, elapsed, contextLine(held, COMPOSER_W, "drop"))}
						phase={turn.phase}
						selection={held}
						entered="drop"
						lit={lit}
						onLight={setLit}
						// the chip's ✕ is the canvas's esc, wearing a different coat
						onDrop={() => {
							setLit(null);
							setInside(null);
						}}
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
