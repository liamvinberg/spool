import type { FrameCollision } from "../api";

/**
 * Two folders claiming one frame name (#39): identity is ambiguous, so the
 * canvas says so plainly instead of guessing which folder wins.
 */
export function CollisionNotice({ collisions }: { collisions: FrameCollision[] }) {
	return (
		<div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-1.5">
			{collisions.map((collision) => (
				<div
					key={collision.name}
					className="rounded-md border border-border-raised bg-raised px-3 py-1.5 font-mono text-2xs leading-3"
				>
					<span className="text-thread">two frames named "{collision.name}"</span>
					<span className="text-muted">: {collision.paths.join(" · ")}</span>
				</div>
			))}
		</div>
	);
}
