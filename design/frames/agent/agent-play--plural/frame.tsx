import { useState } from "react";
import { contextLine } from "../../../shared/lib/agent-selection";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { THREE_FRAMES } from "../../../shared/lib/pointed-fixtures";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type Outline, PlayField } from "../../../shared/ui/spool-play-field";
import { COMPOSER_W, PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--plural — the recommendation, at the end where a list is still a
 * list. Three frames shift-clicked, three chips, one line.
 *
 * The rule this frame and agent-play--plural-many share: the selection never
 * takes more than one line of the composer. Either every chip fits on that line
 * or the strip is a count. There is no third shape — no `[menu] [cart] +4` —
 * because two members and a number is a list that has stopped being a list, and
 * which two you get is an accident of how long their names happen to be.
 *
 * Here everything fits, so nothing collapses, and collapsing would be a pure
 * loss: `3 frames` is the same width as the three names and says less than any
 * one of them. That is the whole argument against a count that is always a
 * count. The other end of the rule is the frame to the right.
 *
 * Frames are the cheap population. A chip is one short word, there is no excerpt
 * behind it, and forty of them is forty short lines in the prompt — the reason
 * forty frames is a bad thing to point at is a fact about pointing, not about
 * bytes, and the count chip is where that gets admitted rather than in the
 * prompt builder.
 *
 * Hover a chip and its frame lights out on the canvas; hover the frame and the
 * chip lights. Chip and outline are one object, and at three you can still prove
 * it by eye.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const OUTLINES: readonly Outline[] = THREE_FRAMES.map((entry) => ({ id: entry.id, frame: entry.frame }));

export default function AgentPlayPluralFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "plan");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	const [held, setHeld] = useState(THREE_FRAMES);
	const [lit, setLit] = useState<string | null>(null);

	const drop = (id: string | null) => {
		setLit(null);
		setHeld(id === null ? [] : held.filter((entry) => entry.id !== id));
	};

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<PlayRail
						entries={railEntries(script, turn, elapsed, contextLine(held, COMPOSER_W))}
						phase={turn.phase}
						selection={held}
						lit={lit}
						onLight={setLit}
						onDrop={drop}
						run={turn.run}
						onSend={ready ? turn.send : () => {}}
						onReplay={turn.replay}
					/>
				}
			>
				<PlayField
					outlines={OUTLINES.filter((mark) => held.some((entry) => entry.id === mark.id))}
					lit={lit}
					onLight={setLit}
				/>
			</CanvasChrome>
		</SpoolShell>
	);
}
