import { ui } from "spool";
import { Offprint } from "shared/ui/site/demo-apps/offprint";

export default function Frame() {
	ui.use();
	return (
		<Offprint
			screen="ticket"
			time={typeof ui.state.offprintTime === "string" ? ui.state.offprintTime : "10:00"}
			seats={typeof ui.state.offprintSeats === "number" ? ui.state.offprintSeats : 1}
			onOpen={() => ui.go("demo-offprint--booking")}
			onBook={(time, seats) => ui.go("demo-offprint--ticket", { offprintTime: time, offprintSeats: seats })}
			onBack={() => ui.go("demo-offprint")}
		/>
	);
}
