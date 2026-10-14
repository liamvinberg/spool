import type { ReactNode } from "react";

/**
 * Where the canvas says things: one column, centred above the canvas tools, newest at the foot. Every notice on
 * the canvas stands here, so two never cover each other: a confirmation, the Trash's undo, the sync's state and
 * its clashes. Each notice is a `Toast` and owns its own life; the stack only places them.
 */
export function NoticeStack({ children }: { children: ReactNode }) {
	return (
		<section
			aria-label="Notices"
			data-notices=""
			className="-translate-x-1/2 pointer-events-none absolute bottom-[120px] left-1/2 z-30 flex flex-col items-center gap-2 *:pointer-events-auto"
			onPointerDown={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			{children}
		</section>
	);
}
