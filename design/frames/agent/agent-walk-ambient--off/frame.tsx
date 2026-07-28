import { useState } from "react";
import { AmbientWindow, CanvasFrame, FAULTS, WalkLayer, useLayer, walkSize } from "../agent-walk-ambient/dock";
import { Arrows, FH, FW, PAGES, SCENE } from "../agent-walk-ambient/scene";

/**
 * agent-walk-ambient--off — the toggle pressed, and the whole layer gone.
 *
 * This is the frame that makes the direction affordable. One layer, one switch: the
 * arrows go, the leaders go, the tags go, the fault marks go. Four frames and their
 * names on bare canvas, which is what somebody arranging a page rather than reading
 * one asked for when they reached for that button. A direction that turned off half
 * of what it drew would have introduced a second switch, and a second switch for
 * flow is the thing #146 exists to avoid.
 *
 * The one thing left is four pixels wide. The toggle keeps a grey dot because the
 * layer it is hiding contains a walk that goes nowhere, and it is on the toggle
 * because the toggle is the door back to the fact — a notice anywhere else would be
 * the chrome this press just refused. Grey, not accent: the accent is the
 * selection's, and a mistyped frame name is not an alarm. It says only that there is
 * something; the count is a press away.
 *
 * Off-page walks get no dot at all when they are hidden. Leaving the page is an
 * ordinary thing for a flow to do, and only the thing you would want to fix is worth
 * marking a canvas you deliberately quietened. That asymmetry is the same one the
 * layer itself is built on: an off-page tag is a fact, a fault is a report.
 *
 * The button works. Press it and this frame becomes `agent-walk-ambient`.
 */
export default function AgentWalkAmbientOffFrame() {
	const layer = useLayer(false);
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
