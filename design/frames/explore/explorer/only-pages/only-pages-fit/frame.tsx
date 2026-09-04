import { OnlyPagesScreen } from "shared/ui/explore/explorer/only-pages";

/**
 * The smallest diff: the arrival camera and zoom-to-fit count page objects as
 * things on the field. Everything else is as shipped: placed, draggable,
 * double-click enters.
 */
export default function OnlyPagesFitFrame() {
	return (
		<OnlyPagesScreen take="fit" argues="Fit knows pages. Arrival and zoom-to-fit include the objects; nothing else changes." />
	);
}
