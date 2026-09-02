import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { AppWindow, CANVAS_RECT, Desk, DeskCaption, DeskControl, PlayerSlimBar } from "../../../shared/ui/spool-desk";
import { SpoolCanvasScreen } from "../../../shared/ui/spool-canvas-screen";
import { TidemarkLanding } from "../../../shared/ui/tidemark-landing";

/**
 * play-app--sheet: the page lifts over the canvas, inside the one window.
 *
 * The middle of the three. There is still only one window, so nothing has to be
 * arranged, but the canvas is not gone — it is behind, dimmed, and pressing the
 * dim puts the sheet away. This is the shape the browser player was measured
 * against on the `play-inline` page and lost, and it is worth asking again here
 * because a native window changes one of the two objections: there is no browser
 * chrome above it stealing the page's top edge.
 *
 * The other objection stands and is the reason to be suspicious of it. The sheet
 * is 1200 wide because the frame is authored at 1200, and the window is 1420, so
 * the page gets its real width by luck. On a laptop the sheet is narrower than
 * the frame and the page is being read at a width nobody designed — the exact
 * lie #227 refused when it took `transform: scale` out of the player.
 */

const SHEET_W = 1200;

export default function PlayAppSheetFrame() {
	const [playing, setPlaying] = useState(false);
	const reduce = useReducedMotion() === true;
	const beat = { duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] as const };

	return (
		<Desk>
			<AppWindow rect={CANVAS_RECT} title="kaffe · spool">
				<motion.div
					className="absolute inset-0"
					initial={false}
					animate={{ scale: playing ? 0.99 : 1 }}
					transition={beat}
				>
					<SpoolCanvasScreen variant="rest" />
				</motion.div>

				<motion.button
					type="button"
					aria-label="Put the sheet away"
					onClick={() => setPlaying(false)}
					className="absolute inset-0 z-10 cursor-default bg-black"
					initial={false}
					animate={{ opacity: playing ? 0.5 : 0 }}
					transition={beat}
					style={{ pointerEvents: playing ? "auto" : "none" }}
				/>

				<motion.div
					className="absolute z-20 flex flex-col overflow-hidden rounded-lg border border-border-raised"
					style={{
						left: (CANVAS_RECT.w - SHEET_W) / 2,
						top: 36,
						width: SHEET_W,
						bottom: 36,
						boxShadow: "0 30px 60px rgba(0,0,0,.55)",
					}}
					initial={false}
					animate={{
						opacity: playing ? 1 : 0,
						y: playing ? 0 : 14,
						pointerEvents: playing ? "auto" : "none",
					}}
					transition={beat}
				>
					<div className="flex h-[30px] shrink-0 items-center border-border border-b bg-bg pr-3.5 pl-1">
						<PlayerSlimBar frame="landing" note="1200 × 840" onCanvas={() => setPlaying(false)} onClose={() => setPlaying(false)} />
					</div>
					<div className="min-h-0 flex-1 bg-[#0A0A0B]">
						<TidemarkLanding />
					</div>
				</motion.div>
			</AppWindow>

			<DeskControl
				playing={playing}
				onToggle={() => setPlaying((p) => !p)}
				label="play landing"
				note="press the dim to put it away"
			/>
			<DeskCaption>
				one window, canvas still behind it. the page only gets its authored width while the window is wide enough.
			</DeskCaption>
		</Desk>
	);
}
