import { SiteCardShell } from "../../../shared/ui/site-card-shell";
import { SpoolMark } from "../../../shared/ui/spool-mark";
import { MeridianPass, MeridianTrip } from "./screens";

/**
 * site-card--meridian. The link card showing Meridian, a flight app.
 *
 * The bet: contrast and type. Pale screens on near-black paper are the only
 * variant whose frames are unmistakably objects at a thumbnail, and a flight is
 * a subject whose real design is already enormous — three-letter codes and a
 * barcode survive any amount of shrinking, so what reads small here is the
 * actual content rather than a stand-in for it.
 *
 * It is the most conservative of the three, and the closest in kind to the card
 * that shipped. What it is really proposing is that the shipped card was right
 * about light screens and wrong about everything inside them.
 */
export default function SiteCardMeridian() {
	return (
		<SiteCardShell
			mark={<SpoolMark className="h-8 w-8 text-thread" />}
			from={<MeridianTrip />}
			to={<MeridianPass />}
		/>
	);
}
