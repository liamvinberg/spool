import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { AppWindow, CANVAS_RECT, CanvasButton, Desk, DeskCaption, DeskControl, EdgeBar } from "../../../shared/ui/spool-desk";
import { SpoolCanvasScreen } from "../../../shared/ui/spool-canvas-screen";
import { TidemarkLanding } from "../../../shared/ui/tidemark-landing";

/**
 * play-app--takeover: one window, and play is a state it is in.
 *
 * The window you already have becomes the prototype. The canvas does not close,
 * it goes under: the page comes up over it and the edge bar is the way back, the
 * same bar and the same dwell the browser player ships. Nothing new appears in
 * the Dock, ⌘` finds nothing, Mission Control shows one Spool.
 *
 * The argument for it is that a prototype deserves the whole window and most
 * people have one screen. The argument against it is the one thing a canvas is
 * for: you cannot see the frame and the thing you are changing at the same time.
 *
 * The title bar is the OS's and stays put, so the swap happens strictly inside
 * the content area — which is also the honest drawing of it, since Electron
 * would be loading a second URL into the same BrowserWindow.
 */

export default function PlayAppTakeoverFrame() {
	const [playing, setPlaying] = useState(false);
	const reduce = useReducedMotion() === true;
	const beat = reduce ? { duration: 0 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const };

	return (
		<Desk>
			<AppWindow rect={CANVAS_RECT} title={playing ? "landing · tidemark" : "kaffe · spool"}>
				<motion.div
					className="absolute inset-0"
					animate={{ opacity: playing ? 0 : 1, scale: playing ? 0.985 : 1 }}
					transition={beat}
				>
					<SpoolCanvasScreen variant="rest" />
				</motion.div>
				<motion.div
					className={cn("absolute inset-0 bg-[#0A0A0B]", !playing && "pointer-events-none")}
					initial={false}
					animate={{ opacity: playing ? 1 : 0 }}
					transition={beat}
				>
					<TidemarkLanding cap={1200} />
					{playing && (
						<EdgeBar frame="landing" exitLabel="esc goes back">
							<CanvasButton onClick={() => setPlaying(false)} />
						</EdgeBar>
					)}
				</motion.div>
			</AppWindow>

			<DeskControl
				playing={playing}
				onToggle={() => setPlaying((p) => !p)}
				label="play landing"
				note="dwell at the page's top edge for the bar"
			/>
			<DeskCaption>
				one window. play is a state, not a second thing to arrange — and the canvas is gone while you read.
			</DeskCaption>
		</Desk>
	);
}
