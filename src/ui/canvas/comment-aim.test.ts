import { describe, expect, it } from "vitest";
import { aimedHit, placedHit, reaim, stepAim } from "./comment-aim";
import type { PickedHit } from "./protocol";

const hit = (selector: string): PickedHit => ({
	selector,
	tag: "div",
	outerHtml: "<div></div>",
	rect: { x: 0, y: 0, w: 10, h: 10 },
	words: false,
	radius: 0,
	source: null,
	generated: false,
});

const chain = [hit("main"), hit("main > section"), hit("main > section > p")];

describe("the Comment tool's aim", () => {
	it("starts on the deepest element and climbs one level a step, then to the whole frame", () => {
		let aim = reaim(null, "home", chain);
		expect(aimedHit(aim)?.selector).toBe("main > section > p");
		aim = stepAim(aim, "up");
		expect(aimedHit(aim)?.selector).toBe("main > section");
		aim = stepAim(stepAim(aim, "up"), "up");
		expect(aimedHit(aim)).toBeNull();
		expect(stepAim(aim, "up")).toBe(aim);
		aim = stepAim(aim, "down");
		expect(aimedHit(aim)?.selector).toBe("main");
	});

	it("never steps below the deepest element", () => {
		const aim = reaim(null, "home", chain);
		expect(stepAim(aim, "down")).toBe(aim);
	});

	it("keeps its level while the pointer rests on the same element, and drops it on another", () => {
		const climbed = stepAim(reaim(null, "home", chain), "up");
		expect(reaim(climbed, "home", chain).up).toBe(1);
		expect(reaim(climbed, "home", chain.slice(0, 2)).up).toBe(0);
		expect(reaim(climbed, "menu", chain).up).toBe(0);
	});

	it("pins the level aimed at when the press finds the same element, the deepest otherwise", () => {
		const climbed = stepAim(reaim(null, "home", chain), "up");
		expect(placedHit(climbed, "home", chain)?.selector).toBe("main > section");
		expect(placedHit(climbed, "home", chain.slice(0, 2))?.selector).toBe("main > section");
		expect(placedHit(null, "home", chain)?.selector).toBe("main > section > p");
		expect(placedHit(stepAim(stepAim(climbed, "up"), "up"), "home", chain)).toBeNull();
	});

	it("aims at the whole frame from its label", () => {
		expect(aimedHit({ frame: "home", chain: [], up: 0 })).toBeNull();
	});
});
