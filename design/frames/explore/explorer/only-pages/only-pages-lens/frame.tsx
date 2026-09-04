import { OnlyPagesScreen } from "shared/ui/explore/explorer/only-pages";

/**
 * The page is a lens on its subtree. Each page below is drawn as its own
 * canvas at a readable width, under its name and a hairline, dimmed until the
 * hand is over it. Nothing is placeable, because nothing here is on this page.
 */
export default function OnlyPagesLensFrame() {
	return (
		<OnlyPagesScreen take="lens" argues="Lens. The field shows what is below, one section per page, and the field lays it out." />
	);
}
