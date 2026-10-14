import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFrameShims, FRAME_SHIM_DIR, FRAME_SHIMS_MODULE, frameShimsModule } from "../../frame-shim-build";

describe("the frame shims spool serves", () => {
	it("are what their source builds to", () => {
		expect(
			readFileSync(FRAME_SHIMS_MODULE, "utf8") === frameShimsModule(buildFrameShims(FRAME_SHIM_DIR)),
			"daemon/frame-shims.ts is stale: run `pnpm build:shims`",
		).toBe(true);
	});
});
