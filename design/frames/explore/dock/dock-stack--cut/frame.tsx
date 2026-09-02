import { DockScreen } from "shared/ui/spool/dock-screen";

/**
 * stack, cut — the same take with every transition taken out.
 *
 * The edge jumps, the surface is simply there, the glyph's background switches.
 * This is the control: it is what `dock--stack` was before the motion, and it
 * is the only honest way to judge whether 300ms of travel earns itself or just
 * sits between you and the panel you asked for.
 *
 * It also stands for what a person who has switched motion off actually gets,
 * since every transition in the take is behind `prefers-reduced-motion`. That
 * has to be a surface someone can work in rather than a degraded one, and it
 * is: nothing here depends on the movement to be legible, which is the test the
 * motion had to pass before it was allowed in.
 */
export default function DockStackCutFrame() {
	return (
		<DockScreen
			take="stack"
			motion="cut"
			argues="No motion at all. What the eased take is read against, and what reduced motion gets."
		/>
	);
}
