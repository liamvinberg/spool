import { SharedScreen } from "shared/ui/explore/manipulate/shared-screen";

/**
 * `shared-select`, and the seven you cannot see. The canvas rings the frames
 * on screen; the pages rail marks every frame that renders the export, on this
 * page or another, with a dot and no number. A collapsed page says only that
 * something on it does, the same restraint the walk tick keeps.
 *
 * `shared-reach` accepted that the drawing ends at the viewport and put the
 * rest in a rail line, `9 frames · menu on screen`. This take answers which
 * nine, on the surface that already lists every frame in the project.
 */
export default function SharedRailFrame() {
	return <SharedScreen take="rail" />;
}
