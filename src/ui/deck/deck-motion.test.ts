// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { deckMotion } from "./deck-motion";

/** The roles the theme gives a page, before stillness takes the scale to zero. */
const THEME =
	readFileSync(join(import.meta.dirname, "..", "theme.css"), "utf8").split("@media (prefers-reduced-motion")[0] ?? "";

it("moves the deck on the theme's roles, its prototype's timings kept as approved", () => {
	const page = document.body.appendChild(document.createElement("div"));
	for (const [, name = "", value = ""] of THEME.matchAll(/^\s*(--[a-z-]+):\s*([^;]+);/gm))
		page.style.setProperty(name, value);
	expect(deckMotion(page)).toEqual({
		snap: [0.32, 0.72, 0, 1],
		out: [0.22, 0.61, 0.36, 1],
		base: 180,
		slow: 260,
		slower: 400,
		settle: 440,
		glide: 220,
		fly: 600,
		leaveWait: 120,
		leave: 660,
		return: 560,
		chromeWait: 200,
		arrive: { head: 100, side: 180, foot: 240 },
		notes: 300,
		pointer: { stiffness: 900, damping: 60, mass: 0.4 },
		present: { duration: 0.5, bounce: 0 },
		groundIn: 340,
		groundOut: 300,
		handOver: 160,
	});
});
