import type { Unseen } from "../../daemon/seen";
import { cn } from "../cn";

/**
 * A frame nobody has looked at, in the smallest thing that can say it.
 *
 * It is not red. The one accent belongs to the selection, and a canvas where six
 * frames wear the selection colour has no selection colour left. So: white ink,
 * two shapes. A filled disc is never seen — the same disc the agent rail spends
 * on a thread nobody has read, so unread has one shape everywhere in this app. A
 * hollow ring is seen once and moved since, quieter because the news is smaller.
 *
 * The box is 14px whatever is in it, so a name never shifts when a mark appears
 * beside it, in the rail and in the finder alike.
 */
export function UnseenMark({ mark, className }: { mark: Unseen; className?: string }) {
	return (
		<span aria-hidden="true" className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
			<span
				className={cn(
					"block animate-unseen-in rounded-full",
					mark === "new" ? "h-[5px] w-[5px] bg-text/85" : "h-[7px] w-[7px] border-[1.5px] border-text/70",
				)}
			/>
		</span>
	);
}
