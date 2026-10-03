import { TerritoryStage } from "shared/ui/explore/cloud/presence-territory/stage";

/**
 * territory-reach: the ground is files. An agent is drawn as the file it holds: a frame's own source on its name row, a shared component as a tile in the gutter threaded to every frame it renders in. Two writers on one file share one tile; nobody waits, and a write against a file that changed since it was read makes the agent read again. Off-screen work and what changed while you were away sit in a tray at the viewport's foot.
 *
 * This state: Ana's pointer is on menu while her agent writes onboarding-2, about 3,000px away; Jonas is the reverse; Mira and her agent share the view.
 */
export default function Frame() {
	return <TerritoryStage take="reach" state="far" />;
}
