import { parse } from "@babel/parser";
import type { JSXOpeningElement, Node } from "@babel/types";
import { describe, expect, it } from "vitest";
import { type ClassSlot, classSlotOf } from "./class-literal";
import { walkNodes } from "./jsx-walk";

/**
 * Where a class write lands (#315): the literal, the first string of a
 * `cn()`, nowhere yet, or the computed expression the hand may not touch.
 */

const VOICE = `import { cn } from "../../shared/lib/utils";

export default function Voice({ tone, open }: { tone: string; open: boolean }) {
	return (
		<section>
			<div className={cn("flex flex-col gap-3 px-5 py-4", tone === "right" && "border-border border-l")}>a</div>
			<p className="text-sm text-muted">b</p>
			<span className={MONO}>c</span>
			<i className={\`dot dot-\${tone}\`} />
			<b className={cn(open && "border", "bg-raised")}>d</b>
			<q className={cn(open && "border")}>h</q>
			<em className={'p-2'}>e</em>
			<u>f</u>
			<s className>g</s>
		</section>
	);
}
`;

/**
 * The opening tag the element this snippet starts carries, which is what the
 * write lane hands over — it parses the file once per call and asks about the
 * tags it already found.
 */
function slotAt(snippet: string): ClassSlot {
	const at = VOICE.indexOf(snippet);
	if (at === -1) throw new Error(`no ${snippet}`);
	const before = VOICE.slice(0, at);
	const line = before.split("\n").length;
	const column = at - (before.lastIndexOf("\n") + 1) + 1;
	const program = parse(VOICE, { sourceType: "module", plugins: ["jsx", "typescript"] }).program as Node;
	let opening: JSXOpeningElement | undefined;
	walkNodes(program, [], (node) => {
		if (node.type !== "JSXElement") return;
		if (node.loc?.start.line === line && node.loc.start.column + 1 === column) opening = node.openingElement;
	});
	if (opening === undefined) throw new Error(`no element at ${snippet}`);
	return classSlotOf(VOICE, opening);
}

describe("classSlotOf", () => {
	it("finds a literal className between its quotes", () => {
		const found = slotAt("<p ");
		expect(found).toMatchObject({ kind: "literal", value: "text-sm text-muted", raw: "text-sm text-muted" });
		if (found.kind !== "literal") throw new Error("not a literal");
		expect(VOICE.slice(found.start, found.end)).toBe("text-sm text-muted");
		expect(found.quote).toBeUndefined();
	});

	it("edits the first string of a cn call and leaves the condition to the file", () => {
		const found = slotAt("<div ");
		expect(found).toMatchObject({ kind: "literal", value: "flex flex-col gap-3 px-5 py-4", quote: '"' });
		if (found.kind !== "literal") throw new Error("not a literal");
		expect(VOICE.slice(found.end)).toMatch(/^", tone === "right" && "border-border border-l"\)\}>a<\/div>/);
	});

	it("skips a cn argument that is not a string on its way to the first one that is", () => {
		expect(slotAt("<b ")).toMatchObject({ kind: "literal", value: "bg-raised" });
		// a call with no string argument at all is computed, however it is called
		expect(slotAt("<q ")).toMatchObject({
			kind: "computed",
			expression: '{cn(open && "border")}',
		});
	});

	it("takes a string in braces as the JS literal it is", () => {
		expect(slotAt("<em ")).toMatchObject({ kind: "literal", value: "p-2", quote: "'" });
	});

	it("names the place a new className goes when there is none", () => {
		const found = slotAt("<u>");
		expect(found.kind).toBe("none");
		if (found.kind !== "none") throw new Error("not none");
		expect(VOICE.slice(found.at - 1, found.at + 1)).toBe("u>");
		expect(slotAt("<s ")).toMatchObject({ kind: "bare" });
	});

	it("refuses a variable and a template with the line to edit", () => {
		expect(slotAt("<span ")).toEqual({ kind: "computed", line: 8, expression: "{MONO}" });
		expect(slotAt("<i ")).toMatchObject({ kind: "computed", line: 9 });
	});
});
