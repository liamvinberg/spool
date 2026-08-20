import { UnseenCanvas } from "../../../shared/ui/spool-unseen-canvas";

/**
 * The same rule, saying which kind out loud.
 *
 * `new` and `edited` at the far end of the label, where `play` sits on the
 * selection — a word instead of a shape, so nothing has to be learned and the
 * two states cannot be confused for one. It costs the quietest thing the canvas
 * has: twelve labels that used to be a name are now a name and a status.
 */
export default function UnseenWordFrame() {
	return <UnseenCanvas mark="word" clear="view" />;
}
