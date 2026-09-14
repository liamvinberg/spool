import { describe, expect, it } from "vitest";
import type { FrameGraph } from "./flows";
import { readinessFrom } from "./publication-readiness";

const source = (frame: string, extra: Partial<FrameGraph> = {}): FrameGraph => ({
	frame,
	hash: frame,
	files: [],
	folder: [],
	imports: [],
	sites: [],
	unreadable: [],
	...extra,
});
describe("publication readiness", () => {
	it("walks the connected set, terminates cycles and ignores unrelated drafts", () => {
		const sources = new Map([
			[
				"start",
				source("start", { sites: [{ target: "next", via: "ui.go", path: "frames/start/frame.tsx", line: 3 }] }),
			],
			[
				"next",
				source("next", { sites: [{ target: "start", via: "ui.go", path: "frames/next/frame.tsx", line: 3 }] }),
			],
			["draft", source("draft", { parseFailure: { path: "frames/draft/frame.tsx", line: 1 } })],
		]);
		const result = readinessFrom("start", ["start", "next", "draft"], sources);
		expect(result.ok).toBe(true);
		expect(result.included).toEqual(["start", "next"]);
	});

	it("uses declarations as the complete set and reports disagreement and missing targets", () => {
		const sources = new Map([
			[
				"start",
				source("start", {
					links: { path: "frames/start/frame.tsx", line: 2, values: { next: "next" } },
					sites: [{ target: "other", via: "ui.go", path: "frames/start/frame.tsx", line: 3 }],
				}),
			],
		]);
		const result = readinessFrom("start", ["start"], sources);
		expect(result.ok).toBe(false);
		expect(result.included).toEqual(["start"]);
		expect(result.outgoing[0]?.targets).toEqual(["next"]);
		expect(result.diagnostics.map(({ code }) => code)).toEqual(["links-disagree", "target-missing"]);
	});

	it("does not let a rendered result suppress unresolved undeclared navigation", () => {
		const dark = { via: "data-go" as const, path: "shared/ui/card.tsx", line: 8, anchor: { line: 8, col: 2 } };
		const result = readinessFrom("start", ["start"], new Map([["start", source("start", { unreadable: [dark] })]]));
		expect(result.diagnostics).toMatchObject([
			{ code: "navigation-unreadable", frame: "start", path: dark.path, line: dark.line },
		]);
	});
});
