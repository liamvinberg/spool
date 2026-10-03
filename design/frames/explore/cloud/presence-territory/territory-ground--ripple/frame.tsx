import { TerritoryStage } from "shared/ui/explore/cloud/presence-territory/stage";

/**
 * territory-ground: whoever works a frame stands on ground painted on the canvas floor under it, never on the design. A shared component lays ground under every frame that renders it, joined by a path. An agent sent to someone else's ground builds a `--` sibling next door instead. Zoomed out, one owner's ground runs together into a map.
 *
 * This state: Mira's agent rewrites price-row.tsx, which eight frames render, while Theo hand-edits a price row on checkout and you read cart.
 */
export default function Frame() {
	return <TerritoryStage take="ground" state="ripple" />;
}
