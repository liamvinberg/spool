import { SiteCardShell } from "../../../shared/ui/site-card-shell";
import { SpoolMark } from "../../../shared/ui/spool-mark";
import { AriaLibrary, AriaPlaying } from "./screens";

/**
 * site-card--aria. The link card showing Aria, a music app.
 *
 * The bet: colour. Album art is the one thing that survives being shrunk to a
 * timeline thumbnail — it is a large field of it, and it reads as artwork rather
 * than as a rectangle at every size down to a favicon. Five pieces of it across
 * the two screens, and the walk lands on the largest.
 *
 * It is also the bet furthest from the card's ground. Aria is near-black like
 * spool is, so the frames hold their edges on lavender and violet rather than on
 * contrast with the paper, and that is the thing to judge here.
 */
export default function SiteCardAria() {
	return (
		<SiteCardShell
			mark={<SpoolMark className="h-8 w-8 text-thread" />}
			from={<AriaLibrary />}
			to={<AriaPlaying />}
		/>
	);
}
