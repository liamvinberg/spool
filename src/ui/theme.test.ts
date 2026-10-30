import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DARK_TOKENS, LIGHT_TOKENS } from "../settings/registry";

const CSS = readFileSync(join(import.meta.dirname, "theme.css"), "utf8");

/**
 * The design system's ramp steps each blended role stands for, light then dark: a
 * blend is tuned so the shipped palette lands on them, and a custom palette gets
 * the shade that fits its own colours instead.
 */
const RAMP = {
	tertiary: ["#8b8883", "#6d6a67"],
	disabled: ["#a9a6a0", "#4c4a48"],
	"line-subtle": ["#e6e5e1", "#212121"],
	"accent-hover": ["#dd3017", "#ff604b"],
	"accent-pressed": ["#c52a18", "#dd3017"],
} as const;

const rgb = (hex: string): number[] => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

/** `color-mix(in srgb, a P%, b)` over the shipped palette of one look */
function mix(expression: string, palette: Record<string, string>): number[] {
	const parts = /color-mix\(in srgb, (\S+) (\d+)%, (.+)\)$/.exec(expression);
	if (parts === null) throw new Error(`not a blend: ${expression}`);
	const colour = (term: string): number[] => {
		const token = /^var\(--theme-([\w-]+)\)$/.exec(term)?.[1];
		return rgb(token === undefined ? term : (palette[token] ?? term));
	};
	const [a, b, share] = [colour(parts[1] ?? ""), colour(parts[3] ?? ""), Number(parts[2]) / 100];
	return a.map((channel, at) => channel * share + (b[at] ?? 0) * (1 - share));
}

describe("the theme", () => {
	it.each(Object.entries(RAMP))("blends %s onto the system's ramp in both looks", (role, [light, dark]) => {
		const declaration = new RegExp(
			`--color-${role}: light-dark\\(\\s*(color-mix\\([^\\n]+\\)),\\s*(color-mix\\([^\\n]+\\))\\s*\\);`,
		).exec(CSS);
		expect(declaration, role).not.toBeNull();
		for (const [expression, palette, want] of [
			[declaration?.[1] ?? "", LIGHT_TOKENS, light],
			[declaration?.[2] ?? "", DARK_TOKENS, dark],
		] as const) {
			const got = mix(expression, palette);
			const off = Math.max(...rgb(want).map((channel, at) => Math.abs(channel - (got[at] ?? 0))));
			expect(off, `${role} against ${want}`).toBeLessThanOrEqual(12);
		}
	});

	it("draws every role from the ten theme colours, so a custom palette reaches all of them", () => {
		const roles = CSS.slice(CSS.indexOf("@theme {"), CSS.indexOf("--color-danger:"));
		expect(roles).not.toMatch(/#(?!000000|ffffff|f5391a)[0-9a-f]{6}/);
	});

	it("takes the motion scale to nothing when stillness is asked for", () => {
		const still = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
		for (const step of ["quick", "fast", "base", "slow", "slower"]) {
			expect(CSS).toMatch(new RegExp(`--transition-duration-${step}: \\d+ms;`));
			expect(still).toContain(`--transition-duration-${step}: 0ms;`);
		}
	});
});
