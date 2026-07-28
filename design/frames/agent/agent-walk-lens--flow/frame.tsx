import { useState } from "react";
import { WalkLensWindow } from "../../../shared/ui/spool-walk-lens";

/**
 * agent-walk-lens--flow — the same canvas with the lens on.
 *
 * One press and the canvas stops being a place you arrange and becomes a thing
 * you read. The covers fall to fourteen percent, which leaves each frame a
 * rectangle with a hint of its layout still in it, and that is the whole budget
 * the threads needed: with the screens quiet, the accent can be everywhere at
 * once without the canvas turning into noise. Nothing else about the chrome
 * moves — same labels, same tree, same rail, same selection.
 *
 * **Four walks that had no home now have one.** `checkout · shop` and
 * `home · site` leave `cart` on its right, thread the corridor between `receipt`
 * and `cart--empty`, and dock at the page boundary. Solid is a walk that will
 * happen and dashed is one inside a branch, which is the same distinction the
 * drawn arrows already make. The thread is the tag's left edge rather than a line
 * pointing at it, so the tag reads as the thread arriving. Pressing travels;
 * hovering lights the page in the tree, which is what `checkout · shop` is doing
 * here, with `shop` lit two rails away.
 *
 * **`cart--empty` is the bug this ticket exists for.** It draws no arrow on this
 * page because neither of its walks can be drawn, so today it reads as a frame
 * with no walks at all. Under the lens it has two: a stub, a gap, a cross, and
 * the dead name. `chekout` is struck through because nothing answers to it;
 * `nav.tsx:12` is printed as a source location because that is the only true
 * thing to say about a walk the parser could not read. They are grey, and they
 * stop a hundred pixels short of the edge the other two reach. Where a thread
 * ends is the fact; the cross only confirms it.
 *
 * **What the lens does not do.** It reads one page. A walk that goes nowhere on
 * `shop` is invisible from here and so is the dot that would tell you, because
 * the toggle belongs to the focused canvas the way the zoom readout does.
 */
export default function AgentWalkLensFlowFrame() {
	const [pointed, setPointed] = useState<string | null>("checkout");
	return <WalkLensWindow lens pointed={pointed} onPoint={setPointed} />;
}
