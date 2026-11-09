import { ui } from "spool";
import type { Order } from "./app";

/** The order, kept in the session so the three screens share it. */
export function order(): Order {
	const s = ui.state;
	return {
		finish: (s.oreFinish as string | undefined) ?? "clay",
		limit: (s.oreLimit as number | undefined) ?? 800,
		online: (s.oreOnline as boolean | undefined) ?? true,
		abroad: (s.oreAbroad as boolean | undefined) ?? false,
		cash: (s.oreCash as boolean | undefined) ?? true,
		home: (s.oreHome as boolean | undefined) ?? true,
	};
}

export function change(patch: Partial<Order>) {
	if (patch.finish !== undefined) ui.state.oreFinish = patch.finish;
	if (patch.limit !== undefined) ui.state.oreLimit = patch.limit;
	if (patch.online !== undefined) ui.state.oreOnline = patch.online;
	if (patch.abroad !== undefined) ui.state.oreAbroad = patch.abroad;
	if (patch.cash !== undefined) ui.state.oreCash = patch.cash;
	if (patch.home !== undefined) ui.state.oreHome = patch.home;
}
