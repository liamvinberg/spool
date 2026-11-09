import { ui } from "spool";
import { Limits, Pick, Shipped } from "./app";
import { ore } from "./knobs";
import { change, order } from "./session";

/* Ore, ordering a steel bank card. Each frame passes where its primary action walks, so the canvas draws one arrow per screen. */
export function Ore({ screen, onNext }: { screen: "pick" | "limits" | "shipped"; onNext: () => void }) {
	ui.use();
	if (screen === "limits")
		return <Limits look={ore.card} order={order()} onChange={change} onBack={() => ui.back()} onOrder={onNext} />;
	if (screen === "shipped") return <Shipped look={ore.card} order={order()} onDone={onNext} />;
	return <Pick look={ore.card} order={order()} onFinish={(finish) => change({ finish })} onNext={onNext} />;
}
