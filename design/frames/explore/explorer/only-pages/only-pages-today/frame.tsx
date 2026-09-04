import { OnlyPagesScreen } from "shared/ui/explore/explorer/only-pages";

/**
 * The shipped picture. A page with no frames of its own, twelve pages standing
 * on it in the daemon's row, and the camera where last session left it.
 * Nothing moves the camera on arrival, so the rail reads full and the field
 * reads empty; the objects are a long pan to the right.
 */
export default function OnlyPagesTodayFrame() {
	return <OnlyPagesScreen take="today" argues="Today. The objects are there; the camera has no idea." />;
}
