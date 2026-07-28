import { useState } from "react";
import { AmbientWindow, CanvasFrame, FAULTS, WalkLayer, useLayer, walkSize } from "./dock";
import { Arrows, FH, FW, PAGES, SCENE } from "./scene";

/**
 * agent-walk-ambient — the canvas at rest, drawing everything it knows.
 *
 * Nothing is selected. Nothing is hovered. There is no pointer in this still and no
 * verb anywhere on the page, and the whole flow map is on screen: two same-page
 * arrows in the thread, `cart` wearing its two off-page tags, `cart--empty` wearing
 * its two faults. That is the claim in one picture. Reading where a flow goes stops
 * being something you do to a frame and goes back to being something the canvas is.
 *
 * Compare it against `agent-walk-lens--rest`, which is this same scene with the two
 * facts left unsaid, and against `agent-walk-reveal`, where they cost a selection.
 * The difference in cost here is four hairlines, two dots, and four lines of mono —
 * against the cost of not knowing, which is opening the inspector one frame at a
 * time to find out that `chekout` was a typo.
 *
 * Three things are decided in this frame and they are the three that overlapped:
 *
 * **The tag is docked, so it belongs to a frame without being asked to.** `cart`'s
 * two tags sit 20 pixels off its wall and move with it. Nothing on this canvas has
 * to be pressed to say who owns it, which was the failure mode of every floating
 * candidate: an object out in the field with a line back to a rectangle is a puzzle
 * at four frames and a knot at thirty.
 *
 * **A fault is grey and loud at the same time.** `chekout` is struck and full
 * strength, `nav.tsx:12` is named by its source location because that is the only
 * thing there is to say about it, and neither borrows the accent. The two leaders
 * into them are heavier ink than `cart`'s, and each one stops before its tag — a
 * cross where the name answers to nothing, a bar where the parser could not read
 * the site. On a page with no faults on it there is nothing at that weight anywhere,
 * which is what makes the weight mean something.
 *
 * **The toggle owns the layer, so the layer needs no other switch.** Top right, held
 * on, wearing the `edge` glyph rather than the flow arrow, because it now governs
 * arrows and tags together and the arrow was only ever half of what it did. Press it
 * and this frame becomes `agent-walk-ambient--off`.
 */
export default function AgentWalkAmbientFrame() {
	const layer = useLayer(true);
	const [lit, setLit] = useState<string | null>(null);

	return (
		<AmbientWindow
			pages={PAGES}
			zoom="41%"
			on={layer.on}
			faults={FAULTS.length}
			onToggle={layer.toggle}
			litPage={layer.on ? lit : null}
		>
			{layer.on ? <Arrows /> : null}
			{SCENE.map((frame) => (
				<CanvasFrame key={frame.name} frame={frame} w={FW} h={FH} />
			))}
			{layer.on ? <WalkLayer scene={SCENE} w={FW} size={walkSize(FW)} lit={lit} onPoint={setLit} /> : null}
		</AmbientWindow>
	);
}
