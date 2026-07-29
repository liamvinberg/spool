import {
	DoorPlate,
	PAGE_MID,
	PLATE_TOP,
	PROBE_GUESS,
	PROBE_IN,
	PortLink,
	SiteLocalShell,
} from "../../../shared/ui/site-local-shell";

/**
 * local.spool.page, the browser is blocking the check: the blocked state of the
 * plate direction.
 *
 * The plate direction earns this state for free. The probe already enters from
 * the very top edge of the page, which is where the browser is, so the wall goes
 * exactly where the fix lives: high on the centre line, a few pixels under the
 * chrome, with one mono line pointing up out of the page at the site settings by
 * the address bar. A page that points off itself is honest about who is in
 * charge, and it beats a screenshot of somebody else's popover that goes stale
 * next release.
 *
 * Below the wall the line is a dashed guess rather than a line, and the plate has
 * no footprint on its top edge at all, because nothing arrived. The strip still
 * reads listening: Chrome's site setting is not the end of the page's job, it is
 * a wall it keeps walking into. That is the whole reason there is nothing to
 * press. Grant the permission in the browser and the next check lands on its own.
 *
 * The escape hatch is a plain link rather than a command, because it is the one
 * fix that needs nobody's permission. The plate carries the walk to --found for
 * the same reason it does in every listening state: that is what happens next,
 * without anyone clicking.
 */

const WALL = 152;

export default function SiteLocalBlocked() {
	return (
		<SiteLocalShell footnote="Your work stays on your machine. None of it ever reaches this page.">
			{/* the check, forming and stopped before it ever left */}
			<span className="absolute w-px" style={{ left: PAGE_MID, top: 0, height: WALL, background: PROBE_IN }} />
			<span
				className="absolute -translate-x-1/2 block h-[1.5px] w-[28px] rounded-full bg-text/30"
				style={{ left: PAGE_MID, top: WALL }}
			/>
			<span
				className="absolute flex items-center gap-2 whitespace-nowrap font-mono text-muted text-xs leading-none"
				style={{ left: PAGE_MID + 14, top: WALL - 46 }}
			>
				<UpTick className="h-3 w-2 text-thread" />
				Site settings, by the address bar
			</span>

			{/* past the wall the page is guessing, so it draws a guess */}
			<span
				className="absolute w-px"
				style={{ left: PAGE_MID, top: WALL + 10, height: PLATE_TOP - WALL - 10, background: PROBE_GUESS }}
			/>

			{/* the door, unheard from */}
			<div
				data-go="site-local--found"
				className="absolute -translate-x-1/2 cursor-default"
				style={{ left: PAGE_MID, top: PLATE_TOP }}
			>
				<DoorPlate state="blocked" status="listening" note="cannot see the port" />
			</div>

			{/* what happened, and the fix that is not on this page */}
			<h1
				className="absolute -translate-x-1/2 text-center font-semibold text-[42px] leading-[1.08] tracking-[-0.02em]"
				style={{ left: PAGE_MID, top: 428, width: 840 }}
			>
				Chrome is blocking this page
				<br />
				from reaching your local network.
			</h1>
			<p
				className="absolute -translate-x-1/2 text-pretty text-center text-[16px] text-muted leading-[25px]"
				style={{ left: PAGE_MID, top: 556, width: 700 }}
			>
				Open the site settings by the address bar and allow Local network access. This page keeps listening, so
				your canvas opens the moment you do.
			</p>

			{/* the one fix that needs nobody's permission */}
			<p
				className="absolute -translate-x-1/2 whitespace-nowrap text-center text-[16px] leading-[25px]"
				style={{ left: PAGE_MID, top: 656 }}
			>
				Or skip the permission and go straight to <PortLink />.
			</p>
		</SiteLocalShell>
	);
}

function UpTick({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 8 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M4 11V2M1.4 4.4 4 1.6l2.6 2.8"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
