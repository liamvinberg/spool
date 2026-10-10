import { describe, expect, it } from "vitest";
import { judge, scan } from "./design-lint";

describe("design lint", () => {
	it("finds a colour name from before the system anywhere in src", () => {
		expect(scan("src/daemon/x.ts", `"bg-surface text-muted border-border-raised bg-control"`)).toEqual({
			"old-token": 4,
		});
		expect(scan("src/ui/x.css", "color: var(--color-thread);")).toEqual({ "old-token": 1 });
		expect(scan("src/ui/x.tsx", `"bg-surface-panel text-secondary border-line-strong type-control"`)).toEqual({});
	});

	it("leaves user projects' own tokens to them", () => {
		expect(scan("src/templates.ts", "--color-surface → bg-surface")).toEqual({});
	});

	it("finds a raw colour or a picked timing in the chrome's code, not in its comments", () => {
		const source = `// #205 over 150ms\nconst a = "#1c1c1c"; const b = "rgba(0,0,0,0.5)";\n<div className="duration-150 ease-[cubic-bezier(0,0,1,1)] [transition:opacity_1s]" />`;
		expect(scan("src/ui/x.tsx", source)).toEqual({ "raw-colour": 2, "ad-hoc-motion": 3 });
		expect(scan("src/ui/x.test.tsx", source)).toEqual({});
		expect(scan("src/ui/x.tsx", `"duration-fast ease-out animate-menu-in"`)).toEqual({});
	});

	it("holds every file to its allowance, which only shrinks", () => {
		const scans = new Map([
			["src/ui/a.tsx", { "raw-colour": 3 }],
			["src/ui/b.tsx", { "raw-colour": 1 }],
			["src/ui/c.tsx", { "ad-hoc-motion": 2 }],
		]);
		const allow = {
			"src/ui/a.tsx": { "raw-colour": 2 },
			"src/ui/b.tsx": { "raw-colour": 2 },
			"src/ui/c.tsx": { "ad-hoc-motion": 2 },
		};
		expect(judge(scans, allow)).toEqual([
			{ path: "src/ui/a.tsx", rule: "raw-colour", found: 3, allowed: 2 },
			{ path: "src/ui/b.tsx", rule: "raw-colour", found: 1, allowed: 2 },
		]);
	});
});
