import { UnseenCanvas } from "../../../shared/ui/spool-unseen-canvas";

/**
 * Nothing on the field at all.
 *
 * The rail still marks the pages and the palette still marks the rows, but the
 * canvas stays a picture of the product rather than a list of what is owed. What
 * replaces the per-frame mark is a door: the count over the tool bar, and `go`,
 * which flies to the next unseen frame — most of which are off screen anyway on a
 * field four viewports wide.
 */
export default function UnseenQuietFrame() {
	return <UnseenCanvas mark="none" clear="view" stepper />;
}
