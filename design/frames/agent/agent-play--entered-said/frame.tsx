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
 * agent-play--entered-said — the chip says why it is there: `inside cart`.
 *
 * This is the one that answers the ticket's own words. A chip nobody chose is
 * uncomfortable because it looks like a chip somebody chose, and one word fixes
 * that: `cart` is a thing you clicked, `inside cart` is a place you are standing.
 * Nothing is dimmed and nothing is taken away — the chip just stops pretending it
 * arrived the same way as the one on the frame two along.
 *
 * It costs a contract. #116 fixed the prompt as one `<selection>` block carrying
 * the same bytes `spool selection` prints, and those bytes have no idea how the
 * frame got there: `SelectionEntry` is `{kind, frame, path, size}` whether it was
 * clicked, marqueed or stepped into. So the composer would be drawing a
 * distinction the agent is never told, and the strip's whole job is to be the
 * promise of what goes out. It reads as a label about the human's posture in a
 * strip that is otherwise a list of what the agent will see.
 *
 * That is fixable, and the fix is the real question this frame asks: **should the
 * payload carry it?** An agent that knows you are *inside* `cart` knows more than
 * one that knows you selected it — it knows you are using the thing, not arranging
 * it. Adding a marker to the entry is a small change to `selection.ts` and a
 * larger one to the promise: every reader of `spool selection` gains a field.
 *
 * So the order matters. If the bytes stay as they are, this frame loses to the one
 * two to its left on the contract alone. If the bytes gain provenance, this is
 * what the composer should say, and the ✕ question is unchanged either way.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

export default function AgentPlayEnteredSaidFrame() {
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
						entries={railEntries(script, turn, elapsed, contextLine(held, COMPOSER_W, "said"))}
						phase={turn.phase}
						selection={held}
						entered="said"
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
