import { EngineChoice } from "shared/ui/explore/engines/engine-choice";
export default function Frame() {
	return (
		<EngineChoice
			take="combined"
			state="new"
			login={{ take: "popover", seed: "manual" }}
		/>
	);
}
