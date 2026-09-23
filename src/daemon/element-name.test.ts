// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { elementName, wholeComponent } from "./element-name";

/**
 * What the name label calls an element (#339), over the same fiber shape React
 * hangs on every host node. Each case builds the smallest tree that says it:
 * host fibers (tag 5) for DOM elements, text fibers (tag 6), and function
 * components (tag 0) between them.
 */

interface Fiber {
	tag: number;
	type: unknown;
	return: Fiber | null;
	child: Fiber | null;
	sibling: Fiber | null;
	stateNode: unknown;
}

function fiber(tag: number, type: unknown, stateNode: unknown = null): Fiber {
	return { tag, type, return: null, child: null, sibling: null, stateNode };
}

/** Parent the fibers under one another, in order, and hand back the first. */
function under(parent: Fiber, ...children: Fiber[]): Fiber {
	parent.child = children[0] ?? null;
	children.forEach((child, index) => {
		child.return = parent;
		child.sibling = children[index + 1] ?? null;
	});
	return parent;
}

/** A DOM element with its host fiber on it, the way React leaves one. */
function hosted(tag: string, words = ""): { el: HTMLElement; fiber: Fiber } {
	const el = document.createElement(tag);
	if (words !== "") el.textContent = words;
	const host = fiber(5, tag, el);
	Reflect.set(el, "__reactFiber$test", host);
	return { el, fiber: host };
}

function Heading() {}
function Card() {}
function Page() {}

describe("elementName", () => {
	it("names the component whose whole output the element is", () => {
		const { el, fiber: h1 } = hosted("h1", "Hello");
		under(fiber(5, "main"), under(fiber(0, Heading), h1));
		expect(elementName(el)).toBe("Heading");
	});

	it("takes the outermost component that is still only this element", () => {
		const { el, fiber: button } = hosted("button", "Pay");
		const inner = under(fiber(0, Heading), button);
		const outer = under(fiber(0, Card), inner);
		under(fiber(5, "main"), outer);
		expect(elementName(el)).toBe("Card");
	});

	it("stops at a component that draws more than this element", () => {
		const { el, fiber: button } = hosted("button", "Pay");
		const { fiber: title } = hosted("h2", "Cart");
		// Card draws a heading and the button, so the button is not all of Card
		under(fiber(5, "main"), under(fiber(0, Card), title, button));
		expect(elementName(el)).toBe("Button");
	});

	it("reads a component through memo and forwardRef, and by its display name", () => {
		const { el, fiber: p } = hosted("p", "Note");
		under(fiber(14, { $$typeof: Symbol.for("react.memo"), type: { render: Page } }), p);
		expect(elementName(el)).toBe("Page");

		const named = hosted("p", "Note");
		under(
			fiber(
				0,
				Object.assign(() => {}, { displayName: "Lede" }),
			),
			named.fiber,
		);
		expect(elementName(named.el)).toBe("Lede");
	});

	it("falls back to a word for the tag where no component owns it whole", () => {
		expect(elementName(hosted("h1", "Hello").el)).toBe("Heading");
		expect(elementName(hosted("a", "Home").el)).toBe("Link");
		expect(elementName(hosted("nav").el)).toBe("Navigation");
		expect(elementName(hosted("li", "brygg").el)).toBe("List item");
	});

	it("calls a plain div a Group, and plain words Text", () => {
		const group = hosted("div");
		group.el.append(document.createElement("span"));
		expect(elementName(group.el)).toBe("Group");
		expect(elementName(hosted("div").el)).toBe("Group");
		expect(elementName(hosted("span", "canvas-chrome.tsx").el)).toBe("Text");
	});

	it("names an element React never saw by its tag alone", () => {
		expect(elementName(document.createElement("section"))).toBe("Section");
		expect(elementName(document.createElementNS("http://www.w3.org/2000/svg", "circle"))).toBe("Shape");
	});
});

describe("wholeComponent", () => {
	it("is the component alone, and nothing where the tag names the element", () => {
		const { el, fiber: h1 } = hosted("h1", "Hello");
		under(fiber(5, "main"), under(fiber(0, Heading), h1));
		expect(wholeComponent(el)).toBe("Heading");
		// the tree tells `<Heading>` from `<h1>`, which the name label cannot
		expect(wholeComponent(hosted("h1", "Hello").el)).toBeNull();
		expect(elementName(hosted("h1", "Hello").el)).toBe("Heading");
	});
});
