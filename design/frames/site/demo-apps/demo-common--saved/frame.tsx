import { ui } from "spool";
import { Common } from "shared/ui/site/demo-apps/common";

export default function Frame() {
	ui.use();
	return (
		<Common
			screen="saved"
			place={typeof ui.state.commonPlace === "number" ? ui.state.commonPlace : 0}
			saved={ui.state.commonSaved !== false}
			onOpen={(place) => ui.go("demo-common--place", { commonPlace: place })}
			onSave={() => ui.go("demo-common--saved", { commonSaved: true })}
			onCollection={() => ui.go("demo-common--saved")}
			onBack={() => ui.go("demo-common")}
		/>
	);
}
