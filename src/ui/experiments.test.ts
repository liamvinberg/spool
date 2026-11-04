// @vitest-environment happy-dom

import { afterEach, expect, it } from "vitest";
import { experimentOn } from "./experiments";

/**
 * What the page makes of the list the daemon booted it with (#238): the list is
 * the whole answer when there is one, and the registry's defaults when there is not.
 */

afterEach(() => {
	delete window.__SPOOL_EXPERIMENTS__;
});

it("runs every feature at its default on a page no daemon booted", () => {
	expect(experimentOn("knobs")).toBe(true);
	expect(experimentOn("fast-refresh")).toBe(false);
	Object.assign(window, { __SPOOL_EXPERIMENTS__: "fast-refresh" });
	expect(experimentOn("fast-refresh")).toBe(false);
});

it("takes the daemon's list as the whole answer, a beta off included", () => {
	Object.assign(window, { __SPOOL_EXPERIMENTS__: ["fast-refresh"] });
	expect(experimentOn("fast-refresh")).toBe(true);
	expect(experimentOn("knobs")).toBe(false);
});
