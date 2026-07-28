import {
	DoorPlate,
	PAGE_MID,
	PLATE_TOP,
	PORT_URL,
	PROBE_IN,
	SiteLocalShell,
} from "../../../shared/ui/site-local-shell";

/**
 * local.spool.page, Spool answered: the found state of the plate direction.
 *
 * Same page, same plate, same centre line. Four things change and nothing moves:
 * the strip reads answering, its dot goes steady and warm, the version the daemon
 * reported takes the note slot, and a hairline sweeps the plate's far edge. That
 * sweep is the handover — the check came in the top of the door and something is
 * now going out the bottom of it — and it is the only clock on the page, because
 * a state that lasts a moment should not hand you a spinner.
 *
 * The version line is the proof rather than decoration: it is the difference
 * between "something answered on 7766" and "Spool answered on 7766", which is
 * exactly the distinction --wrong exists for. /api/health already returns
 * { name, version, pid, startedAt }; reading it cross-origin is the decided
 * daemon change this line depends on.
 *
 * The plate is a real link here, and it is the only interactive object on
 * local.spool.page in any state. It is a door, not a retry: it goes where the
 * page is already going, one press earlier, for anyone whose redirect is blocked
 * or who does not want to wait.
 *
 * Nothing occupies the lower half. The privacy sentence, the one line that has
 * to survive the handover, sits at the foot where it sits in every state.
 */

export default function SiteLocalFound() {
	return (
		<SiteLocalShell footnote="Your work stays on your machine. None of it ever reaches this page.">
			{/* the probe, arriving */}
			<span
				className="absolute w-px"
				style={{ left: PAGE_MID, top: 0, height: PLATE_TOP, background: PROBE_IN }}
			/>

			{/* the door, and the one thing on this page you may press */}
			<a
				href={PORT_URL}
				className="group/plate absolute -translate-x-1/2"
				style={{ left: PAGE_MID, top: PLATE_TOP }}
			>
				<DoorPlate state="answering" status="answering" note="v0.4.7 on this machine" handover />
			</a>

			<span
				className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-muted text-xs leading-none"
				style={{ left: PAGE_MID, top: 402 }}
			>
				taking you there
			</span>

			{/* what happened */}
			<h1
				className="absolute -translate-x-1/2 whitespace-nowrap text-center font-semibold text-[48px] leading-[1.0] tracking-[-0.02em]"
				style={{ left: PAGE_MID, top: 440 }}
			>
				Spool is running.
			</h1>
			<p
				className="absolute -translate-x-1/2 text-pretty text-center text-[16px] text-muted leading-[25px]"
				style={{ left: PAGE_MID, top: 512, width: 620 }}
			>
				Your canvas opens by itself in a moment. The address above is a link straight to it, if you would
				rather not wait.
			</p>
		</SiteLocalShell>
	);
}
