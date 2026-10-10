import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cn, THEME_NAMES } from "./cn";

const CSS = readFileSync(join(import.meta.dirname, "theme.css"), "utf8");
const names = (prefix: string) => [
	...new Set([...CSS.matchAll(new RegExp(`--${prefix}-([a-z-]+):`, "g"))].map((m) => m[1])),
];

it("knows every size, timing and curve the theme names", () => {
	expect([...THEME_NAMES.spacing].sort()).toEqual(names("spacing").sort());
	expect([...THEME_NAMES.duration].sort()).toEqual(names("transition-duration").sort());
	expect(names("ease").filter((name) => !["out", "in-out"].includes(name ?? ""))).toEqual([...THEME_NAMES.ease]);
});

it("lets a class handed to a primitive replace the one it draws with", () => {
	expect(cn("relative inline-flex", "absolute right-0")).toBe("inline-flex absolute right-0");
	expect(cn("h-control-md", "h-row")).toBe("h-row");
	expect(cn("w-menu", "w-[260px]")).toBe("w-[260px]");
	expect(cn("text-secondary", "text-primary")).toBe("text-primary");
	expect(cn("duration-fast ease-snap", "duration-base ease-out")).toBe("duration-base ease-out");
	expect(cn("focus-ring", "focus-ring-inset")).toBe("focus-ring-inset");
	expect(cn("type-control", false, undefined, "type-detail")).toBe("type-control type-detail");
});
