// @vitest-environment happy-dom

import { expect, it, vi } from "vitest";
import { FAST_REFRESH_RUNTIME, HOT_BOOT_CLIENT } from "./fast-refresh";

/**
 * A frame document's half of an update, run against stand-ins for React Refresh
 * and the daemon's plan: the canvas's cancel, sent when the hand comes into the
 * frame, stops an update that has not committed, and only that one.
 */
it("drops an update the canvas cancels before it commits, and lands the next", async () => {
	const refresh = {
		injectIntoGlobalHook: () => {},
		performReactRefresh: vi.fn(),
		isLikelyComponentType: () => true,
		getFamilyByType: () => ({}),
	};
	const plans: ((plan: unknown) => void)[] = [];
	const fetch = () => new Promise((answer) => plans.push((plan) => answer({ ok: true, json: async () => plan })));
	const reports: Record<string, unknown>[] = [];
	const report = (spool: string, detail: Record<string, unknown>) => reports.push({ spool, ...detail });
	const runtime = FAST_REFRESH_RUNTIME.replace(/^import \* as Refresh from "react-refresh\/runtime";$/m, "");
	new Function("Refresh", "fetch", "report", `${runtime}\n${HOT_BOOT_CLIENT}`)(refresh, fetch, report);
	const ask = (spool: string, id: number) =>
		window.dispatchEvent(new MessageEvent("message", { data: { spool, id }, source: window.parent }));
	const plan = { head: null, imports: [] };
	const settle = () => vi.waitFor(() => expect(reports.length).toBeGreaterThan(0));

	ask("hot", 1);
	await vi.waitFor(() => expect(plans).toHaveLength(1));
	ask("hot-cancel", 1);
	plans[0]?.(plan);
	await settle();
	expect(reports.pop()).toMatchObject({ spool: "hot", id: 1, ok: false, refused: "the hand came in" });
	expect(refresh.performReactRefresh).not.toHaveBeenCalled();

	ask("hot", 2);
	await vi.waitFor(() => expect(plans).toHaveLength(2));
	plans[1]?.(plan);
	await settle();
	expect(reports.pop()).toMatchObject({ spool: "hot", id: 2, ok: true });
	expect(refresh.performReactRefresh).toHaveBeenCalledOnce();
});
