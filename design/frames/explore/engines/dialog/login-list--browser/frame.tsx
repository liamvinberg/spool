import { EngineChoice } from "shared/ui/explore/engines/engine-choice";
export default function Frame() {
	return <EngineChoice take="combined" login={{ take: "dialog", seed: "browser", look: "list" }} />;
}
