import { ui } from "spool";
import { Elsewhere } from "shared/ui/site/demo-apps/elsewhere";

export default function Frame() {
	ui.use();
	return (
		<Elsewhere
			screen="discover"
			date={typeof ui.state.elsewhereDate === "string" ? ui.state.elsewhereDate : "18–21 Sep"}
			guests={typeof ui.state.elsewhereGuests === "number" ? ui.state.elsewhereGuests : 2}
			onOpen={() => ui.go("demo-elsewhere--stay")}
			onPlan={(date, guests) => ui.go("demo-elsewhere--plan", { elsewhereDate: date, elsewhereGuests: guests })}
			onBack={() => ui.go("demo-elsewhere")}
		/>
	);
}
