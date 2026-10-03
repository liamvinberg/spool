import { TerritoryStage } from "shared/ui/explore/cloud/presence-territory/stage";

/**
 * territory-ground: whoever works a frame stands on ground painted on the canvas floor under it, never on the design. A shared component lays ground under every frame that renders it, joined by a path. An agent sent to someone else's ground builds a `--` sibling next door instead. Zoomed out, one owner's ground runs together into a map.
 *
 * This state: You open cart while Ana's agent is writing it, point at the row it is writing, edit the button, then send your own agent at the block hers holds.
 */
export default function Frame() {
	return <TerritoryStage take="ground" state="enter" />;
}
