import { useState } from "react";
import { MarkWindow, WalkMark, WalkSheet } from "../../../shared/ui/spool-walk-marks";

/**
 * agent-mark--open — the label mark pressed, on both frames that wear one.
 *
 * It plays itself: each mark opens and shuts its own sheet. Both are open on
 * arrival because the frame has to show both readings at once, and because a
 * sheet belongs to the frame that opened it rather than to the canvas. In a real
 * project the second one is rare anyway; broken walks are typos, and a page
 * carrying two at the same time is a page somebody is midway through renaming.
 *
 * Hovering a destination lights its page in the tree, the pairing #143 already
 * ships for a rail row naming a frame.
 *
 * **Two destinations is the case that decides the shape.** One would have been a
 * tooltip and a jump. Two cannot be, so the mark opens a list, and the moment
 * there is a list the page each name lands on has somewhere to be printed, which
 * is the fact the arrow could not have carried even if it had been drawn.
 * `checkout` is on `shop`, `home` is on `site`, and pressing either one travels:
 * the page follows, the arrival is centred, the target ends up selected. That
 * landing is not new and it is not re-drawn here. `agent-play--jump-row` is it.
 *
 * **The rows are the inspector's rows, unchanged.** Certainty as the leading
 * glyph, `→` for a walk that will be taken and `⇢` for one inside a branch. A
 * name nothing answers to is struck through and called `missing`. A destination
 * the parser cannot read has no name to print, so its source location is the
 * label and it is called `unreadable`. `nav.tsx:12` is a walk computed at
 * runtime, and the whole reason that row exists is that a frame whose only walks
 * are computed used to render as a frame with no walks at all.
 *
 * **Broken says nothing about going.** Neither row is a button, because there is
 * nowhere to go, which is what `inspector.tsx:564` disables them for. The value
 * is the name and the location, and both are what you need to go fix the typo.
 *
 * **Why a sheet rather than the rail.** It is the same list the connections tab
 * held, and it is shorter because it is scoped to one frame and to the two things
 * an arrow cannot show. Everything else that tab listed is out on the canvas
 * already, drawn.
 */
export default function AgentMarkOpenFrame() {
	const [open, setOpen] = useState<readonly string[]>(["cart", "cart--empty"]);
	const [lit, setLit] = useState<string | null>(null);

	const press = (name: string) => {
		setOpen((current) => (current.includes(name) ? current.filter((it) => it !== name) : [...current, name]));
		setLit(null);
	};

	return (
		<MarkWindow
			place="label"
			litPage={lit}
			renderMark={(frame, walk) => (
				<WalkMark walk={walk} open={open.includes(frame.name)} onPress={() => press(frame.name)} />
			)}
			overlay={
				<>
					{open.includes("cart") ? (
						<WalkSheet kind="off" onPoint={setLit} style={{ left: 238, top: 136 }} />
					) : null}
					{open.includes("cart--empty") ? <WalkSheet kind="broken" style={{ left: 446, top: 504 }} /> : null}
				</>
			}
		/>
	);
}
