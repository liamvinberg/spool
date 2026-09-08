import { BloomLanding } from "shared/ui/site/current/ui/site/bloom/landing";
import "./controls.css";

type Take = "current" | "compact" | "type" | "quiet" | "stacked" | "paper" | "joined";

export function LandingTake({ take }: { take: Take }) {
	return (
		<div data-controls={take}>
			<BloomLanding />
		</div>
	);
}
