// Mirrors src/ui/canvas/collision-notice.tsx.
// FrameCollision is declared here rather than imported from the daemon's api.

/**
 * The canvas's quiet notices, in the one place they are shown.
 *
 * Nothing here interrupts and nothing here moves: a line of mono at the top of
 * the field, in the plain language everything else on the canvas uses. The
 * strip is shared because two notices at the top of one canvas have to stack
 * rather than sit on top of each other.
 */
export function NoticeStrip({ children }: { children: React.ReactNode }) {
	return (
		<div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-1.5">
			{children}
		</div>
	);
}

/** The shape every notice in the strip wears: one mono line on a raised pill. */
export const NOTICE_PILL = "rounded-md border border-border-raised bg-raised px-3 py-1.5 font-mono text-2xs leading-3";

export interface FrameCollision {
	name: string;
	paths: readonly string[];
}

/**
 * Two folders claiming one frame name: identity is ambiguous, so the canvas
 * says so plainly instead of guessing which folder wins.
 */
export function CollisionNotice({ collisions }: { collisions: readonly FrameCollision[] }) {
	return (
		<>
			{collisions.map((collision) => (
				<div key={collision.name} className={NOTICE_PILL}>
					<span className="text-thread">two frames named "{collision.name}"</span>
					<span className="text-muted">: {collision.paths.join(" · ")}</span>
				</div>
			))}
		</>
	);
}
