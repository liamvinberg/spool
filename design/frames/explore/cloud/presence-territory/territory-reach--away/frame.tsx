import { TerritoryStage } from "shared/ui/explore/cloud/presence-territory/stage";

/**
 * territory-reach: the ground is files. An agent is drawn as the file it holds: a frame's own source on its name row, a shared component as a tile in the gutter threaded to every frame it renders in. Two writers on one file share one tile; nobody waits, and a write against a file that changed since it was read makes the agent read again. Off-screen work and what changed while you were away sit in a tray at the viewport's foot.
 *
 * This state: Coming back after 40 minutes: what changed, who changed it, and how each mark settles once you have looked.
 */
export default function Frame() {
	return <TerritoryStage take="reach" state="away" />;
}
