/**
 * What the name label calls an element (#339).
 *
 * The component whose whole output the element is, read off React's fiber:
 * the outermost component that renders this one host element and nothing
 * beside it. A heading a `Heading` component returns reads `Heading`, and a
 * button inside a card component reads as a button, because the card also
 * draws the rest of the card. Where no component owns the element whole, it is
 * a word for its tag (`h1` is Heading, `a` is Link, `nav` is Navigation), a
 * plain run of words is Text, and a plain `div` is a Group.
 *
 * The shim carries a copy of this function, interpolated into its source, so
 * the rule is written and tested once. That is why it is one function with
 * nothing named inside it: the copy has no module around it, and a dev build
 * that keeps names wraps every inner function in a helper the frame does not
 * have.
 */
export function elementName(el: Element): string {
	const tags: Record<string, string> = {
		h1: "Heading",
		h2: "Heading",
		h3: "Heading",
		h4: "Heading",
		h5: "Heading",
		h6: "Heading",
		p: "Paragraph",
		a: "Link",
		button: "Button",
		img: "Image",
		picture: "Image",
		video: "Video",
		canvas: "Canvas",
		svg: "Icon",
		section: "Section",
		header: "Header",
		footer: "Footer",
		nav: "Navigation",
		main: "Main",
		aside: "Aside",
		article: "Article",
		ul: "List",
		ol: "List",
		li: "List item",
		form: "Form",
		input: "Input",
		textarea: "Input",
		select: "Select",
		label: "Label",
		code: "Code",
		pre: "Code block",
		figure: "Figure",
		figcaption: "Caption",
		blockquote: "Quote",
		table: "Table",
		strong: "Text",
		em: "Text",
		small: "Text",
		details: "Details",
		summary: "Summary",
		hr: "Divider",
	};
	// host fibers: a DOM element, a hoisted one, a singleton (html, body, head)
	const host = [5, 26, 27];
	type Fiber = {
		tag: number;
		type: unknown;
		return: Fiber | null;
		child: Fiber | null;
		sibling: Fiber | null;
		stateNode: unknown;
	};
	const key = Object.keys(el).find((name) => name.startsWith("__reactFiber$"));
	const fiber = key === undefined ? null : ((el as unknown as Record<string, Fiber | undefined>)[key] ?? null);
	let found: string | null = null;
	for (let up = fiber?.return ?? null; up !== null && !host.includes(up.tag); up = up.return) {
		// the name a component goes by, through memo and forwardRef wrappers
		let name: string | null = null;
		let type: unknown = up.type;
		for (let depth = 0; depth < 4 && name === null && type !== null && type !== undefined; depth++) {
			if (typeof type === "function") {
				const fn = type as { displayName?: unknown; name?: unknown };
				name =
					typeof fn.displayName === "string" && fn.displayName !== ""
						? fn.displayName
						: typeof fn.name === "string" && fn.name !== ""
							? fn.name
							: null;
				break;
			}
			if (typeof type !== "object") break;
			const wrapped = type as { displayName?: unknown; type?: unknown; render?: unknown };
			if (typeof wrapped.displayName === "string" && wrapped.displayName !== "") name = wrapped.displayName;
			else type = wrapped.type ?? wrapped.render;
		}
		if (name === null) continue;
		// the host elements the component draws at its top: the element has to be
		// the only one, or the component is more than this element
		const roots: Fiber[] = [];
		const pending: Fiber[] = [];
		for (let child = up.child; child !== null; child = child.sibling) pending.push(child);
		while (pending.length > 0 && roots.length < 2) {
			const next = pending.shift();
			if (next === undefined) break;
			if (host.includes(next.tag) || next.tag === 6) {
				roots.push(next);
				continue;
			}
			const inner: Fiber[] = [];
			for (let child = next.child; child !== null; child = child.sibling) inner.push(child);
			pending.unshift(...inner);
		}
		if (roots.length === 1 && roots[0]?.stateNode === el) found = name;
		else break;
	}
	if (found !== null) return found;
	const known = tags[el.localName];
	if (known !== undefined) return known;
	if (el.namespaceURI === "http://www.w3.org/2000/svg") return "Shape";
	let words = false;
	for (const node of Array.from(el.childNodes)) {
		if (node.nodeType === 3 && (node.nodeValue ?? "").trim() !== "") words = true;
	}
	return words && el.children.length === 0 ? "Text" : "Group";
}
