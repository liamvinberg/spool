import { describe, expect, it } from "vitest";
import { drawsInSoftware, gpuShellArgs } from "./headless-shell";

describe("the booth's GPU", () => {
	it("is each platform's ANGLE backend, on Linux by its render nodes, and never when software is asked for", () => {
		const backend = (platform: NodeJS.Platform, env: NodeJS.ProcessEnv = {}, renderNodes = 1) =>
			gpuShellArgs(platform, env, () => renderNodes)?.find((flag) => flag.startsWith("--use-angle="));
		expect(backend("darwin")).toBe("--use-angle=metal");
		expect(backend("win32")).toBe("--use-angle=d3d11");
		expect(backend("linux")).toBe("--use-angle=gles-egl");
		expect(backend("linux", {}, 2)).toBe("--use-angle=vulkan");
		expect(backend("linux", {}, 0)).toBeUndefined();
		expect(backend("freebsd")).toBeUndefined();
		expect(backend("darwin", { SPOOL_BOOTH_GPU: "0" })).toBeUndefined();
	});

	it("is taken to draw in software when compositing, WebGL or the GL it names is software", () => {
		const report = (featureStatus: Record<string, string>, glRenderer: string) => ({
			featureStatus: { gpu_compositing: "enabled", webgl: "enabled", ...featureStatus },
			auxAttributes: { glRenderer },
		});
		const intel = "ANGLE (Intel, Mesa Intel(R) Arc(tm) Graphics (MTL), OpenGL ES 3.2)";
		expect(drawsInSoftware(report({}, intel))).toBe(false);
		expect(drawsInSoftware(report({ gpu_compositing: "disabled_software" }, intel))).toBe(true);
		expect(drawsInSoftware(report({ webgl: "unavailable_software" }, intel))).toBe(true);
		expect(drawsInSoftware(report({}, "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))"))).toBe(true);
		expect(drawsInSoftware(report({}, "ANGLE (Mesa, llvmpipe (LLVM 19.1.1, 256 bits), OpenGL 4.5)"))).toBe(true);
	});
});
