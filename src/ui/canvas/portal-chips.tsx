import { type PortalMarker, pageLabel } from "./pages";

/**
 * A link leaving the page (#39): no drawable arrow, so a chip at the frame
 * edge names the target and its page — activating it jumps there. Counter-
 * scaled like the frame label, so chips hold screen size at any zoom.
 */
export function PortalChips({
	portals,
	k,
	onJump,
}: {
	portals: PortalMarker[];
	k: number;
	onJump: (frame: string) => void;
}) {
	return (
		<div className="absolute top-full left-0 origin-top-left" style={{ transform: `scale(${1 / k})` }}>
			<div className="flex flex-col items-start gap-1 pt-2.5">
				{portals.map((portal) => (
					<button
						key={portal.to}
						type="button"
						data-portal={portal.to}
						title={`Jump to ${portal.to} on ${pageLabel(portal.toPage)}`}
						onClick={() => onJump(portal.to)}
						className="flex items-center gap-1.5 whitespace-nowrap rounded-xs border border-border-raised bg-raised px-2 py-[3px] font-mono text-2xs text-muted leading-3 hover:border-thread hover:text-text"
					>
						<span>→ {portal.to}</span>
						<span className="opacity-60">· {pageLabel(portal.toPage)}</span>
					</button>
				))}
			</div>
		</div>
	);
}
