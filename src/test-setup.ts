import { afterAll, expect, vi } from "vitest";
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

// A poll waits for a state the test expects to reach: a preview landing
// natively, a save arriving in source, a frame mounting, a render settling.
// Nothing expects one to time out, so the default second bounds only how loaded
// the runner may be before an exact wait reads as a failure, and a poll that
// holds returns the moment it does. Every suite gets the window the origin
// helpers already use; a poll that names its own timeout keeps it.
const POLL_MS = 15_000;
const poll = expect.poll;
expect.poll = (actual, options) => poll(actual, { timeout: POLL_MS, ...options });
const waitFor = vi.waitFor;
vi.waitFor = (callback, options) =>
	waitFor(callback, typeof options === "number" ? options : { timeout: POLL_MS, ...options });
