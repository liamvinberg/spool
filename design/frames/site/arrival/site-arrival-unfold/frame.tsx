import { OffprintLanding } from "shared/ui/site/demo-apps/landing";
import "./unfold.css";

// Alternative: a more deliberate reveal of the canvas below the same hero.
export default function Frame() {
	return (
		<div className="arrival-unfold h-full">
			<OffprintLanding take="play" />
		</div>
	);
}
