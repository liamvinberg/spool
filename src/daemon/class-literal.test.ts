import { describe, expect, it } from "vitest";
import { classLiteralAt } from "./class-literal";

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

function stamp(snippet: string): string {
	const at = VOICE.indexOf(snippet);
	if (at === -1) throw new Error(`no ${snippet}`);
	const before = VOICE.slice(0, at);
	return `frames/system/voice/frame.tsx:${before.split("\n").length}:${at - (before.lastIndexOf("\n") + 1) + 1}`;
}

describe("classLiteralAt", () => {
	it("finds a literal className between its quotes", () => {
		const found = classLiteralAt(VOICE, stamp("<p "));
		expect(found).toMatchObject({ kind: "literal", value: "text-sm text-muted", raw: "text-sm text-muted" });
		if (found.kind !== "literal") throw new Error("not a literal");
		expect(VOICE.slice(found.start, found.end)).toBe("text-sm text-muted");
		expect(found.quote).toBeUndefined();
	});

	it("edits the first string of a cn call and leaves the condition to the file", () => {
		const found = classLiteralAt(VOICE, stamp("<div "));
		expect(found).toMatchObject({ kind: "literal", value: "flex flex-col gap-3 px-5 py-4", quote: '"' });
		if (found.kind !== "literal") throw new Error("not a literal");
		expect(VOICE.slice(found.end)).toMatch(/^", tone === "right" && "border-border border-l"\)\}>a<\/div>/);
	});

	it("skips a cn argument that is not a string on its way to the first one that is", () => {
		expect(classLiteralAt(VOICE, stamp("<b "))).toMatchObject({ kind: "literal", value: "bg-raised" });
		// a call with no string argument at all is computed, however it is called
		expect(classLiteralAt(VOICE, stamp("<q "))).toMatchObject({
			kind: "computed",
			expression: '{cn(open && "border")}',
		});
	});

	it("takes a string in braces as the JS literal it is", () => {
		expect(classLiteralAt(VOICE, stamp("<em "))).toMatchObject({ kind: "literal", value: "p-2", quote: "'" });
	});

	it("names the place a new className goes when there is none", () => {
		const found = classLiteralAt(VOICE, stamp("<u>"));
		expect(found.kind).toBe("none");
		if (found.kind !== "none") throw new Error("not none");
		expect(VOICE.slice(found.at - 1, found.at + 1)).toBe("u>");
		expect(classLiteralAt(VOICE, stamp("<s "))).toMatchObject({ kind: "bare" });
	});

	it("refuses a variable and a template with the file and line to edit", () => {
		expect(classLiteralAt(VOICE, stamp("<span "))).toEqual({
			kind: "computed",
			file: "frames/system/voice/frame.tsx",
			line: 8,
			expression: "{MONO}",
		});
		expect(classLiteralAt(VOICE, stamp("<i "))).toMatchObject({ kind: "computed", line: 9 });
	});

	it("has nothing for a stamp the file no longer has anything at", () => {
		expect(classLiteralAt(VOICE, "frames/system/voice/frame.tsx:99:1")).toEqual({ kind: "stale" });
		expect(classLiteralAt("const x = <", stamp("<p "))).toEqual({ kind: "stale" });
	});
});
