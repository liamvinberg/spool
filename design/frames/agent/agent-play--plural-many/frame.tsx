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
 * agent-play--plural-many — the recommendation, at the end where a list stops
 * being a list. Five elements shift-ranged down the cart's tree, one chip.
 *
 * Same rule as the frame to the left: one line, so either the chips fit or the
 * strip is a count. Five element chips do not fit and never will — an element
 * label is a noun and a line range, three times the width of a frame name — so
 * this is what the many case looks like, and it is the case the composer is
 * actually designed for.
 *
 * `5 elements in cart` says the frame once instead of five times, which is the
 * only thing five element chips would have repeated anyway.
 *
 * Open it and you get the list — and the list is where the argument gets
 * settled, because two of these five are `line-item · 44-56`. The same
 * component, twice, indistinguishable in every word the rail could print. Five
 * chips would be five ✕ and no way to know which one you were about to drop.
 * Hover a row here and the box that answers to it lights out on the canvas, and
 * that is the moment where they stop being the same thing: forty pixels apart,
 * one above the other. The rail can name them. Only the canvas can tell them
 * apart, which is why removal is drawn as a reach out to the canvas rather than
 * as a tidy list of buttons that quietly cannot be told apart.
 *
 * The ✕ on the count chip drops the whole selection, which is the one act the
 * canvas cannot do for you while you are standing inside a frame — the daemon
 * falls back to the entered frame when nothing is picked, so "no context" has to
 * be sayable here or it is not sayable at all.
 *
 * Click a row to drop it. Click the chip to open and shut.
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

export default function AgentPlayPluralManyFrame() {
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
