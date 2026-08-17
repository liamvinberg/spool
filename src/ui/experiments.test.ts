// @vitest-environment happy-dom

import { afterEach, expect, it } from "vitest";
import { experimentOn } from "./experiments";

/**
 * What the page makes of the list the daemon booted it with (#238).
 *
 * Every shape a config file can produce arrives here as one global, so the
 * question this answers is the same one every gated surface asks: is this name
 * on the list, whatever else is.
 */

afterEach(() => {
	delete window.__SPOOL_EXPERIMENTS__;
});

const switchOn = (...names: string[]) => Object.assign(window, { __SPOOL_EXPERIMENTS__: names });

it("says no when the daemon named nothing", () => {
	expect(experimentOn("agent-panel")).toBe(false);
	switchOn();
	expect(experimentOn("agent-panel")).toBe(false);
});

it("says yes only to a name on the list", () => {
	switchOn("agent-panel");
	expect(experimentOn("agent-panel")).toBe(true);

	// a config written for some other spool: the names nothing here answers to are
	// carried across and do nothing, and they do not switch anything else on
	switchOn("not-a-thing", "agent-panels");
	expect(experimentOn("agent-panel")).toBe(false);
});

it("treats a global that is not a list as nothing switched on", () => {
	Object.assign(window, { __SPOOL_EXPERIMENTS__: "agent-panel" });
	expect(experimentOn("agent-panel")).toBe(false);
});
