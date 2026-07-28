import { GhostWindow } from "../../../shared/ui/spool-walk-ghosts";

/**
 * agent-walk-ghost - the destination stands here even though it lives elsewhere.
 *
 * The page at rest. `cart` is selected and walks twice to frames this canvas
 * cannot show, so two ghosts stand in its gutter and the shipped arrows run to
 * them unchanged: solid to `checkout` because that walk always happens, dashed to
 * `home` because it sits inside a branch. Both plates name the page they land on,
 * and pressing one travels.
 *
 * `cart--empty` is the case the shipped canvas has no answer for. It declares two
 * walks that nothing answers, so it draws no arrows and reads as a frame with no
 * walks at all, which is the bug `inspector.tsx:592` names. Here it draws two.
 * They leave in grey rather than in the thread, they end on a stop bar rather
 * than a head, and they stop short of what they were aiming at, which is an
 * outline with nothing behind it and a dead name inside. The loudest thing on
 * either plate is the diagnosis, `missing` and `unreadable`, because the name is
 * not the useful part of a typo and the accent belongs to the selection.
 *
 * **The one risk, and what pays it.** A ghost that could be mistaken for a frame
 * would be worse than no ghost, and the worst version of that mistake is already
 * a real state here: a frame is blank until React commits, so a dimmed dashed
 * phone-shaped rectangle is what a frame that has not painted looks like. So a
 * ghost is not phone-shaped. It is a frame's footprint with the body drained out,
 * one frame wide and one label row tall, thirty pixels against three hundred and
 * forty two. It carries no floating name above it, no thumbnail inside it, no
 * handles and no size chip. Substance runs one way: the frame is opaque and full
 * of its own screen, the ghost keeps a body and loses the picture, the void loses
 * the body too and the canvas runs straight through its outline.
 *
 * **What it costs.** Space the human did not allocate. Four walks take two
 * columns of canvas here, and a ghost sitting where someone is about to drop a
 * frame has to move or be moved. And unlike the label row, a ghost does not
 * counter-scale, because it occupies a place rather than annotating one, so it
 * shrinks with everything else and goes unreadable before the labels do.
 */
export default function AgentWalkGhostFrame() {
	return <GhostWindow />;
}
