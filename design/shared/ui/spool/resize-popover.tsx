import { AnimatePresence, motion, useIsPresent } from "motion/react";
import type { ReactNode, Ref } from "react";

const EASE = [0.23, 1, 0.32, 1] as const;

/** A menu that changes pages and height while keeping its footer anchor. */
export function ResizePopover({
	ref,
	open,
	view,
	still,
	children,
}: {
	ref?: Ref<HTMLDivElement> | undefined;
	open: boolean;
	view: string;
	still: boolean;
	children: ReactNode;
}) {
	return (
		<AnimatePresence initial={false} custom={still}>
			{open ? (
				<motion.div
					key="picker"
					ref={ref}
					data-resize-popover=""
					className="absolute bottom-full left-0 z-30 mb-2 w-[320px] max-w-full"
					style={{ transformOrigin: "bottom left" }}
					initial={still ? false : { opacity: 0, transform: "translateY(4px) scale(0.98)" }}
					animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
					variants={{
						leave: (instant: boolean) => ({
							opacity: 0,
							transform: instant ? "none" : "translateY(3px) scale(0.99)",
							transition: { duration: instant ? 0 : 0.1 },
						}),
					}}
					exit="leave"
					transition={{ duration: still ? 0 : 0.18, ease: EASE }}
				>
					<PresenceContents>
						<motion.div
							// Height changes also move the top of this bottom-anchored surface.
							// Size-only layout animation leaves that move out and lifts its bottom edge.
							layout={!still}
							className="overflow-hidden border border-border-raised bg-surface"
							style={{ borderRadius: 8, originY: 1 }}
							transition={{ layout: { duration: still ? 0 : 0.18, ease: EASE } }}
						>
							<AnimatePresence initial={false} mode="popLayout" custom={still}>
								<motion.div
									key={view}
									layout={still ? false : "position"}
									initial={still ? false : { opacity: 0 }}
									animate={{ opacity: 1 }}
									variants={{
										leave: (instant: boolean) => ({
											opacity: 0,
											transition: { duration: instant ? 0 : 0.1 },
										}),
									}}
									exit="leave"
									transition={{ duration: still ? 0 : 0.1 }}
								>
									<PresenceContents>{children}</PresenceContents>
								</motion.div>
							</AnimatePresence>
						</motion.div>
					</PresenceContents>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

function PresenceContents({ children }: { children: ReactNode }) {
	const present = useIsPresent();
	return (
		<div data-resize-content="" className="contents" inert={!present} aria-hidden={!present || undefined}>
			{children}
		</div>
	);
}
