import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import {
	AppWindow,
	CANVAS_RECT,
	Desk,
	DeskCaption,
	DESK_H,
	DESK_W,
	MENU_H,
	PlayerSlimBar,
	type WindowRect,
} from "../../../shared/ui/spool-desk";
import { SpoolCanvasScreen } from "../../../shared/ui/spool-canvas-screen";
import { TidemarkLanding } from "../../../shared/ui/tidemark-landing";

/**
 * play-app--remembered: it opens where you left it.
 *
 * --fit is a good first answer and a bad second one. The moment someone drags
 * the window somewhere and sizes it to their liking, opening it anywhere else is
 * the app forgetting something it was told. So the rule has two halves and they
 * are not in conflict: the authored width is the *default*, and a window a hand
 * has moved is a *preference* that outlives the window.
 *
 * What the memory is keyed on is the whole design question, and the answer is
 * not "the app". It is per project and per authored width: play a 1200 frame and
 * you get the 1200 window you arranged, play a 390 frame and you get the phone
 * window you arranged, and neither inherits the other's rectangle. One key, two
 * numbers: `{ project, authoredWidth } -> rect`.
 *
 * The restore says so once, quietly, in the bar — a person who did not mean to
 * move the window last week needs to know why this one is 830 wide, and needs
 * the door back. Pressing "reset" puts it back on the authored width and forgets
 * the rectangle.
 */

const DEFAULT_RECT: WindowRect = { x: DESK_W - 1200, y: MENU_H, w: 1200, h: DESK_H - MENU_H };
const REMEMBERED_RECT: WindowRect = { x: 1012, y: 156, w: 830, h: 1000 };

export default function PlayAppRememberedFrame() {
	const [playing, setPlaying] = useState(false);
	const [remembered, setRemembered] = useState(true);
	const reduce = useReducedMotion() === true;
	const rect = remembered ? REMEMBERED_RECT : DEFAULT_RECT;

	return (
		<Desk>
			<AppWindow rect={CANVAS_RECT} title="kaffe · spool" active={!playing}>
				<SpoolCanvasScreen variant="rest" />
				<div
					className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-200"
					style={{ opacity: playing ? 0.32 : 0 }}
				/>
			</AppWindow>

			{playing && remembered && <Ghost rect={DEFAULT_RECT} />}

			{playing && (
				<motion.div
					initial={reduce ? false : { opacity: 0, scale: 0.99 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
				>
					<motion.div
						layout={!reduce}
						transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
					>
						<AppWindow
							rect={rect}
							chrome="slim"
							bar={
								<PlayerSlimBar
									frame="landing"
									note={
										<span className="flex items-center gap-2">
											{remembered && <RestoredNote onReset={() => setRemembered(false)} />}
											{rect.w} × {rect.h}
										</span>
									}
									onCanvas={() => setPlaying(false)}
									onClose={() => setPlaying(false)}
								/>
							}
						>
							<div className="h-full w-full bg-[#0A0A0B]">
								<TidemarkLanding />
							</div>
						</AppWindow>
					</motion.div>
				</motion.div>
			)}

			<div className="-translate-x-1/2 absolute bottom-6 left-1/2 z-40 flex items-center gap-3 rounded-full border border-white/10 bg-black/55 px-4 py-2 backdrop-blur-md">
				<button
					type="button"
					onClick={() => setPlaying((p) => !p)}
					className="flex cursor-pointer items-center gap-2 font-mono text-text text-xs leading-none"
				>
					<span className="h-[2px] w-2.5 bg-thread" />
					{playing ? "close" : "play landing"}
				</button>
				<span className="h-3 w-px bg-white/12" />
				<button
					type="button"
					onClick={() => setRemembered((r) => !r)}
					className={cn(
						"cursor-pointer font-mono text-2xs leading-none transition-colors",
						remembered ? "text-[#9A9AA0] hover:text-text" : "text-text",
					)}
				>
					{remembered ? "forget the size" : "sized by hand again"}
				</button>
			</div>
			<DeskCaption>
				the authored width is the default; a window a hand moved is a preference, keyed per project and per width.
			</DeskCaption>
		</Desk>
	);
}

/** Where it would have opened, drawn once so the memory is visible rather than inferred. */
function Ghost({ rect }: { rect: WindowRect }) {
	return (
		<div
			className="pointer-events-none absolute z-10 rounded-[10px] border border-white/14 border-dashed"
			style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
		>
			<span className="absolute top-2.5 left-3.5 font-mono text-[#7C7C82] text-2xs leading-none">
				default · {rect.w} × {rect.h}
			</span>
		</div>
	);
}

/** Said once and then gone, the way a toast is. The door back stays. */
function RestoredNote({ onReset }: { onReset: () => void }) {
	const [shown, setShown] = useState(true);
	useEffect(() => {
		const timer = window.setTimeout(() => setShown(false), 2600);
		return () => window.clearTimeout(timer);
	}, []);
	return (
		<AnimatePresence initial={false}>
			{shown && (
				<motion.span
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
					className="flex items-center gap-1.5 font-mono text-2xs text-muted leading-none"
				>
					<span className="h-[2px] w-2 bg-thread" />
					restored
					<button
						type="button"
						onClick={onReset}
						className="cursor-pointer text-muted underline decoration-border-raised underline-offset-2 transition-colors hover:text-text"
					>
						reset
					</button>
					<span className="h-3 w-px bg-border-raised" />
				</motion.span>
			)}
		</AnimatePresence>
	);
}
