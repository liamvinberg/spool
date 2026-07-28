import { GhostWindow } from "../../../shared/ui/spool-walk-ghosts";

/**
 * agent-walk-ghost--press - the pointer is on `checkout`, and three things answer.
 *
 * The plate itself fills and its outline closes. That is the whole state change on
 * the ghost: no size shift, no verb sliding in, nothing that would make a column
 * of them twitch as the pointer crosses it. A dashed outline becoming a solid one
 * over a filled body is a phantom becoming touchable, which is exactly what press
 * means here.
 *
 * The arrow into it comes up to full strength, so the pairing reads in both
 * directions. Point at the plate and you can see which walk it belongs to; follow
 * the arrow and you can see where it lands.
 *
 * And `shop` lights in the Pages tree, the way a rail row lights a page (#143).
 * That is the piece that earns the second word on every plate. The first time the
 * tree answers while the pointer is out on the canvas, a ghost stops being two
 * names side by side and becomes an address, and the next press is not a
 * surprise: the page follows, the arrival is centred, `checkout` is selected.
 *
 * **The voids answer differently.** Pointing at `chekout` or `nav.tsx:12` closes
 * the outline the same way, because they are pressable too, but the tree stays
 * dark since there is no page to light, and what appears beside the plate is the
 * line the walk is written on, `cart--empty/frame.tsx:31`. That is the only move a
 * void leaves you: the walk cannot be followed, so the press opens the source
 * instead. Hover either one on this canvas and it is there. It is beside the plate
 * rather than under it because under it is where the next void in the stack
 * already is, and it is not drawn here because there is one pointer, and a frame
 * showing two hovers at once is a frame that is lying.
 */
export default function AgentWalkGhostPressFrame() {
	return <GhostWindow initialPointed="checkout" />;
}
