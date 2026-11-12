import { expect, it } from "vitest";
import { testBrowser } from "../../test-browser";
import { STAGE_CSS } from "./stage-play";

it("lets a slide's own transition rules, layered as every project sheet is, win over the stage's defaults", async () => {
	const page = await (await testBrowser()).newPage();
	// a slide's sheet as the stage serves it: in the project layer, after the stage's own look
	await page.setContent(`<style>${STAGE_CSS}</style>
<style>@layer project { ::view-transition-group(word) { animation-duration: 2s; } }</style>
<p style="view-transition-name: word">word</p>`);
	const durations = await page.evaluate(async () => {
		const transition = document.startViewTransition(() => {});
		await transition.ready;
		const of = (name: string) => getComputedStyle(document.documentElement, name).animationDuration;
		return { word: of("::view-transition-group(word)"), root: of("::view-transition-group(root)") };
	});
	expect(durations).toEqual({ word: "2s", root: "0.9s" });
});
