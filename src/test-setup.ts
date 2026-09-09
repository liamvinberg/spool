import { afterAll, expect } from "vitest";
import { closeTestBrowser } from "./test-browser";

const testPath = expect.getState().testPath?.replaceAll("\\", "/") ?? "";

// UI component tests use act(). Served runtime tests use browser scheduling
// and poll the rendered result instead of React's component-test scheduler.
if (testPath.includes("/src/ui/")) {
	Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
}

// A file's shared Chromium (test-browser.ts) closes with the file, through
// Playwright's own 30s graceful-shutdown window.
afterAll(closeTestBrowser, 35_000);

// A browser or native suite polls for exact states a daemon and a Chromium reach
// together: a preview landing natively, a save arriving in source, a frame
// mounting. Nothing in those suites expects a poll to time out, so the only
// thing the default second bounds is how loaded the runner may be before an
// exact wait reads as a failure. Those suites get the same window the origin
// helpers already use; a poll that names its own timeout keeps it.
if (/-(browser|native)\.test\.ts$/.test(testPath)) {
	const poll = expect.poll;
	expect.poll = (actual, options) => poll(actual, { timeout: 15_000, ...options });
}
