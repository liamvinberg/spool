import { SiteCardShell } from "shared/ui/site-card-shell";
import { SpoolMark } from "shared/ui/spool-mark";
import { PaceRun, PaceSummary } from "./screens";

/**
 * site-card--pace. The link card showing Pace, a running app.
 *
 * The bet: one number, very large, and one bright line. Where aria bets on
 * colour and meridian on contrast, this bets that the thing which survives a
 * timeline thumbnail is scale — a distance at 102px and a route traced in acid
 * are still two readable objects when the card is 500px wide.
 *
 * It is also the variant that reads most as software rather than as a document,
 * which is the argument for it: the card is selling a tool for building apps,
 * and a live run is more obviously an app than a ticket is.
 */
export default function SiteCardPace() {
	return (
		<SiteCardShell mark={<SpoolMark className="h-8 w-8 text-thread" />} from={<PaceRun />} to={<PaceSummary />} />
	);
}
