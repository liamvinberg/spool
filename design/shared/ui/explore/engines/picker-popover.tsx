import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.23, 1, 0.32, 1] as const;

/** The chosen picker keeps its footer anchor while its contents change. */
export function PickerPopover({
	open,
	view,
	still,
	children,
}: {
	open: boolean;
	view: string;
	still: boolean;
	children: ReactNode;
}) {
	return (
		<AnimatePresence initial={false}>
			{open ? (
				<motion.div
					key="picker"
					data-picker-popover=""
					className="absolute bottom-full left-0 z-30 mb-2 w-[320px] max-w-full"
					style={{ transformOrigin: "bottom left" }}
					initial={still ? false : { opacity: 0, transform: "translateY(4px) scale(0.98)" }}
					animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
					exit={{
						opacity: 0,
						transform: still ? "none" : "translateY(3px) scale(0.99)",
						transition: { duration: still ? 0 : 0.1 },
					}}
					transition={{ duration: still ? 0 : 0.18, ease: EASE }}
				>
					<motion.div
						// Height changes also move the top of this bottom-anchored surface.
						// Size-only layout animation leaves that move out and lifts its bottom edge.
						layout={!still}
						className="overflow-hidden border border-border-raised bg-surface"
						style={{ borderRadius: 8, originY: 1 }}
						transition={{ layout: { duration: still ? 0 : 0.18, ease: EASE } }}
					>
						<AnimatePresence initial={false} mode="popLayout">
							<motion.div
								key={view}
								layout={still ? false : "position"}
								initial={still ? false : { opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: still ? 0 : 0.1 }}
							>
								{children}
							</motion.div>
						</AnimatePresence>
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
