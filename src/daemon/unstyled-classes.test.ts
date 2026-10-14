import { describe, expect, it } from "vitest";
import { escapeClass, namedClasses, unstyledClasses, unstyledWarning } from "./unstyled-classes";

describe("classes with no CSS", () => {
	it("reads the classes a className and a cn call name, and no other string", () => {
		const source = `const label = "text-subtle is just words";
export function A({ on }) {
	return (
		<div className="bg-white p-4" data-x="text-faded">
			<p className={cn("text-lg", on && "border-ghost", { "shadow-soft": on })} />
			<p className={\`rounded-xl \${on ? "x" : ""} font-display\`} />
			<p className='leading-tight' />
		</div>
	);
}`;
		expect(namedClasses(source)).toEqual([
			"bg-white",
			"p-4",
			"text-lg",
			"border-ghost",
			"shadow-soft",
			"rounded-xl",
			"font-display",
			"leading-tight",
			"text-lg",
			"border-ghost",
			"shadow-soft",
		]);
	});

	it("reports a themed class the stylesheet has no rule for, through its variants, and nothing else", () => {
		const css = `.p-4 { padding: 1rem; }
.text-lg { font-size: 1.125rem; }
.hover\\:bg-ink:hover { background: #000; }
.bg-white\\/50 { background: rgb(255 255 255 / .5); }
.text-subtle-strong { color: gray; }`;
		const source = `export const A = () => <div className="p-4 text-lg hover:bg-ink bg-white/50 bg-white text-subtle hover:bg-paper card is-open group/item bg-[#fff] !text-ghost" />;`;
		expect(
			unstyledClasses(
				[
					{ file: "/d/frames/a/frame.tsx", text: source },
					{ file: "/d/shared/tokens.css", text: '.x { content: "bg-nothing" }' },
				],
				css,
			),
		).toEqual(["bg-white", "text-subtle", "hover:bg-paper", "!text-ghost"]);
	});

	it("finds a selector wherever no more of a name follows it, the end of the sheet and a non-ASCII letter included", () => {
		const css = `.bg-inkk{}.bg-ink-2\\:x{}.text-é{}.text-lineé{}.md\\:bg-wash:hover{}.text-tail\\\\.rounded-end`;
		const names = [
			"bg-ink",
			"bg-inkk",
			"bg-ink-2",
			"bg-ink-2:x",
			"text-é",
			"text-line",
			"md:bg-wash",
			"bg-wash",
			"text-tail\\",
			"text-tail",
			"rounded-end",
			"rounded-en",
		];
		const source = `export const A = () => <div className="${names.join(" ")}" />;`;
		expect(unstyledClasses([{ file: "/d/frames/a/frame.tsx", text: source }], css)).toEqual([
			"bg-ink",
			"bg-ink-2",
			"bg-wash",
			"text-tail",
			"rounded-en",
		]);
	});

	it("escapes a class the way its selector is written", () => {
		expect(escapeClass("md:hover:bg-white/50")).toBe("md\\:hover\\:bg-white\\/50");
		expect(escapeClass("2xl:p-1.5")).toBe("\\32 xl\\:p-1\\.5");
	});

	it("says them in one line, and nothing for none", () => {
		expect(unstyledWarning([])).toBeUndefined();
		expect(unstyledWarning(["bg-white", "text-subtle"])).toBe(
			"classes with no CSS: bg-white, text-subtle (no token or utility builds them)",
		);
		const many = Array.from({ length: 14 }, (_, i) => `bg-c${i}`);
		expect(unstyledWarning(many)).toContain("bg-c11, and 2 more (");
	});
});
