import { elementName, wholeComponent } from "../../daemon/element-name";
import { stampNow } from "./stamps";

/**
 * What a hand stands on (#23, #339): the element ancestry at a point or a
 * step from a selection, each element as a hit with its selector, geometry and
 * nearest data-spool-source stamp, and the element tree the pages rail draws.
 */

/** The React fiber a host element carries, the little of it read here. */
interface Fiber {
	return: Fiber | null;
	stateNode: unknown;
	memoizedProps: unknown;
	type: unknown;
}

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** A map's row: the map call's stamp and the row's place in its array (#324). */
interface Row {
	map: string;
	index: number;
}

export interface Hit {
	selector: string;
	tag: string;
	outerHtml: string;
	rect: Rect;
	rects?: Rect[];
	words: boolean;
	name?: string;
	radius: number;
	item?: Row & { selector: string };
	owner?: string;
	spills?: string[];
	source: string | null;
	generated: boolean;
}

function fiberOf(el: Element): Fiber | null {
	const key = Object.keys(el).find((name) => name.startsWith("__reactFiber$"));
	return key ? (Reflect.get(el, key) as Fiber) : null;
}

/** A reader the jsx runtime put on the window (runtime/jsx-dev-runtime.ts), or nothing before it has. */
function runtimeReader<T>(name: "__spoolItemSiteOf" | "__spoolCallSiteOf"): ((props: unknown) => T) | null {
	const reader: unknown = Reflect.get(window, name);
	return typeof reader === "function" ? (reader as (props: unknown) => T) : null;
}

function isElement(node: unknown): node is Element {
	return !!node && (node as Node).nodeType === 1;
}

function isComponent(type: unknown): boolean {
	return (
		typeof type === "function" ||
		(!!type &&
			typeof type === "object" &&
			(typeof (type as { type?: unknown }).type === "function" ||
				typeof (type as { render?: unknown }).render === "function"))
	);
}

// selector below the boot root: tags with :nth-of-type where siblings repeat.
// The whole way up, because a path cut short names every element that ends
// the same way: a page that repeats a card deep down is one selector for
// all of its copies, and a hand on the second would act on the first (#342)
export function cssPath(el: Element): string {
	const parts: string[] = [];
	let node: Element | null = el;
	while (node && node.nodeType === 1 && node !== document.body && node.id !== "root") {
		if (node.id) {
			parts.unshift(`#${node.id}`);
			return parts.join(" > ");
		}
		let seg = node.tagName.toLowerCase();
		const parent: Element | null = node.parentElement;
		if (parent) {
			const tagName = node.tagName;
			const same = Array.from(parent.children).filter((c) => c.tagName === tagName);
			if (same.length > 1) seg += `:nth-of-type(${same.indexOf(node) + 1})`;
		}
		parts.unshift(seg);
		node = parent;
	}
	return parts.join(" > ");
}

// whether the element has words of its own, which is what makes it something
// a double-click could open rather than descend into (#321)
function hasWords(el: Element): boolean {
	for (let i = 0; i < el.childNodes.length; i++) {
		const node = el.childNodes[i] as ChildNode;
		if (node.nodeType === 3 && node.nodeValue && node.nodeValue.trim() !== "") return true;
	}
	return false;
}

// Which row of a list this element is drawn as (#324).
//
// A map call renders one JSX element once per entry, so the stamp under the
// pointer is every row at once. The runtime noted each child's place in the
// array it stood in as that call was made; this walks the same fiber handle
// ownerOf walks, up to the nearest element that was one of them, and says
// the stamp of that element and its index. The selector is the item's own
// root in the document — a component's outermost DOM when the row is a
// component — so taking the row out takes the whole row.
function itemOf(el: Element): (Row & { selector: string }) | null {
	const siteOf = runtimeReader<{ stamp?: unknown; index?: unknown } | undefined>("__spoolItemSiteOf");
	if (siteOf === null) return null;
	let fiber = fiberOf(el);
	let host = el;
	while (fiber) {
		if (isElement(fiber.stateNode)) host = fiber.stateNode;
		const props = fiber.memoizedProps;
		const site = props && typeof props === "object" ? siteOf(props) : undefined;
		if (site && typeof site.stamp === "string" && typeof site.index === "number") {
			return { map: stampNow(site.stamp), index: site.index, selector: cssPath(host) };
		}
		fiber = fiber.return;
	}
	return null;
}

export function hitOf(el: Element, selects: boolean): Hit {
	let stamped: Element | null = el;
	while (stamped && stamped.nodeType === 1 && !stamped.hasAttribute("data-spool-source")) {
		stamped = stamped.parentElement;
	}
	const source = stamped && stamped.nodeType === 1 ? stamped.getAttribute("data-spool-source") : null;
	const rect = el.getBoundingClientRect();
	let radius = 0;
	try {
		radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
	} catch {}
	let item: (Row & { selector: string }) | null = null;
	let name: string | null = null;
	let owner: string | null = null;
	// a hover asks for a chain many times a second and deletes nothing, so
	// it walks no fibers: the item context, the name label and the call one
	// owner up, which a move addresses instead of a whole return (#340), are
	// the selection's alone
	if (selects) {
		try {
			item = itemOf(el);
		} catch {}
		try {
			// what the name label calls it (#339)
			name = elementName(el);
		} catch {}
		try {
			owner = ownerOf(el);
		} catch {}
	}
	// an inline element that wraps is drawn as one box per line, and the box
	// around all of them is a shape it has nowhere on screen (#321)
	const lines: Rect[] = [];
	try {
		const drawn = el.getClientRects();
		for (let i = 0; i < drawn.length && i < 60; i++) {
			const box = drawn[i] as DOMRect;
			lines.push({ x: box.x, y: box.y, w: box.width, h: box.height });
		}
	} catch {}
	// what is in it is wider or taller than the box it is in (#324): the ring
	// stays the element's own box and says so along the side it runs past
	const spills: string[] = [];
	if (selects) {
		try {
			if (el.scrollWidth > el.clientWidth + 0.5) spills.push("right");
			if (el.scrollHeight > el.clientHeight + 0.5) spills.push("bottom");
			if (spills.length === 0) {
				const range = document.createRange();
				range.selectNodeContents(el);
				const ink = range.getBoundingClientRect();
				if (ink.width > rect.width + 0.5) spills.push("right");
				if (ink.height > rect.height + 0.5) spills.push("bottom");
				range.detach();
			}
		} catch {}
	}
	return {
		selector: cssPath(el),
		tag: el.tagName.toLowerCase(),
		outerHtml: el.outerHTML.slice(0, 240),
		rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
		...(lines.length > 1 ? { rects: lines } : {}),
		words: hasWords(el),
		...(name === null ? {} : { name }),
		radius,
		...(item === null ? {} : { item }),
		...(owner === null ? {} : { owner }),
		...(spills.length === 0 ? {} : { spills }),
		source,
		generated: stamped !== el,
	};
}

// the ancestry of one element, top-level element first, deepest last
export function chainOf(el: Element, selects: boolean): Hit[] {
	const line: Element[] = [];
	let node: Element | null = el;
	while (
		node &&
		node.nodeType === 1 &&
		node !== document.documentElement &&
		node !== document.body &&
		node.id !== "root"
	) {
		line.unshift(node);
		node = node.parentElement;
	}
	return line.map((node) => hitOf(node, selects));
}

// the outermost svg an element is drawn inside, or the element itself: the
// paths of an icon are the icon's, never something a hand picks one by one
function outsideSvg(el: Element): Element {
	let at = el;
	for (let up: Element | null = el; up && up.nodeType === 1; up = up.parentElement) {
		if (up.namespaceURI === "http://www.w3.org/2000/svg" && up.localName === "svg") at = up;
	}
	return at;
}

// an element a selection may stand on: not the frame's own scaffolding, not
// a line break, and not a piece of an icon
function selectable(el: Element | null | undefined): el is Element {
	if (el?.nodeType !== 1 || el === document.documentElement || el === document.body || el.id === "root") return false;
	if (el.localName === "br" || el.localName === "script" || el.localName === "style" || el.localName === "template")
		return false;
	return outsideSvg(el) === el;
}

// the ancestry at the point, down to the deepest element under it (#339)
export function pickChain(x: number, y: number, selects: boolean): Hit[] {
	const hit = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
	if (!hit || hit === document.documentElement || hit === document.body || hit.id === "root") return [];
	return chainOf(outsideSvg(hit), selects);
}

// A selector back to its element. cssPath stops at the boot root and takes a
// shortcut through any id it passes, so the match is confirmed by rebuilding
// the path rather than trusted: one query can answer for a different element.
export function elementFor(selector: string | null | undefined): Element | null {
	if (!selector) return null;
	let found: Element | null = null;
	try {
		const all = document.querySelectorAll(selector);
		for (let i = 0; i < all.length; i++) {
			const one = all[i] as Element;
			if (cssPath(one) === selector) {
				found = one;
				break;
			}
		}
	} catch {}
	return found;
}

// the elements a selection can stand on directly inside one, in order
function familyOf(el: Element | null): Element[] {
	if (!el || outsideSvg(el) !== el || (el.namespaceURI === "http://www.w3.org/2000/svg" && el.localName === "svg"))
		return [];
	return Array.from(el.children).filter(selectable);
}

// the boot root, which is the frame: what a selector of nothing stands for
function bootRoot(): HTMLElement {
	return document.getElementById("root") || document.body;
}

// the ancestry of one element's kin (#254, #339): the keyboard's step, named
// by kinship because there is no pointer to name it by position. Tab walks
// round the row, so the last sibling's next is the first
export function kinChain(selector: string | null | undefined, step: unknown, selects: boolean): Hit[] {
	const from = selector ? elementFor(selector) : bootRoot();
	if (!from) return [];
	let kin: Element | null = null;
	if (step === "self") kin = from;
	else if (step === "child") kin = familyOf(from)[0] || null;
	else if (step === "next" || step === "previous") {
		const row = familyOf(from.parentElement);
		const at = row.indexOf(from);
		if (at >= 0 && row.length > 1) kin = row[(at + (step === "next" ? 1 : row.length - 1)) % row.length] as Element;
	}
	if (!selectable(kin)) return [];
	return chainOf(kin, selects);
}

// A whole generation at once (#339): the children of a group, which Enter
// and a double-click on one select, or the siblings of an element, which ⌘A
// does. The answer is the ancestry of the parent they share, empty where
// that parent is the frame, and each of them as a hit of its own.
export function familyAt(
	selector: string | null | undefined,
	of: "children" | "siblings",
): { chain: Hit[]; hits: Hit[] } | null {
	const from = selector ? elementFor(selector) : bootRoot();
	if (!from) return null;
	const parent = of === "children" ? from : from.parentElement;
	if (!parent) return null;
	const root = parent === bootRoot() || parent === document.body || parent === document.documentElement;
	if (!root && !selectable(parent)) return null;
	return { chain: root ? [] : chainOf(parent, true), hits: familyOf(parent).map((el) => hitOf(el, true)) };
}

// The frame's elements as the pages rail draws them (#342): every element a
// selection can stand on, in document order, each with the index of the
// one it sits in. It is the walk familyOf makes one level at a time, so a
// row is exactly an element a click or a key can hold, hidden or not. A
// row reads like the code: the component whose whole output the element
// is, its own words, the file its stamp names, and for the root of a row a
// map renders, that map and its place in it.
const TREE_MOST = 5000;

interface TreeNode {
	selector: string;
	parent: number;
	tag: string;
	component: string | null;
	words: string | null;
	file: string | null;
	row: Row | null;
}

function ownWordsOf(el: Element): string | null {
	let out = "";
	let any = false;
	for (let i = 0; i < el.childNodes.length; i++) {
		const node = el.childNodes[i] as ChildNode;
		if (node.nodeType === 3) {
			if (node.nodeValue && node.nodeValue.trim() !== "") any = true;
			out += node.nodeValue || "";
		} else if (node.nodeType === 1) out += (node as Element).localName === "br" ? " " : node.textContent || "";
	}
	if (!any) return null;
	const flat = out.replace(/\s+/g, " ").trim();
	return flat.length > 120 ? flat.slice(0, 120) : flat;
}

// the row a map renders, asked of its root alone: itemOf answers for
// anything inside a row, and a heading inside a row is not the row
function rowRootOf(el: Element): Row | null {
	const siteOf = runtimeReader<{ stamp?: unknown; index?: unknown } | undefined>("__spoolItemSiteOf");
	if (siteOf === null) return null;
	const own = fiberOf(el);
	for (let fiber = own; fiber; fiber = fiber.return) {
		if (fiber !== own && isElement(fiber.stateNode)) return null;
		const props = fiber.memoizedProps;
		const site = props && typeof props === "object" ? siteOf(props) : undefined;
		if (site && typeof site.stamp === "string" && typeof site.index === "number") {
			return { map: stampNow(site.stamp), index: site.index };
		}
	}
	return null;
}

export function elementTree(): TreeNode[] {
	const nodes: TreeNode[] = [];
	const visit = (parent: Element, at: number): void => {
		const kids = familyOf(parent);
		for (let i = 0; i < kids.length && nodes.length < TREE_MOST; i++) {
			const el = kids[i] as Element;
			const stamped = el.closest("[data-spool-source]");
			const source = stamped ? stamped.getAttribute("data-spool-source") || "" : "";
			let component: string | null = null;
			let row: Row | null = null;
			try {
				component = wholeComponent(el);
			} catch {}
			try {
				row = rowRootOf(el);
			} catch {}
			nodes.push({
				selector: cssPath(el),
				parent: at,
				tag: el.tagName.toLowerCase(),
				component,
				words: ownWordsOf(el),
				file: source === "" ? null : source.replace(/:\d+:\d+$/, ""),
				row,
			});
			visit(el, nodes.length - 1);
		}
	};
	visit(bootRoot(), -1);
	return nodes;
}

// The call one owner up: the nearest component above the element, and the
// stamp of the call that passed it its props, which the runtime kept.
export function ownerOf(el: Element): string | null {
	const siteOf = runtimeReader<unknown>("__spoolCallSiteOf");
	if (siteOf === null) return null;
	let fiber = fiberOf(el);
	// biome-ignore lint/suspicious/noAssignInExpressions: the walk starts one fiber up
	while (fiber && (fiber = fiber.return)) {
		if (!isComponent(fiber.type)) continue;
		const site = siteOf(fiber.memoizedProps);
		return typeof site === "string" ? stampNow(site) : null;
	}
	return null;
}

// Whether an element is the outermost one a component returns: no element
// stands between it and the component that rendered it.
export function wholeReturn(el: Element): boolean {
	let fiber = fiberOf(el);
	// biome-ignore lint/suspicious/noAssignInExpressions: the walk starts one fiber up
	while (fiber && (fiber = fiber.return)) {
		if (isElement(fiber.stateNode)) return false;
		if (isComponent(fiber.type)) return true;
	}
	return false;
}
