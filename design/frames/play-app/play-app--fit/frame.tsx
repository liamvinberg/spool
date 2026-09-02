import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/coffee-screens";
import {
	AppWindow,
	CANVAS_RECT,
	Desk,
	DeskCaption,
	DESK_H,
	DESK_W,
	MENU_H,
	PlayerSlimBar,
} from "shared/ui/spool-desk";
import { SpoolCanvasScreen } from "shared/ui/spool-canvas-screen";
import { TidemarkLanding } from "shared/ui/tidemark-landing";

/**
 * play-app--fit: the window opens at the frame's own width and the screen's
 * full height.
 *
 * A second window has one bad habit, which is the one the app has today: it
 * arrives at whatever size Electron felt like, usually small and in the middle,
 * and the first thing anyone does is resize it. There is a size that is never
 * wrong, and spool is the only program on the machine that knows it — the frame
 * was authored at a width, and that width is the width the page was designed to
 * be read at.
 *
 * So: the window is the frame's authored size, and the screen is the only thing
 * allowed to overrule it — width is the authored width, height is the authored
 * height or everything the screen has, whichever is smaller. It snaps to the
 * right edge rather than centring, so the canvas window's own left edge stays
 * uncovered and the pages rail is still readable behind it.
 *
 * Both halves matter, and the first draft of this frame got the second one
 * wrong. A 2400px landing takes the full height, because a long page is judged
 * on how many rows a screen can hold. A 390 x 844 phone frame takes 844 and
 * stops: stretching it to the screen would be spool inventing a device nobody
 * has, which is the same lie as scaling. So play the landing and a tall column
 * arrives; play the cart and a phone stands on the desk at 1:1, beside the
 * canvas that authored it. Nothing in the window says "phone" — the frame's own
 * two numbers did all of it.
 */

type Played = null | "landing" | "cart";

const AVAILABLE_H = DESK_H - MENU_H;

/** What the frames say about themselves: `frame.json`, and nothing else. */
const GEOMETRY = {
	landing: { label: "landing", project: "tidemark", w: 1200, h: 2400 },
	cart: { label: "cart", project: "kaffe", w: 390, h: 844 },
} as const;

function fit(frame: keyof typeof GEOMETRY) {
	const { w, h } = GEOMETRY[frame];
	const height = Math.min(h, AVAILABLE_H);
	return { x: DESK_W - w, y: MENU_H + Math.round((AVAILABLE_H - height) / 2), w, h: height };
}

export default function PlayAppFitFrame() {
	const [played, setPlayed] = useState<Played>(null);
	const reduce = useReducedMotion() === true;
	const geometry = played === null ? null : GEOMETRY[played];
	const rect = played === null ? null : fit(played);

	return (
		<Desk>
			<AppWindow rect={CANVAS_RECT} title="kaffe · spool" active={played === null}>
				<SpoolCanvasScreen variant="rest" />
				<div
					className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-200"
					style={{ opacity: played === null ? 0 : 0.32 }}
				/>
			</AppWindow>

			{rect !== null && geometry !== null && (
				<>
					<motion.div
						key={played}
						initial={reduce ? false : { opacity: 0, x: 26 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: reduce ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
					>
						<AppWindow
							rect={rect}
							chrome="slim"
							className="rounded-none rounded-l-[10px]"
							bar={
								<PlayerSlimBar
									frame={geometry.label}
									project={geometry.project}
									compact={rect.w < 520}
									note={`${rect.w} × ${rect.h}`}
									onCanvas={() => setPlayed(null)}
									onClose={() => setPlayed(null)}
								/>
							}
						>
							{played === "landing" ? (
								<div className="h-full w-full bg-[#0A0A0B]">
									<TidemarkLanding />
								</div>
							) : (
								<CoffeeScreen screen="cart" scale="full" className="h-full w-full" />
							)}
						</AppWindow>
					</motion.div>
				</>
			)}

			<FitControl played={played} onPlay={setPlayed} />
			<DeskCaption>
				the window is the frame's own size, and the screen is the only thing that overrules it: 1200 takes the
				full height, 390 × 844 takes 844 and stops.
			</DeskCaption>
		</Desk>
	);
}

function FitControl({ played, onPlay }: { played: Played; onPlay: (next: Played) => void }) {
	return (
		<div className="-translate-x-1/2 absolute bottom-6 left-1/2 z-40 flex items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-2 backdrop-blur-md">
			{(["landing", "cart"] as const).map((name) => (
				<button
					key={name}
					type="button"
					onClick={() => onPlay(played === name ? null : name)}
					className={cn(
						"flex cursor-pointer items-center gap-2 font-mono text-xs leading-none transition-colors",
						played === name ? "text-text" : "text-[#9A9AA0] hover:text-text",
					)}
				>
					<span className={cn("h-[2px] w-2.5", played === name ? "bg-thread" : "bg-white/25")} />
					play {name} · {GEOMETRY[name].w} × {GEOMETRY[name].h}
				</button>
			))}
			<span className="h-3 w-px bg-white/12" />
			<span className="font-mono text-[#9A9AA0] text-2xs leading-none">press again to close</span>
		</div>
	);
}
