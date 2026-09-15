import { useState } from "react";
import { type FoldScreen, FoldStore } from "../../../../fold-objects/fold-store";
export type DemoTake = FoldScreen;
export const DEMO_TAKES: readonly DemoTake[] = ["campaign", "finish", "bag"];
export const DEMO_NAMES: Record<DemoTake, string> = {
	campaign: "The light",
	finish: "Choose a finish",
	bag: "Your bag",
};
export function DemoProduct({ take, reduceMotion = false }: { take: DemoTake; reduceMotion?: boolean }) {
	const [screen, setScreen] = useState(take);
	return (
		<div className="dl-product-session">
			<FoldStore screen={screen} onNavigate={setScreen} reduceMotion={reduceMotion} />
		</div>
	);
}
