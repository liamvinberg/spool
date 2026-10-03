import { TerritoryStage } from "shared/ui/explore/cloud/presence-territory/stage";

/**
 * territory-edge: the shipped hand with names and a queue. Every writer stands in a lane down the frame's left edge in its owner's colour; an agent that wants a block another agent is writing waits beside it, dashed, and takes it when the other lets go. People never wait. Zoomed out, the lanes fold onto the frame's top edge as a roof.
 *
 * This state: Coming back after 40 minutes: what changed, who changed it, and how each mark settles once you have looked.
 */
export default function Frame() {
	return <TerritoryStage take="edge" state="away" />;
}
