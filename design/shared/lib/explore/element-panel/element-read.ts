import source from "./landing-source.json";

/**
 * What the panel can say about one element of the real landing (spool-cloud#188).
 *
 * Everything is read off the running document the way the canvas shim reads it:
 * the stamp for where it is written, the React fiber for the component whose
 * whole output it is, the item map for a mapped row. What the write lane would
 * answer comes from `landing-source.json`, a parse of the same files (see
 * `read-source.mjs`), so a refusal names what the file actually writes.
 */

interface Child {
	t: "text" | "expr" | "el";
	v?: string;
	code?: string;
}

interface Written {
	tag: string;
	intrinsic: boolean;
	parentKey: string | null;
	place: "jsx" | "row" | "return" | "expression";
	rows: { over: string; literal: boolean } | null;
	children: Child[];
	props: Record<string, { lit?: string; expr?: string }>;
}

const ELEMENTS = source.elements as unknown as Record<string, Written>;
/** the frames that render these files; the one on screen is the first */
export const REACH: readonly string[] = source.reach;
export const FRAME = REACH[0] ?? "site/landing-current";

export type Answer = { ok: true; says: string; where?: string } | { ok: false; says: string };

export interface Stamp {
	file: string;
	line: number;
	key: string | null;
}

export interface ElementRead {
	el: Element;
	name: string;
	tag: string;
	stamp: Stamp | null;
	/** the component the element sits inside, when it is not that component's whole output */
	within: string | null;
	/** the component whose whole output this element is, and the call that renders it */
	component: { name: string; call: Stamp | null } | null;
	/** the element's own words, `null` when it has none */
	words: string | null;
	text: Answer | null;
	remove: Answer;
	move: Answer;
	/** a mapped row: its place and how many rows the list renders */
	row: { index: number; count: number; over: string } | null;
	/** the other frames the file reaches */
	shared: readonly string[];
	hidden: boolean;
}

/* ---------- stamps ---------- */

const BY_LINE = new Map<string, { col: number; key: string }[]>();
for (const key of Object.keys(ELEMENTS)) {
	const match = /^(.*):(\d+):(\d+)$/.exec(key);
	if (match === null) continue;
	const at = `${match[1]}:${match[2]}`;
	const list = BY_LINE.get(at) ?? [];
	list.push({ col: Number(match[3]), key });
	BY_LINE.set(at, list);
}

/** design-relative, whatever root the compiler printed */
function designPath(file: string): string {
	for (const root of ["shared/", "frames/"]) {
		const at = file.lastIndexOf(`/${root}`);
		if (at >= 0) return file.slice(at + 1);
		if (file.startsWith(root)) return file;
	}
	return file;
}

export function parseStamp(raw: string | null | undefined): Stamp | null {
	const match = /^(.*):(\d+):(\d+)$/.exec(raw ?? "");
	if (match === null) return null;
	const file = designPath(match[1] ?? "");
	const line = Number(match[2]);
	const col = Number(match[3]);
	const onLine = BY_LINE.get(`${file}:${line}`) ?? [];
	let best: { col: number; key: string } | null = null;
	for (const entry of onLine) {
		if (best === null || Math.abs(entry.col - (col - 1)) < Math.abs(best.col - (col - 1))) best = entry;
	}
	return { file, line, key: best?.key ?? null };
}

const writtenAt = (stamp: Stamp | null): Written | null => (stamp?.key == null ? null : (ELEMENTS[stamp.key] ?? null));

/** `shared/ui/site/current/editorial-details/opening.tsx` → `opening.tsx` */
export const fileName = (file: string) => file.split("/").at(-1) ?? file;

/* ---------- fibers ---------- */

interface Fiber {
	tag: number;
	type: unknown;
	return: Fiber | null;
	child: Fiber | null;
	sibling: Fiber | null;
	stateNode: unknown;
	memoizedProps: unknown;
}

const HOST = new Set([5, 26, 27]);

function fiberOf(el: Element): Fiber | null {
	const key = Object.keys(el).find((name) => name.startsWith("__reactFiber$"));
	return key === undefined ? null : ((el as unknown as Record<string, Fiber>)[key] ?? null);
}

function componentName(type: unknown): string | null {
	if (typeof type === "function") {
		const fn = type as { displayName?: string; name?: string };
		return fn.displayName ?? (fn.name || null);
	}
	if (type !== null && typeof type === "object") {
		const held = type as { displayName?: string; type?: unknown; render?: unknown };
		return held.displayName ?? componentName(held.type) ?? componentName(held.render);
	}
	return null;
}

function hostRoots(fiber: Fiber): Fiber[] {
	const out: Fiber[] = [];
	const visit = (node: Fiber) => {
		for (let child = node.child; child !== null; child = child.sibling) {
			if (HOST.has(child.tag) || child.tag === 6) out.push(child);
			else visit(child);
		}
	};
	visit(fiber);
	return out;
}

/** the outermost component whose whole output is this element */
function rootComponentOf(el: Element): Fiber | null {
	const fiber = fiberOf(el);
	if (fiber === null) return null;
	let found: Fiber | null = null;
	for (let up = fiber.return; up !== null && !HOST.has(up.tag); up = up.return) {
		if (componentName(up.type) === null) continue;
		const roots = hostRoots(up);
		if (roots.length === 1 && roots[0]?.stateNode === el) found = up;
		else break;
	}
	return found;
}

function ownerOf(el: Element, skip: Fiber | null): Fiber | null {
	const fiber = fiberOf(el);
	let passed = skip === null;
	for (let up = fiber?.return ?? null; up !== null; up = up.return) {
		if (!passed) {
			if (up === skip) passed = true;
			continue;
		}
		if (componentName(up.type) !== null) return up;
	}
	return null;
}

function callOf(fiber: Fiber | null): Stamp | null {
	if (fiber === null) return null;
	const read = Reflect.get(window, "__spoolCallSiteOf") as ((props: unknown) => unknown) | undefined;
	const raw = typeof read === "function" ? read(fiber.memoizedProps) : undefined;
	return typeof raw === "string" ? parseStamp(raw) : null;
}

function itemOf(el: Element): { stamp: Stamp | null; index: number } | null {
	const read = Reflect.get(window, "__spoolItemSiteOf") as ((props: unknown) => unknown) | undefined;
	if (typeof read !== "function") return null;
	const fiber = fiberOf(el);
	// only the row's own host: a descendant of a row is not the row
	for (let up = fiber; up !== null; up = up.return) {
		if (up !== fiber && HOST.has(up.tag)) return null;
		const props = up.memoizedProps;
		if (props === null || typeof props !== "object") continue;
		const site = read(props) as { stamp?: unknown; index?: unknown } | undefined;
		if (site !== undefined && typeof site.stamp === "string" && typeof site.index === "number")
			return { stamp: parseStamp(site.stamp), index: site.index };
	}
	return null;
}

/* ---------- names ---------- */

const TAG: Record<string, string> = {
	h1: "Heading",
	h2: "Heading",
	h3: "Heading",
	h4: "Heading",
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
	ul: "List",
	ol: "List",
	li: "List item",
	form: "Form",
	input: "Input",
	label: "Label",
	code: "Code",
	pre: "Code block",
	figure: "Figure",
	figcaption: "Caption",
	strong: "Text",
	em: "Text",
	small: "Text",
	details: "Details",
	summary: "Summary",
	hr: "Divider",
};

export function ownWords(el: Element): string | null {
	let out = "";
	let any = false;
	for (const node of el.childNodes) {
		if (node.nodeType === 3) {
			const value = node.nodeValue ?? "";
			if (value.trim() !== "") any = true;
			out += value;
		} else if (node instanceof Element) {
			if (node.localName === "br") out += "\n";
			else out += node.textContent ?? "";
		}
	}
	return any ? out.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim() : null;
}

/** the component whose whole output the element is, by name */
export function componentOf(el: Element): string | null {
	const root = rootComponentOf(el);
	return root === null ? null : (componentName(root.type) ?? "Component");
}

/** a row a `.map()` renders, by what the file writes rather than by look-alike siblings */
export function isRow(el: Element): boolean {
	return writtenAt(parseStamp(el.getAttribute("data-spool-source")))?.place === "row";
}

export function nameOf(el: Element): string {
	const root = rootComponentOf(el);
	if (root !== null) return componentName(root.type) ?? "Component";
	const tag = el.localName;
	const known = TAG[tag];
	if (known !== undefined) return known;
	if (el.namespaceURI === "http://www.w3.org/2000/svg") return "Shape";
	return ownWords(el) !== null && el.children.length === 0 ? "Text" : "Group";
}

/* ---------- the tree ---------- */

/** an element the tree and the keys stop on: stamped, and not inside an icon */
export function isNode(el: Element): boolean {
	if (!el.hasAttribute("data-spool-source") || el.localName === "br") return false;
	const svg = el.parentElement?.closest("svg");
	return svg === null || svg === undefined;
}

export function childrenOf(el: Element): Element[] {
	const out: Element[] = [];
	const visit = (node: Element) => {
		for (const child of node.children) {
			if (isNode(child)) out.push(child);
			else if (child.localName !== "svg") visit(child);
		}
	};
	visit(el);
	return out;
}

export function parentOf(el: Element, root: Element): Element | null {
	for (let up = el.parentElement; up !== null && root.contains(up); up = up.parentElement) {
		if (up === root) return null;
		if (isNode(up)) return up;
	}
	return null;
}

export function pathOf(el: Element, root: Element): Element[] {
	const out: Element[] = [];
	for (let at: Element | null = el; at !== null; at = parentOf(at, root)) out.unshift(at);
	return out;
}

export function siblingsOf(el: Element, root: Element): Element[] {
	const parent = parentOf(el, root);
	return parent === null ? childrenOf(root) : childrenOf(parent);
}

/* ---------- what the lane would answer ---------- */

const WHERE = (stamp: Stamp | null) => (stamp === null ? undefined : `${fileName(stamp.file)}:${stamp.line}`);

function textAnswer(el: Element, stamp: Stamp | null, written: Written | null, row: boolean): Answer | null {
	if (ownWords(el) === null) return null;
	if (written === null) return { ok: false, says: "the words are drawn by code; ask the agent" };
	if (written.children.some((child) => child.t === "text")) return { ok: true, says: "Written here", where: WHERE(stamp) };
	const expr = written.children.find((child) => child.t === "expr")?.code ?? "";
	// words a caller passes: written where the component is used
	const owner = ownerOf(el, null);
	const props = owner?.memoizedProps;
	if (/^\w+$/.test(expr) && props !== null && typeof props === "object" && expr in props) {
		const call = callOf(owner);
		const passed = writtenAt(call)?.props[expr];
		const who = componentName(owner?.type) ?? "the component";
		if (passed?.lit !== undefined || passed?.expr?.startsWith("<"))
			return { ok: true, says: `Written where ${who} is used`, where: WHERE(call) };
		return { ok: false, says: `${expr} is computed at the call site` };
	}
	if (row && written.place === "row" && written.rows?.literal === true)
		return { ok: true, says: "Written in its list", where: WHERE(stamp) };
	return { ok: false, says: `${expr} is an expression; edit it in code or ask the agent` };
}

/** what moves and deletes as a unit: the call for a component's whole output, else the element */
function unitOf(el: Element): { stamp: Stamp | null; written: Written | null } {
	const root = rootComponentOf(el);
	const stamp = root === null ? parseStamp(el.getAttribute("data-spool-source")) : callOf(root);
	return { stamp, written: writtenAt(stamp) };
}

export function readElement(el: Element, root: Element): ElementRead {
	const stamp = parseStamp(el.getAttribute("data-spool-source"));
	const written = writtenAt(stamp);
	const rootFiber = rootComponentOf(el);
	const component =
		rootFiber === null ? null : { name: componentName(rootFiber.type) ?? "Component", call: callOf(rootFiber) };
	const owner = ownerOf(el, rootFiber);
	const item = itemOf(el);
	const unit = unitOf(el);

	let row: ElementRead["row"] = null;
	if (item !== null) {
		const count = siblingsOf(el, root).filter((sib) => sib.getAttribute("data-spool-source") === el.getAttribute("data-spool-source")).length;
		row = { index: item.index, count, over: unit.written?.rows?.over ?? writtenAt(item.stamp)?.rows?.over ?? "a list" };
	}

	let remove: Answer;
	if (row !== null) {
		const literal = unit.written?.rows?.literal ?? false;
		remove = literal
			? { ok: true, says: "⌫ removes this row from its list", where: WHERE(unit.stamp) }
			: { ok: false, says: `these rows come from \`${row.over}\`, an expression; ask the agent` };
	} else if (unit.written?.place === "expression") {
		remove = { ok: false, says: "it is written inside an expression; edit it in code or ask the agent" };
	} else if (component !== null) {
		remove = { ok: true, says: `⌫ removes this use of ${component.name}`, where: WHERE(component.call) };
	} else if (unit.written?.place === "return") {
		remove = { ok: false, says: "it is the whole of what a function returns; edit it in code or ask the agent" };
	} else if (unit.written === null) {
		remove = { ok: false, says: "the stamp hits nothing" };
	} else remove = { ok: true, says: "⌫ removes it", where: WHERE(unit.stamp) };

	let move: Answer;
	const siblings = siblingsOf(el, root).filter((sib) => {
		const other = unitOf(sib);
		if (row !== null) return sib.getAttribute("data-spool-source") === el.getAttribute("data-spool-source");
		return other.written !== null && other.written.parentKey === unit.written?.parentKey && other.written.place === "jsx";
	});
	if (row !== null && !(unit.written?.rows?.literal ?? false))
		move = { ok: false, says: `these rows come from \`${row.over}\`, an expression; ask the agent` };
	else if (unit.written?.place === "expression") move = { ok: false, says: "it is written inside an expression" };
	else if (siblings.length < 2) move = { ok: false, says: "nothing beside it in this container" };
	else move = { ok: true, says: `Drag it, or arrows, among ${siblings.length}` };

	const style = getComputedStyle(el);
	const box = el.getBoundingClientRect();
	return {
		el,
		name: nameOf(el),
		tag: el.localName,
		stamp,
		within: owner === null ? null : componentName(owner.type),
		component,
		words: ownWords(el),
		text: textAnswer(el, stamp, written, row !== null),
		remove,
		move,
		row,
		shared: REACH.filter((frame) => frame !== FRAME),
		hidden: style.display === "none" || style.visibility === "hidden" || box.width * box.height === 0,
	};
}
