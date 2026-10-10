import type { Unseen } from "../../daemon/seen";
import { StatusMark } from "../primitives/display";

/**
 * A frame nobody has looked at, in the smallest thing that can say it.
 *
 * It is not red. The one accent belongs to the selection, and a canvas where six
 * frames wear the selection colour has no selection colour left. A filled disc is
 * never seen, the same disc the agent rail spends on a thread nobody has read, so
 * unread has one shape everywhere in this app. A hollow ring is seen once and
 * moved since, quieter because the news is smaller.
 *
 * Hidden from the reader: the row it sits in already says what it is.
 */
export function UnseenMark({ mark, className }: { mark: Unseen; className?: string }) {
	return <StatusMark status={mark === "new" ? "unseen" : "moved"} aria-hidden="true" className={className} />;
}
