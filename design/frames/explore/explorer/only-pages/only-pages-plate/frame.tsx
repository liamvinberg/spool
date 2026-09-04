import { OnlyPagesScreen } from "shared/ui/explore/explorer/only-pages";

/**
 * World space stays empty. What the page holds is listed on the glass, where a
 * camera cannot lose it: folder, name, count, and each page's canvas as a
 * strip. This is the take that walks back #265's claim that a page belongs on
 * the field, and it is here so that cost can be seen rather than argued.
 */
export default function OnlyPagesPlateFrame() {
	return <OnlyPagesScreen take="plate" argues="Plate. Nothing in world space; an index pinned to the glass, double-click enters." />;
}
