import { OnlyPagesScreen } from "shared/ui/explore/explorer/only-pages";

/**
 * Everything stays where it is. What is out of view is named on the edge of
 * the glass nearest it; pressing a name flies there. The same chrome would
 * serve a frame scrolled out of view, which is why it is worth seeing here.
 */
export default function OnlyPagesMarksFrame() {
	return (
		<OnlyPagesScreen take="marks" argues="Edge marks. What is off the glass is named on the edge it went past; press to fly there." />
	);
}
