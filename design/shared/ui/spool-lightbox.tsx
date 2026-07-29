import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type MouseEvent, type ReactNode, useEffect } from "react";

/**
 * Anything, held over the whole frame until you press esc.
 *
 * It exists because the rail draws a picture at 120px and the thing in it is a
 * screen: a frame the agent wrote, shot, and read back. At that size you can tell
 * *that* it changed and not *what* changed, so the thumbnail was a receipt rather
 * than a look. This is the look.
 *
 * **Why `fixed` is enough.** Every spool frame is its own document, so `fixed
 * inset-0` covers the frame and nothing else — no portal, no root-level state, no
 * prop threaded down through the rail. Whatever wants to open one can own it where
 * it stands.
 *
 * **It holds children rather than an image.** The rail's pictures are not files:
 * `shotView` renders the frame itself at a width, so what goes big here is a live
 * render rather than a bitmap scaled up. Keeping the slot generic is also what
 * makes it worth having once — a diff, a plan, a payload too big for a disclosure
 * all want the same box.
 *
 * **The way out is the way out of everything else.** esc leaves an entered frame
 * on the canvas and stops a running turn (#165), so it leaves this too, and the
 * hint says so in the same mono the canvas uses for `live · esc exits`. A press on
 * the backdrop does the same thing, because the backdrop is the rest of the screen
 * and clicking away from a thing is how you put it down. There is no ✕: it would
 * be a third way to do what the first two already do, and it would have to sit on
 * top of the one thing here worth looking at.
 */
export function Lightbox({
	open,
	onClose,
	caption,
	children,
}: {
	open: boolean;
	onClose: () => void;
	/** what this is, in the machine's own register: a frame name, a path */
	caption?: string | undefined;
	children: ReactNode;
}) {
	const still = useReducedMotion() === true;

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			// this is the innermost thing esc can mean while it is up, so it takes the
			// press rather than letting the canvas behind it act on the same key
			event.stopPropagation();
			onClose();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [open, onClose]);

	return (
		<AnimatePresence>
			{open ? (
				<motion.div
					className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-bg/90 p-10 backdrop-blur-[2px]"
					initial={still ? false : { opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: still ? 0 : 0.16, ease: "linear" }}
					onClick={onClose}
				>
					{/* the press that lands on the picture is not the press that puts it down */}
					<motion.div
						className="flex min-h-0 max-w-full items-center justify-center overflow-auto rounded-sm border border-border-raised bg-bg"
						initial={still ? false : { scale: 0.98 }}
						animate={{ scale: 1 }}
						exit={still ? {} : { scale: 0.98 }}
						transition={{ duration: still ? 0 : 0.18, ease: [0.22, 0.61, 0.36, 1] }}
						onClick={(event: MouseEvent) => event.stopPropagation()}
					>
						{children}
					</motion.div>
					<span className="flex shrink-0 items-center gap-2.5 font-mono text-2xs leading-3">
						{caption === undefined ? null : <span className="truncate text-muted/55">{caption}</span>}
						<span className="text-muted/35">esc</span>
					</span>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
