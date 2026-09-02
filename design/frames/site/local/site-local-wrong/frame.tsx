import {
	CopyCommand,
	DoorPlate,
	PAGE_MID,
	PLATE_TOP,
	PROBE_IN,
	ProbeDrop,
	SiteLocalShell,
} from "shared/ui/site-local-shell";

/**
 * local.spool.page, something answered on 7766 and it is not Spool: the occupied
 * state of the plate direction.
 *
 * The door is answered by the wrong tenant, so the plate reads answering and the
 * probe's footprint on its top edge is ink rather than thread. That is the page's
 * whole vocabulary doing its job: thread is the page reaching your machine, ink
 * is something in the way, and the wall in --blocked is drawn in the same ink for
 * the same reason. The check keeps falling on the beat, because the page keeps
 * listening here too, and it lands on a door that answers wrong every time.
 *
 * How the page knows: a same-origin-blind probe (mode: "no-cors") succeeds
 * opaquely if anything at all speaks HTTP on 7766, while the real check only
 * succeeds if Spool answers /api/health with the cross-origin header. Opaque yes
 * plus real no is this state. Both no is --plate. It is worth knowing that a
 * responder which speaks HTTPS only, or does not speak HTTP at all, fails both
 * probes and reads as "nothing running" — the wrong answer, but the harmless one.
 *
 * The port is not offered as a field, here or anywhere. A page that lets you type
 * a port is a page that scans your machine, and this one only ever looks at 7766.
 * Moving Spool is a decision you make in your own terminal, and the CLI prints
 * the link that carries it, drizzle-style, so the right side of the seam explains
 * that link rather than rebuilding it as UI.
 */

export default function SiteLocalWrong() {
	return (
		<SiteLocalShell footnote="Your work stays on your machine. None of it ever reaches this page.">
			{/* the probe, still going, still landing on the wrong tenant */}
			<span
				className="absolute w-px"
				style={{ left: PAGE_MID, top: 0, height: PLATE_TOP, background: PROBE_IN }}
			/>
			<ProbeDrop from={0} to={PLATE_TOP} />

			{/* the door, answered by somebody else */}
			<div
				data-go="site-local-found"
				className="absolute -translate-x-1/2 cursor-default"
				style={{ left: PAGE_MID, top: PLATE_TOP }}
			>
				<DoorPlate state="occupied" status="answering" note="not spool" />
			</div>

			{/* what happened */}
			<h1
				className="absolute -translate-x-1/2 whitespace-nowrap text-center font-semibold text-[48px] leading-[1.0] tracking-[-0.02em]"
				style={{ left: PAGE_MID, top: 432 }}
			>
				Something else is answering.
			</h1>
			<p
				className="absolute -translate-x-1/2 text-pretty text-center text-[16px] text-muted leading-[25px]"
				style={{ left: PAGE_MID, top: 504, width: 740 }}
			>
				Another app already owns <span className="font-mono text-text">127.0.0.1:7766</span>, and spool cannot
				start there until the port is free.
			</p>

			{/* the seam: free the port, or open the link that carries the new one */}
			<span className="absolute w-px bg-border" style={{ left: PAGE_MID, top: 596, height: 172 }} />

			<div className="absolute" style={{ left: 200, top: 600, width: 460 }}>
				<p className="text-md leading-[22px]">See what is holding the port, then start spool:</p>
				<div className="mt-4 flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="font-mono text-[14px] leading-[28px]">
						<CopyCommand prompt="~ $" command="lsof -i :7766" />
						<CopyCommand prompt="~/your-app $" command="spool" />
					</div>
				</div>
			</div>

			<div className="absolute" style={{ left: 780, top: 600, width: 460 }}>
				<p className="text-md leading-[22px]">Moved spool to another port on purpose?</p>
				<div className="mt-4 flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<span className="font-mono text-[14px] text-muted leading-[28px]">
						local.spool.page/<span className="text-text">?port=7801</span>
					</span>
				</div>
				<p className="mt-3.5 pl-[25px] text-base text-muted leading-[20px]">
					Open the link the <span className="font-mono text-text">spool</span> command printed. On its own,
					this page only ever looks at 7766.
				</p>
			</div>
		</SiteLocalShell>
	);
}
