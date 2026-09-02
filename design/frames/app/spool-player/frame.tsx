import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { TidemarkLanding } from "shared/ui/demo/tidemark-landing";

/**
 * The player (#234): a played frame is a real browser tab, and spool's only chrome
 * is a bar that lives off screen and peels in at the top edge.
 *
 * Borrowed from the one control surface everybody already knows how to dismiss:
 * a video player. At rest there is nothing, so the page is bare.
 * Rest the cursor in the top 12px and a 40px bar comes down;
 * move back into the page and it goes away. That buys room for controls a corner
 * pill cannot hold — back to the canvas, and a switcher that walks to another
 * frame without a round trip through the canvas tab.
 *
 * The reveal is a dwell, the way a hidden macOS menu bar works: the cursor has
 * to rest against the page's top edge for 300ms before the bar comes down.
 * Passing through on the way to the browser chrome never triggers it, and the
 * page's own nav sits below the strip, so using it never does either. Here the
 * page's top edge is the line under the mocked url bar; in the real thing it is
 * the literal top of the viewport. A 40px wide nub stays at the edge while the
 * bar is away, because a control with no resting trace is a control most people
 * never find.
 *
 * The frame switcher is the reason this shape earns its cost. Closed by default,
 * because that is how it will be seen nine times in ten.
 */

const FRAMES = ["home", "landing", "pricing", "docs", "changelog", "sign-up"];

export default function SpoolPlayerFrame() {
	const [revealed, setRevealed] = useState(false);
	const [picking, setPicking] = useState(false);
	const stripRef = useRef<HTMLDivElement>(null);
	const dwell = useRef<number>(undefined);

	// hiding is still instant — only the reveal earns a dwell
	useEffect(() => {
		const onMove = (event: PointerEvent) => {
			const top = stripRef.current?.getBoundingClientRect().top ?? 0;
			if (event.clientY - top > 140 && !picking) setRevealed(false);
		};
		window.addEventListener("pointermove", onMove);
		return () => window.removeEventListener("pointermove", onMove);
	}, [picking]);

	return (
		<PlayedTab title="landing · tidemark" url="127.0.0.1:7766/play/tidemark?frame=landing">
			<TidemarkLanding />

			<div
				ref={stripRef}
				className="absolute inset-x-0 top-0 z-20 h-2"
				onPointerEnter={() => {
					dwell.current = window.setTimeout(() => setRevealed(true), 300);
				}}
				onPointerLeave={() => window.clearTimeout(dwell.current)}
			/>

			<span
				className={cn(
					"pointer-events-none absolute top-0 left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-b-full bg-border-raised transition-opacity duration-200",
					revealed ? "opacity-0" : "opacity-70",
				)}
			/>

			<div
				className={cn(
					"absolute inset-x-0 top-0 transition-[translate,opacity] duration-200 ease-out",
					revealed ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0",
				)}
			>
				<div className="relative z-10 flex h-10 items-center gap-3 border-border-raised border-b bg-raised px-4">
					<button
						type="button"
						data-go="spool-canvas"
						aria-label="Back to the canvas"
						className="flex cursor-pointer items-center gap-1.5 rounded-xs py-1 pr-2 pl-1 font-mono text-muted text-2xs leading-none transition-colors hover:text-text"
					>
						<svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="m10 3.5-4.5 4.5 4.5 4.5" />
						</svg>
						canvas
					</button>
					<span className="h-3.5 w-px bg-border-raised" />
					<button
						type="button"
						onClick={() => setPicking((p) => !p)}
						className="-mx-1.5 flex cursor-pointer items-center gap-2 rounded-xs px-1.5 py-1 font-mono text-sm text-text leading-none transition-colors hover:bg-surface"
					>
						<span className="text-muted">tidemark /</span>
						landing
						<svg viewBox="0 0 10 10" className={cn("h-2.5 w-2.5 text-muted transition-transform", picking && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="m2 4 3 3 3-3" />
						</svg>
					</button>
					<span className="ml-auto flex items-center gap-3">
						<span className="font-mono text-2xs text-muted leading-none">cmd w exits</span>
						<span className="h-3.5 w-px bg-border-raised" />
						<button
							type="button"
							aria-label="Close the tab"
							className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-xs text-muted transition-colors hover:bg-surface hover:text-text"
						>
							<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
								<path d="M2 2 8 8M8 2 2 8" />
							</svg>
						</button>
					</span>
				</div>

				{/* the scrim a video player draws under its controls: the page is not
				    cut in half by the bar's edge, it fades under it */}
				<div className="pointer-events-none absolute inset-x-0 top-10 h-14 bg-gradient-to-b from-bg to-transparent" />

				<div
					className={cn(
						"relative z-10 ml-[104px] w-[212px] overflow-hidden rounded-b-lg border-border-raised border-r border-b border-l bg-canvas transition-[opacity,translate] duration-150",
						picking ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
					)}
				>
					<div className="flex flex-col p-1.5">
						{FRAMES.map((name) => (
							<button
								key={name}
								type="button"
								onClick={() => setPicking(false)}
								className={cn(
									"flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-left font-mono text-sm leading-none transition-colors hover:bg-surface",
									name === "landing" ? "text-text" : "text-muted hover:text-text",
								)}
							>
								<span className={cn("h-[2px] w-2", name === "landing" ? "bg-thread" : "bg-transparent")} />
								{name}
							</button>
						))}
					</div>
					<div className="border-border border-t px-3.5 py-2 font-mono text-2xs text-muted leading-none">
						6 frames · cmd k
					</div>
				</div>
			</div>
		</PlayedTab>
	);
}
