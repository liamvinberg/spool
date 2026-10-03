import { TerritoryStage } from "shared/ui/explore/cloud/presence-territory/stage";

/**
 * territory-reach: the ground is files. An agent is drawn as the file it holds: a frame's own source on its name row, a shared component as a tile in the gutter threaded to every frame it renders in. Two writers on one file share one tile; nobody waits, and a write against a file that changed since it was read makes the agent read again. Off-screen work and what changed while you were away sit in a tray at the viewport's foot.
 *
 * This state: You open cart while Ana's agent is writing it, point at the row it is writing, edit the button, then send your own agent at the block hers holds.
 */
export default function Frame() {
	return <TerritoryStage take="reach" state="enter" />;
}
