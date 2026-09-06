import { expect } from "vitest";

// UI component tests use act(). Served runtime tests use browser scheduling
// and poll the rendered result instead of React's component-test scheduler.
if (expect.getState().testPath?.replaceAll("\\", "/").includes("/src/ui/")) {
	Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
}
