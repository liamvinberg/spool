import { describe, expect, it } from "vitest";
import { headline, type PinForm, pinForm } from "./broken-frame";

describe("pinForm", () => {
	it("says less as the frame shrinks on screen, down to nothing", () => {
		const shrinking = [1440, 600, 200, 20].map((w) => pinForm(null, w, w * 0.625));
		expect(shrinking).toEqual<PinForm[]>(["summary", "bare", "dot", null]);
	});

	it("holds a poorer form until a richer one fits by a margin, so a zoom resting on the edge never flickers", () => {
		const bareRoom = 220;
		expect(pinForm("dot", bareRoom + 4, 400)).toBe("dot");
		expect(pinForm("dot", bareRoom + 40, 400)).toBe("bare");
		// and going down never waits
		expect(pinForm("bare", bareRoom - 1, 400)).toBe("dot");
	});
});

describe("headline", () => {
	it("is the toolchain's first line without esbuild's mark and plugin", () => {
		const error =
			'✘ [ERROR] Could not resolve "shared/ui/spool/icons" [plugin spool-shared]\n\n    frame.tsx:10:36:\n      10 │ import …';
		expect(headline({ kind: "compile", error, at: "" })).toBe('Could not resolve "shared/ui/spool/icons"');
		expect(headline({ kind: "boot", error: "threw on boot: TypeError: x is undefined\n    at Frame", at: "" })).toBe(
			"TypeError: x is undefined",
		);
	});
});
