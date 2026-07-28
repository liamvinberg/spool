import { useState } from "react";
import { WalkLensWindow } from "../../../shared/ui/spool-walk-lens";

/**
 * agent-walk-lens--rest — the canvas with the lens off, which is the canvas as it ships.
 *
 * Nothing here is new. Four frames at full paint, the two walks this page can
 * draw, `cart` selected, labels carrying exactly what they carry today. Two facts
 * are on this page and unsaid: `cart` walks off it twice, and `cart--empty`
 * declares two walks that go nowhere. That silence is the direction's claim —
 * arranging frames is not reading flow, and the canvas you arrange in should not
 * be paying rent for the canvas you read in.
 *
 * The one thing that is new is four pixels wide. The threads toggle wears a grey
 * dot because this page has a walk that lands on nothing, and the dot is on the
 * toggle because the toggle is the door to the fact — a notice anywhere else
 * would be the chrome this direction just refused to add. It is grey rather than
 * accent because the accent is the selection's, and a mistyped frame name is not
 * an alarm.
 *
 * The dot says only that there is something. Hovering says how many, and the
 * hint is drawn open here because a still cannot hover; at rest the whole notice
 * is the dot. Off-page walks get no dot at all: leaving the page is a normal
 * thing for a flow to do, and only the thing you would want to fix is worth
 * interrupting a clean canvas for.
 */
export default function AgentWalkLensRestFrame() {
	const [hint, setHint] = useState(true);
	return <WalkLensWindow lens={false} hint={hint} onHint={setHint} />;
}
