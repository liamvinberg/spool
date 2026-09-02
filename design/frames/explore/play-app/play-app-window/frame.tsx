import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
	AppWindow,
	CANVAS_RECT,
	Desk,
	DeskCaption,
	DeskControl,
	PlayerSlimBar,
} from "shared/ui/explore/play-app/desk";
import { SpoolCanvasScreen } from "shared/ui/spool/canvas-screen";
import { TidemarkLanding } from "shared/ui/demo/tidemark-landing";

/**
 * play-app--window: play opens a second window, and spool draws its bar.
 *
 * This is the shape closest to what the app already does — `window.open` on a
 * daemon URL is allowed through, so Electron opens a second BrowserWindow — with
 * the part nobody decided filled in. Today that window arrives with the OS title
 * bar and the URL as its title. Here it arrives with a 30px bar spool owns:
 * traffic lights inset into it, project and frame, the switcher, the size, and
 * close. `titleBarStyle: "hiddenInset"` is exactly this.
 *
 * The bar is permanent, which is the trade against --bare: 30px of page is gone
 * forever, and in exchange the frame's name is always readable, the switcher is
 * always one press away, and nothing has to be discovered by resting a cursor
 * somewhere.
 *
 * The canvas window stays exactly where it was and goes inactive: its lights go
 * grey, its title dims. That is the whole argument for a second window — the two
 * are on screen together, and ⌘` swaps which one is in front.
 */

const PLAYER_RECT = { x: 560, y: 214, w: 1280, h: 900 };

export default function PlayAppWindowFrame() {
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
					<AppWindow
						rect={PLAYER_RECT}
						chrome="slim"
						bar={
							<PlayerSlimBar
								frame="landing"
								note="1280 × 870"
								onCanvas={() => setPlaying(false)}
								onClose={() => setPlaying(false)}
							/>
						}
					>
						<div className="h-full w-full bg-[#0A0A0B]">
							<TidemarkLanding cap={1200} />
						</div>
					</AppWindow>
				</motion.div>
			)}

			<DeskControl
				playing={playing}
				onToggle={() => setPlaying((p) => !p)}
				label="play landing"
				note="the canvas stays where it is, one ⌘` away"
			/>
			<DeskCaption>
				a second window with a bar spool draws: name, switcher and size always readable, 30px of page always spent.
			</DeskCaption>
		</Desk>
	);
}
