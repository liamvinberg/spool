import { useEffect, useRef } from "react";
import { coverUrl } from "../api";
import { cn } from "../cn";
import { ChevronIcon } from "../icons";
import { Thumbnail } from "../primitives/display";
import { holdsLine, type PageListRow } from "./page-list";

/**
 * A page of pages, drawn as the list of them (spool#224): centred rows, each
 * the still the photo booth already keeps of its first frame, the name over a
 * quiet line of what it holds, and a chevron. The lit row is where ⌘↓ and ⏎
 * go; the pointer lights the row it is over, the arrows walk it, and a click
 * goes in. Nothing here renders a frame: every picture is a still.
 *
 * Each row carries its page as `data-page-row`, which is where a drop and a
 * peek will anchor.
 */
export function PageListView({
	project,
	rows,
	lit,
	onLight,
	onGo,
}: {
	project: string;
	rows: readonly PageListRow[];
	lit: string | null;
	onLight: (page: string) => void;
	onGo: (page: string) => void;
}) {
	const list = useRef<HTMLDivElement | null>(null);
	// the arrows can walk the lit row off the bottom of a long list: it comes into view
	useEffect(() => {
		if (lit === null) return;
		list.current?.querySelector(`[data-page-row="${CSS.escape(lit)}"]`)?.scrollIntoView?.({ block: "nearest" });
	}, [lit]);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: it only keeps a press from the canvas under it; its rows are buttons
		<div
			data-page-list=""
			className="absolute inset-0 overflow-y-auto"
			// the canvas under it has nothing to marquee or pan here: a press is the list's
			onPointerDown={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
		>
			<div ref={list} className="mx-auto mt-20 mb-16 flex w-[min(560px,calc(100%-48px))] flex-col">
				{rows.map((row) => (
					<button
						type="button"
						key={row.page}
						tabIndex={-1}
						data-page-row={row.page}
						aria-current={row.page === lit ? "true" : undefined}
						aria-label={`${row.name}, ${holdsLine(row)}`}
						// a move, not an arrival: a list drawn under a resting pointer keeps its first row lit
						onPointerMove={() => row.page !== lit && onLight(row.page)}
						onClick={() => onGo(row.page)}
						className={cn(
							"flex h-16 cursor-pointer items-center gap-3 rounded-md px-2 text-left transition-colors duration-fast ease-out",
							row.page === lit && "bg-state-hover",
						)}
					>
						<Thumbnail
							className="h-11 w-15"
							src={
								row.still?.hash === undefined ? undefined : coverUrl(project, row.still.frame, row.still.hash)
							}
						/>
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="truncate text-primary type-value">{row.name}</span>
							<span className="truncate text-secondary tabular-nums type-detail">{holdsLine(row)}</span>
						</div>
						<span aria-hidden="true" className="size-3 text-tertiary [&>svg]:size-full">
							<ChevronIcon />
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
