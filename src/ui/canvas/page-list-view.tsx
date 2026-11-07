import { useEffect, useRef } from "react";
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
 * Each row is a folder: a frame dragged onto it moves there, and Space over
 * it peeks at it, the list stepping aside so the two stand centred together.
 */
export function PageListView({
	stillOf,
	rows,
	lit,
	aside = 0,
	dropLit = null,
	onLight,
	onGo,
}: {
	/** where a row's still is read: the daemon's covers on the Mac, spool.page's in a browser */
	stillOf: (row: PageListRow) => string | undefined;
	rows: readonly PageListRow[];
	lit: string | null;
	/** px the list steps aside by while a peek stands beside a row */
	aside?: number;
	/** the row a drag is aimed at */
	dropLit?: string | null;
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
			// rows scrolled up fade out under the path rather than run through it
			className="absolute inset-0 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent_2.5rem,black_5rem)]"
			// the canvas under it has nothing to marquee or pan here: a press is the list's
			onPointerDown={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
		>
			<div
				ref={list}
				data-page-list-rows=""
				className="mx-auto mt-20 mb-16 flex w-[min(560px,calc(100%-48px))] flex-col"
				style={{
					transform: aside > 0 ? `translateX(${-aside}px)` : "none",
					transition: "transform var(--transition-duration-slow) var(--ease-snap)",
				}}
			>
				{rows.map((row) => (
					<button
						type="button"
						key={row.page}
						tabIndex={-1}
						data-page-row={row.page}
						data-drop-page={row.page}
						data-drop-at="list"
						data-peek-from="list"
						data-drop-lit={row.page === dropLit ? "" : undefined}
						aria-current={row.page === lit ? "true" : undefined}
						aria-label={`${row.name}, ${holdsLine(row)}`}
						// a move, not an arrival: a list drawn under a resting pointer keeps its first row lit
						onPointerMove={() => row.page !== lit && onLight(row.page)}
						onClick={() => onGo(row.page)}
						className={cn(
							"flex h-16 cursor-pointer items-center gap-3 rounded-md px-2 text-left transition-colors duration-fast ease-out",
							row.page === dropLit ? "bg-accent-subtle" : row.page === lit && "bg-state-hover",
						)}
					>
						<Thumbnail className="h-11 w-15" src={stillOf(row)} />
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span
								className={cn(
									"truncate type-value",
									row.page === dropLit ? "text-accent-strong" : "text-primary",
								)}
							>
								{row.name}
								{row.place !== undefined && <span className="ml-2 text-tertiary">{row.place}</span>}
							</span>
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
