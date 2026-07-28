import { MarkWindow, WalkMark } from "../../../shared/ui/spool-walk-marks";

/**
 * agent-mark--edge — the mark is a door in the frame's wall.
 *
 * Same scene, same glyphs, one thing moved: the mark comes off the name and sits
 * on the frame's right edge, half in the wall and half out of it, which is the
 * side every drawn arrow on this canvas leaves through. #58's portal chips hung
 * off the frame's boundary the same way before they were deleted; this is that
 * idea with the target's name taken out of it, because a chip carrying a name is
 * a label and a label is what the arrows already are.
 *
 * **What it buys.** The name keeps its whole row. `cart--empty` reads as
 * `cart--empty` at any zoom, and a frame with a long name is not paying for its
 * walks. The mark is also where the walk would have left, so it points at the
 * fact rather than at the frame's identity.
 *
 * **What it costs, drawn rather than argued.**
 *
 * *The edge is taken.* `cart` has a real arrow leaving that same wall forty-four
 * pixels above the door, and it is faint because it sits inside a branch. Two
 * things in the thread and one thing in grey, all leaving one edge, in a band the
 * eye already reads as the arrow layer.
 *
 * *It has to carry its own surface.* Over the canvas there is nothing behind the
 * mark, so both states need a border and a fill, and the loudness that separates
 * broken from off-page in the label row is gone: chipped against bare becomes
 * `bg-surface` against `bg-raised`, which is two greys eleven values apart.
 *
 * *It lands in the gap between frames.* Fifty pixels here, and a designer tidying
 * a page puts frames closer than that. Two neighbours both wearing a door read as
 * one object in the gap between them.
 *
 * *And it is a second thing to counter-scale.* The label already holds screen size
 * at every zoom because the camera scales it back; a door needs the same
 * arithmetic against a moving edge, which is what `portal-chips.tsx` was doing
 * when it was deleted.
 */
export default function AgentMarkEdgeFrame() {
	return <MarkWindow place="edge" renderMark={(_frame, walk) => <WalkMark walk={walk} shape="door" />} />;
}
