import { describe, expect, it } from "vitest";
import { designStamp, elementHandles } from "./element-handles";

/** An element a browser picked, named from the text of its file alone, as Spool Cloud names it for a comment. */

const FILE = `export default function Frame() {
	return (
		<main>
			<h1 className="title">Two coffees</h1>
		</main>
	);
}
`;
const picked = {
	frame: "home",
	selector: "main > h1",
	outerHtml: '<h1 class="title">Two coffees</h1>',
	source: "frames/home/frame.tsx:4:4",
	generated: false,
};

describe("elementHandles", () => {
	it("names a stamped element by its file's own words and lines", () => {
		expect(elementHandles(picked, designStamp(picked.source), FILE)).toEqual({
			name: "h1",
			path: "design/frames/home/frame.tsx",
			lines: [4, 4],
			selector: "main > h1",
			excerpt: '<h1 className="title">Two coffees</h1>',
		});
	});

	it("keeps the stamped line when the file can't be read, and the live markup for generated DOM", () => {
		expect(elementHandles(picked, designStamp(picked.source), undefined)).toMatchObject({
			lines: [4, 4],
			excerpt: '<h1 class="title">Two coffees</h1>',
		});
		const generated = { ...picked, generated: true, outerHtml: "<li>one</li>" };
		expect(elementHandles(generated, designStamp(picked.source), FILE)).toMatchObject({
			name: "li",
			lines: [4, 4],
			excerpt: "<li>one</li>",
			generated: true,
		});
	});

	it("degrades an unstamped element to its frame's file", () => {
		expect(elementHandles({ ...picked, source: null }, undefined, undefined)).toEqual({
			name: "h1",
			path: "design/frames/home/frame.tsx",
			lines: [1, 1],
			selector: "main > h1",
			excerpt: '<h1 class="title">Two coffees</h1>',
			generated: true,
		});
	});

	it("takes no stamp outside design/", () => {
		for (const stamp of [
			"../secrets.tsx:1:1",
			"/etc/passwd:1:1",
			"frames/../../x.tsx:1:1",
			"C:/x.tsx:1:1",
			"x.tsx:0:1",
		])
			expect(designStamp(stamp), stamp).toBeUndefined();
		expect(designStamp("frames/./home/frame.tsx:2:3")).toEqual({ rel: "frames/home/frame.tsx", line: 2, column: 3 });
	});
});
