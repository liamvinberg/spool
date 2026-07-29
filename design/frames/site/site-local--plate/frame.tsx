import {
	CopyCommand,
	DoorPlate,
	PAGE_MID,
	PLATE_TOP,
	PROBE_IN,
	PortLink,
	ProbeDrop,
	SiteLocalShell,
} from "../../../shared/ui/site-local-shell";

/**
 * local.spool.page, nothing running: the settled direction, "the plate".
 *
 * A door with a number on it. The page's first fact is the address itself, set
 * as the object rather than said in a sentence: a plate at the top of the
 * composition carrying 127.0.0.1:7766 in the display mono, with what the page
 * can hear along its bottom strip. The headline reads second, because at a door
 * you look at the number before anyone speaks.
 *
 * There is nothing to press, here or in any other state. The page probes on
 * load, re-checks on a slow beat and hands over the moment Spool answers, so a
 * retry control would only offer to do what is already happening. What replaces
 * it is the one thing a page with no controls owes you: visible proof it is
 * still going. A check falls down the probe from outside the page, lands on the
 * plate, and the strip's dot brightens as it lands — one heartbeat on one beat
 * (PLATE_BEAT), phase-locked because both start at mount.
 *
 * One structural line does the whole argument. The probe drops in from the very
 * top edge, from the browser above this page, and is stopped dead by the plate:
 * it goes exactly one place, which is the privacy claim drawn rather than
 * badged. Below the plate the axis resumes as a plain border hairline, not
 * thread, and its only job is to seam the two ways to start Spool. Thread means
 * the page reaching for your machine. Border means layout. Nothing else on the
 * page is decorated at all.
 *
 * The plate carries the walk to --found because on the real page the handover is
 * automatic: the plate is the door in every state, and it opens on its own.
 */

export default function SiteLocalPlate() {
	return (
		<SiteLocalShell
			footnote={
				<>
					Safari and Brave block requests to your own machine. If spool is running, open <PortLink />{" "}
					directly.
				</>
			}
		>
			{/* the probe, entering from outside the page and stopping at the door */}
			<span
				className="absolute w-px"
				style={{ left: PAGE_MID, top: 0, height: PLATE_TOP, background: PROBE_IN }}
			/>
			<ProbeDrop from={0} to={PLATE_TOP} />

			{/* the door */}
			<div
				data-go="site-local--found"
				className="absolute -translate-x-1/2 cursor-default"
				style={{ left: PAGE_MID, top: PLATE_TOP }}
			>
				<DoorPlate state="listening" status="listening" note="no answer yet" />
			</div>

			{/* what happened */}
			<h1
				className="absolute -translate-x-1/2 whitespace-nowrap text-center font-semibold text-[48px] leading-[1.0] tracking-[-0.02em]"
				style={{ left: PAGE_MID, top: 432 }}
			>
				spool isn&apos;t running here.
			</h1>
			<p
				className="absolute -translate-x-1/2 text-pretty text-center text-[16px] text-muted leading-[25px]"
				style={{ left: PAGE_MID, top: 504, width: 700 }}
			>
				This page listens for spool at <span className="font-mono text-text">127.0.0.1:7766</span> and takes
				you there the moment it answers. Your work stays on your machine. None of it ever reaches this page.
			</p>

			{/* the seam, and the two ways to get Spool answering */}
			<span className="absolute w-px bg-border" style={{ left: PAGE_MID, top: 596, height: 172 }} />

			<div className="absolute" style={{ left: 200, top: 600, width: 460 }}>
				<p className="text-md leading-[22px]">Start spool on this machine:</p>
				<div className="mt-4 flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="font-mono text-[14px] leading-[28px]">
						<CopyCommand prompt="~ $" command="npm install -g spool.page" />
						<CopyCommand prompt="~/your-app $" command="spool" />
					</div>
				</div>
			</div>

			<div className="absolute" style={{ left: 780, top: 600, width: 460 }}>
				<p className="text-md leading-[22px]">Working over SSH? Bring the daemon here:</p>
				<div className="mt-4 flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="font-mono text-[14px] leading-[28px]">
						<CopyCommand prompt="~ $" command="ssh -L 7766:127.0.0.1:7766 user@host" />
					</div>
				</div>
				<p className="mt-3.5 pl-[25px] text-base text-muted leading-[20px]">
					This page notices as soon as the tunnel is up.
				</p>
			</div>

			<span
				className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-2xs text-muted/60 leading-none"
				style={{ left: PAGE_MID, top: 792 }}
			>
				7766 spells SPOO on a phone keypad.
			</span>
		</SiteLocalShell>
	);
}
