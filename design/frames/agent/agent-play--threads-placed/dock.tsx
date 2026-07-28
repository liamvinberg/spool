import type { Thread } from "../../../shared/lib/agent-threads";
import { cn } from "../../../shared/lib/utils";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * What is happening on the pages you are not standing on, put on the canvas.
 *
 * It is built out of the tool bar, because the tool bar is the one thing this
 * product already floats over a viewport and it is the language for chrome that
 * belongs to the canvas rather than to a rail. Same border, same near-black at
 * ninety percent, same blur, same bottom inset, mirrored to the left so the two
 * sit on one line.
 *
 * A row is a page, its mark, and the line its thread is on. The page name comes
 * first because the page is the thing you go to; there is no thread name here at
 * all, and that is the whole idea rather than an omission. Hovering a row lights
 * the page in the rail on the left, which is the same pairing the composer's chips
 * make with the outlines on the canvas: one object, two places.
 *
 * Only conversations that are working or waiting to be read get a row. An old
 * finished thread has nothing to say and is reached the way everything else in
 * spool is reached, by going to the page and looking.
 */

export function ElsewhereDock({
	threads,
	lit,
	onLight,
	onGo,
}: {
	threads: readonly Thread[];
	lit: string | null;
	onLight: (page: string | null) => void;
	onGo: (page: string) => void;
}) {
	if (threads.length === 0) return null;
	return (
		<div className="absolute bottom-6 left-6 z-20">
			<div className="flex w-[238px] flex-col rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur">
				{threads.map((thread) => (
					<button
						key={thread.id}
						type="button"
						onMouseEnter={() => onLight(thread.page)}
						onMouseLeave={() => onLight(null)}
						onClick={() => onGo(thread.page)}
						className={cn(
							"flex h-8 items-center gap-2.5 rounded-md px-2 text-left transition-colors duration-150",
							lit === thread.page ? "bg-surface" : "hover:bg-surface/60",
						)}
					>
						<ThreadMark life={thread.life} />
						<span className="shrink-0 font-mono text-sm text-text/85 leading-4">{thread.page}</span>
						<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/50 leading-3">
							{thread.last}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
