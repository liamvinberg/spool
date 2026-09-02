import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { AppWindow, CANVAS_RECT, CanvasButton, Desk, DeskCaption, DeskControl, EdgeBar } from "../../../shared/ui/spool-desk";
import { SpoolCanvasScreen } from "../../../shared/ui/spool-canvas-screen";
import { TidemarkLanding } from "../../../shared/ui/tidemark-landing";

/**
 * play-app--bare: a second window with no bar at all.
 *
 * The same window as --window with the 30px given back. There is no title bar,
 * so the page starts at the window's own top edge and the three lights float on
 * top of it, which is what a video app does with a movie. Everything the slim
 * bar carried moves into the edge bar, summoned by the same 300ms dwell the
 * browser player already ships — so the two players are one control surface with
 * two containers, rather than two products.
 *
 * What this is really asking: does a window whose whole content is somebody
 * else's page want any spool in it at all. The lights are unavoidable — a
 * window has to be closable when nothing is revealed — and they are also the
 * one thing that gives a page a corner it did not design.
 */

const PLAYER_RECT = { x: 560, y: 214, w: 1280, h: 900 };

export default function PlayAppBareFrame() {
	const [playing, setPlaying] = useState(false);
	const reduce = useReducedMotion() === true;

	return (
		<Desk>
			<AppWindow rect={CANVAS_RECT} title="kaffe · spool" active={!playing}>
				<SpoolCanvasScreen variant="rest" />
				<div
					className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-200"
					style={{ opacity: playing ? 0.32 : 0 }}
				/>
			</AppWindow>

			{playing && (
				<motion.div
					initial={reduce ? false : { opacity: 0, scale: 0.985, y: 8 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					transition={{ duration: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
					style={{ transformOrigin: "50% 60%" }}
				>
					<AppWindow rect={PLAYER_RECT} chrome="bare">
						<div className="h-full w-full bg-[#0A0A0B]">
							<TidemarkLanding cap={1200} />
						</div>
						<EdgeBar frame="landing" exitLabel="cmd w closes">
							<CanvasButton onClick={() => setPlaying(false)} />
						</EdgeBar>
					</AppWindow>
				</motion.div>
			)}

			<DeskControl
				playing={playing}
				onToggle={() => setPlaying((p) => !p)}
				label="play landing"
				note="rest the cursor at the window's top edge"
			/>
			<DeskCaption>
				no bar. the page owns all four edges and the lights float on it; everything else is a dwell away.
			</DeskCaption>
		</Desk>
	);
}
