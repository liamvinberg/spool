import { useEffect, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { PlayedTab } from "../../../shared/ui/browser-tab";
import { TidemarkLanding } from "../../../shared/ui/tidemark-landing";

/**
 * play-tab--pill: one small thing in one corner.
 *
 * The bar across the bottom is what broke: a full width pill is guaranteed to
 * land on the page's own bottom edge, which is where products put their primary
 * call to action and their footer. So this keeps the name and the exit and
 * throws the width away. It is 32px tall, it sits in the bottom right inset
 * 20px, and it spans nothing.
 *
 * It is drawn here at the page's own bottom, scrolled all the way down, which is
 * the worst case for anything bottom anchored: it has to share that corner with
 * the footer or it does not work. That is a bet on one corner being free, which
 * is why the hotkey is printed on the face of the pill rather than filed in a
 * shortcuts sheet. On the page where the bet loses, the reader takes the chrome
 * away without leaving the page and without being taught anything first.
 *
 * alt h hides it and brings it back. The × closes the tab, which is the same exit
 * the bare proposal has, offered as a button for the hand that is already on the
 * mouse.
 */

export default function PlayTabPillFrame() {
	const [shown, setShown] = useState(true);
	const [closed, setClosed] = useState(false);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.altKey && event.code === "KeyH") setShown((s) => !s);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<PlayedTab title="landing · tidemark" url="127.0.0.1:7766/play/tidemark?frame=landing">
			<TidemarkLanding />
			<div
				className={cn(
					"absolute right-5 bottom-5 flex h-8 items-center gap-2.5 rounded-lg border border-border-raised bg-raised/85 pr-1.5 pl-3 backdrop-blur-sm transition-[opacity,translate] duration-200",
					shown && !closed ? "opacity-100" : "pointer-events-none translate-y-1.5 opacity-0",
				)}
			>
				<span className="flex items-center gap-2 font-mono text-sm text-text leading-none">
					<span className="h-[2px] w-2 bg-thread" />
					landing
				</span>
				<span className="h-3 w-px bg-border-raised" />
				<span className="font-mono text-2xs text-muted leading-none">alt h hides</span>
				<button
					type="button"
					aria-label="Close the tab"
					className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-xs text-muted transition-colors hover:bg-surface hover:text-text"
					onClick={() => setClosed(true)}
				>
					<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
						<path d="M2 2 8 8M8 2 2 8" />
					</svg>
				</button>
			</div>
			{/* the tab closing, mocked: spool opened this window, so window.close() is
			    allowed to shut it, and what is behind it is the canvas tab. */}
			<button
				type="button"
				onClick={() => setClosed(false)}
				className={cn(
					"absolute inset-0 flex cursor-pointer items-center justify-center bg-bg font-mono text-muted text-sm leading-none transition-opacity duration-300",
					closed ? "opacity-100" : "pointer-events-none opacity-0",
				)}
			>
				tab closed · the canvas is the tab on the left
			</button>
		</PlayedTab>
	);
}
