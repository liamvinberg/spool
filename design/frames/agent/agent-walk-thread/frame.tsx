import { WalkThreadWindow } from "./walk-thread-scene";

/**
 * agent-walk-thread: the scene at rest.
 *
 * No mark, no chip, no door in a wall. The arrow layer already says where a frame
 * goes, so the two walks it could not draw are drawn in it, with endings of their
 * own: `cart` runs two threads out of its free wall that thin away into a tag
 * naming `checkout · shop` and `home · site`, and `cart--empty` runs two stubs
 * that stop against a bar with the dead name beside it.
 *
 * **Read it by the ending.** Up top, `menu` walks to `cart` and the thread ends in
 * a point against a frame. Down below, two threads end in nothing. On the right,
 * two end in a wall. Three endings, one layer, no second object to learn, and the
 * count is not a number anywhere: two threads leave, so you see two threads.
 *
 * **What the tag has to earn.** It is the only thing here that can be pressed, and
 * a stroke cannot be, so the tag carries the whole affordance: 120 x 22 of target,
 * a border and a fill nothing else on the open canvas has, and a pointer cursor.
 * The thread also carries an invisible 18px hit stroke along its path, so the
 * whole gesture is reachable rather than the pill alone. `agent-walk-thread--reach`
 * is what happens when either one is under the cursor.
 *
 * **Why broken is grey.** Red is the thread and the thread means it carries you.
 * A walk that carries nobody is not one. It gets the loudness a different way: the
 * bar and the name are the only full-strength marks on the canvas outside the
 * frames, and a hard perpendicular edge is a shape this layer makes nowhere else.
 * The stub is also the only stroke here that is short, which is the tell you catch
 * before you have read anything.
 *
 * **The cost, drawn rather than argued.** The tags need open canvas to land in.
 * This page has plenty and a tidy page will not: two frames a gap apart leave a
 * thread nowhere to fade and a tag nowhere to sit, and it will end up overlapping
 * a neighbour. That is the real bill for putting the answer out on the field
 * rather than on the frame, and it is the thing the label and edge candidates were
 * paying to avoid.
 */
export default function AgentWalkThreadFrame() {
	return <WalkThreadWindow />;
}
