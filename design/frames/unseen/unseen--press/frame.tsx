import { UnseenCanvas } from "../../../shared/ui/spool-unseen-canvas";

/**
 * The dot again, with the other clearing rule: looking never clears it.
 *
 * A mark stands until you click the frame, the way a mailbox works. Pan the whole
 * field and the count does not move, which is either the honesty this needs or the
 * chore it must not become — hover a page in the rail for the way out, `seen`,
 * which clears the page in one press.
 */
export default function UnseenPressFrame() {
	return <UnseenCanvas mark="dot" clear="press" />;
}
