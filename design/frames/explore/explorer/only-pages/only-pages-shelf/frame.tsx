import { OnlyPagesScreen } from "shared/ui/explore/explorer/only-pages";

/**
 * A page with no frames of its own has nothing to arrange its pages against,
 * so the objects have no coordinate: they sit in a row from the gutter, in
 * rail order, and the camera fits them on arrival. The first frame written
 * onto the page gives them a neighbour, and from then on they are placed.
 */
export default function OnlyPagesShelfFrame() {
	return (
		<OnlyPagesScreen take="shelf" argues="Shelf. No frames on the page, no coordinate: one row in rail order, fitted on arrival." />
	);
}
