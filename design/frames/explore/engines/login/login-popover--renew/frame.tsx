import { EngineChoice } from "shared/ui/explore/engines/engine-choice";
export default function Frame() {
	return (
		<EngineChoice
			take="combined"
			state="thread"
			login={{ take: "popover", seed: "renew" }}
		/>
	);
}
