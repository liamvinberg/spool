import { afterAll, expect } from "vitest";
import { closeTestBrowser } from "./test-browser";

// UI component tests use act(). Served runtime tests use browser scheduling
// and poll the rendered result instead of React's component-test scheduler.
if (expect.getState().testPath?.replaceAll("\\", "/").includes("/src/ui/")) {
	Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
}

// A file's shared Chromium (test-browser.ts) closes with the file, through
// Playwright's own 30s graceful-shutdown window.
afterAll(closeTestBrowser, 35_000);
