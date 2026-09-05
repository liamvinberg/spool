import { useState } from "react";
import { LINK, type ShareMode, countOf } from "shared/lib/explore/share/share-link";
import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * What the person on the other end of the link gets: a browser tab with the
 * prototype in it, live and clickable, and one bar of spool.
 *
 * The bar is the player's, with the one thing a guest needs that a designer
 * does not — who sent this and whether it is still moving. There is no canvas
 * to go back to, no frame source, no account: pressing a screen walks the flow
 * and that is the whole of what they can do. Everything else spool knows about
 * this project stays on the other side of the link.
 *
 * It rests off screen the same way it does in the player (#234), so the
 * prototype is a bare page a second after it opens; the frames draw it down,
 * because the state worth showing is the one that says what this is.
 */

const FLOW: readonly CoffeeScreenName[] = ["menu", "cart", "receipt"];
/** the link was minted on cart, so cart is where a guest lands */
const LANDING: CoffeeScreenName = "cart";

export function GuestView({
	mode = "live",
	sender = "Liam",
	revealed = true,
}: {
	mode?: ShareMode;
	sender?: string;
	/** the bar down, which is how the link opens and what these frames show */
	revealed?: boolean;
}) {
	const [screen, setScreen] = useState<CoffeeScreenName>(LANDING);
	const [picking, setPicking] = useState(false);
	const index = FLOW.indexOf(screen);
	const advance = () => setScreen(FLOW[Math.min(index + 1, FLOW.length - 1)] ?? screen);
	return (
		<PlayedTab title="cart · kaffe" sibling="Kaffe" url={`${LINK}?frame=cart`}>
			<div className="relative h-full w-full overflow-hidden bg-bg font-mono text-text antialiased [font-synthesis:none]">
				<div className="-translate-x-1/2 absolute top-[34px] left-1/2 h-[706px] w-[390px]">
					<CoffeeScreen screen={screen} scale="full" />
					{/* the product's own action, pressable: a guest walks the flow by using it */}
					<button
						type="button"
						aria-label="Continue"
						className="absolute right-6 bottom-6 left-6 h-12 cursor-pointer rounded-md opacity-0"
						onClick={advance}
					/>
				</div>

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
						<span className="flex items-center gap-2">
							<SpoolMark className="h-3.5 w-[11px] text-thread" />
							<span className="text-2xs text-muted leading-none">{sender} shared this</span>
						</span>
						<span className="h-3.5 w-px bg-border-raised" />
						<button
							type="button"
							onClick={() => setPicking((open) => !open)}
							className="-mx-1.5 flex cursor-pointer items-center gap-2 rounded-xs px-1.5 py-1 text-sm text-text leading-none transition-colors hover:bg-surface"
						>
							<span className="text-muted">kaffe /</span>
							{screen}
							<svg
								viewBox="0 0 10 10"
								className={cn("h-2.5 w-2.5 text-muted transition-transform", picking && "rotate-180")}
								fill="none"
								stroke="currentColor"
								strokeWidth="1.4"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="m2 4 3 3 3-3" />
							</svg>
						</button>
						<span className="ml-auto flex items-center gap-3">
							{/* the fork, as the guest feels it: a link that keeps up, or a moment */}
							<span className="flex items-center gap-1.5 text-2xs text-muted leading-none">
								<span
									className={cn(
										"h-1.5 w-1.5 rounded-full",
										mode === "live" ? "bg-thread" : "border border-muted",
									)}
									aria-hidden="true"
								/>
								{mode === "live" ? "live · saves reach you" : "frozen · sent 14:02"}
							</span>
							<span className="h-3.5 w-px bg-border-raised" />
							<button
								type="button"
								onClick={() => setScreen(LANDING)}
								className="cursor-pointer rounded-xs px-1 py-1 text-2xs text-muted leading-none transition-colors hover:text-text"
							>
								restart
							</button>
						</span>
					</div>

					{/* the scrim the player draws under its bar, so the page fades under it rather
					    than being cut by an edge */}
					<div className="pointer-events-none absolute inset-x-0 top-10 h-14 bg-gradient-to-b from-bg to-transparent" />

					<div
						className={cn(
							"relative z-10 ml-[132px] w-[212px] overflow-hidden rounded-b-lg border-border-raised border-r border-b border-l bg-canvas transition-[opacity,translate] duration-150",
							picking ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
						)}
					>
						<div className="flex flex-col p-1.5">
							{FLOW.map((name) => (
								<button
									key={name}
									type="button"
									onClick={() => {
										setScreen(name);
										setPicking(false);
									}}
									className={cn(
										"flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-left text-sm leading-none transition-colors hover:bg-surface",
										name === screen ? "text-text" : "text-muted hover:text-text",
									)}
								>
									<span className={cn("h-[2px] w-2", name === screen ? "bg-thread" : "bg-transparent")} />
									{name}
								</button>
							))}
						</div>
						<div className="border-border border-t px-3.5 py-2 text-2xs text-muted leading-none">
							{countOf("flow")} in this link
						</div>
					</div>
				</div>

				<div className="-translate-x-1/2 absolute bottom-6 left-1/2 flex items-center gap-2 text-2xs text-muted leading-none">
					made in spool
				</div>
			</div>
		</PlayedTab>
	);
}
