import { useState } from "react";
import { contextLine } from "../../../shared/lib/agent-selection";
import { railEntries, useCapture, useTurnScript } from "../../../shared/lib/claude-turn";
import { CART_BOXES, CART_PARTS } from "../../../shared/lib/pointed-fixtures";
import { useTicker, useTurn } from "../../../shared/lib/turn-play";
import { CanvasChrome, type PageRow } from "../../../shared/ui/spool-canvas-chrome";
import { type Outline, PlayField } from "../../../shared/ui/spool-play-field";
import { COMPOSER_W, PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-play--plural-chips — the alternative, drawn fairly and rejected. One chip
 * per entry, always, whatever the count.
 *
 * The same five elements as the frame to its left, so the only difference is the
 * strip. And it is drawn as favourably as it can honestly be drawn: the frame
 * name is dropped from every chip because all five share it, which is the best
 * case an always-chips strip ever gets.
 *
 * It still loses, in three ways you can see from here.
 *
 *   the composer   three rows of chips before the prompt starts. The field is
 *                  the point of the composer and it has been pushed down to make
 *                  room for a list of things the canvas is already showing.
 *   the twins      `line-item · 44-56` appears twice. Two chips, two ✕, no way
 *                  to tell which is which — and that is not a labelling bug to
 *                  fix, it is what two picks of one component are. Any label
 *                  long enough to separate them is a selector, and a selector in
 *                  the composer is the path this whole feature exists to stop
 *                  anyone typing.
 *   the ceiling    at five it is merely heavy. Nothing about it holds at twelve,
 *                  and there is no honest place to put a cap, because the moment
 *                  a strip is `[a] [b] +10` it is a count wearing two arbitrary
 *                  names.
 *
 * What it wins is real and worth naming: every entry is removable without
 * opening anything. The recommendation keeps that — it is one click behind the
 * chevron — and pays a click to get the composer back and to make removal happen
 * somewhere the twins are two different pictures.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["cart", "menu", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const OUTLINES: readonly Outline[] = CART_PARTS.map((entry) => ({
	id: entry.id,
	frame: entry.frame,
	box: CART_BOXES[entry.id],
	label: entry.kind === "element" ? entry.name : entry.frame,
}));

export default function AgentPlayPluralChipsFrame() {
	const capture = useCapture("claude-turn");
	const script = useTurnScript(capture, "verify");
	const turn = useTurn(script.cues);
	const elapsed = useTicker(turn.run, script.total);
	const ready = script.cues.length > 0;
	const [held, setHeld] = useState(CART_PARTS);
	const [lit, setLit] = useState<string | null>(null);

	const drop = (id: string | null) => {
		setLit(null);
		setHeld(id === null ? [] : held.filter((entry) => entry.id !== id));
	};

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
						entries={railEntries(script, turn, elapsed, contextLine(held, COMPOSER_W))}
						phase={turn.phase}
						selection={held}
						rule="chips"
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
