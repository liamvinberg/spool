import { isValidElement } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

/**
 * The stamping JSX runtime (#23): frames compile with jsxDev pointed here
 * (jsxImportSource "spool"), so every intrinsic element carries its exact
 * compile-time source location as data-spool-source — the element picker's
 * truth (#6, Onlook pattern), never written into files on disk. Components
 * pass through unstamped: their DOM stamps where it is authored, which may
 * be shared/ui — exactly the file an agent should edit. React itself stays
 * the pinned production build; only the source triple is harvested here.
 */

interface JsxSource {
	fileName: string;
	lineNumber: number;
	columnNumber: number;
}

export { Fragment };

/**
 * The call-site map: a component call's props, keyed to the stamp of the call
 * that made them. A component's own DOM stamps where it is authored, so this
 * is the one place that still knows which call passed it a literal.
 */
const callSites = new WeakMap<object, string>();

export function callSiteOf(props: object): string | undefined {
	return callSites.get(props);
}

/** Where one element stands in the list that rendered it (#324). */
export interface ItemSite {
	/** the stamp of the JSX the `.map()` callback returns: one literal, every row */
	stamp: string;
	/** the element's place in the array the map ran over */
	index: number;
}

/**
 * The item map: the row a rendered element is, keyed to the props React holds
 * for it.
 *
 * A `.map()` renders one JSX element once per entry, so the element's stamp
 * alone can never say which row a hand is standing on — every row carries the
 * same one. The call that receives the array is the one place the array is
 * still an array, so each child is noted with its place in it as that call is
 * made, and the shim reads it back off the fiber.
 */
const itemSites = new WeakMap<object, ItemSite>();

export function itemSiteOf(props: object): ItemSite | undefined {
	return itemSites.get(props);
}

// The shim is a classic script with no way to import this module, and the
// component's props are what React keeps on the fiber, so the readers are put
// where the shim can reach them (#314, #324).
if (typeof window !== "undefined") {
	Reflect.set(window, "__spoolCallSiteOf", callSiteOf);
	Reflect.set(window, "__spoolItemSiteOf", itemSiteOf);
}

/** The stamp an already-created child carries: its own, or its call's. */
function stampOfChild(child: { type: unknown; props: Record<string, unknown> }): string | undefined {
	if (typeof child.type === "string") {
		const held = child.props["data-spool-source"];
		return typeof held === "string" ? held : undefined;
	}
	return callSites.get(child.props);
}

function noteItem(child: unknown, index: number): void {
	if (!isValidElement(child)) return;
	const held = child as unknown as { type: unknown; props: Record<string, unknown> };
	if (typeof held.props !== "object" || held.props === null) return;
	const stamp = stampOfChild(held);
	if (stamp !== undefined) itemSites.set(held.props, { stamp, index });
}

/**
 * Every child of this call that stands in a list, with its place in it.
 *
 * The compiler is what tells a list from children an author wrote out: a tag
 * with several children of its own compiles to the static form, and its array
 * is the file's own punctuation rather than data. An array that is not static
 * is a value — `{rows.map(...)}` and nothing else common — and so is any array
 * nested inside the static one, which is that same value standing among
 * siblings. Only those are rows, and the index that names one is its place
 * inside its own array, because that is the array the file has a literal for.
 */
function noteItems(props: Record<string, unknown> | null, isStaticChildren: boolean): void {
	const children = props?.children;
	if (!Array.isArray(children)) return;
	for (let index = 0; index < children.length; index += 1) {
		const entry: unknown = children[index];
		if (Array.isArray(entry)) {
			for (let inner = 0; inner < entry.length; inner += 1) noteItem(entry[inner], inner);
			continue;
		}
		if (!isStaticChildren) noteItem(entry, index);
	}
}

export function jsxDEV(
	type: unknown,
	props: Record<string, unknown> | null,
	key: unknown,
	isStaticChildren: boolean,
	source?: JsxSource,
): unknown {
	const stamp = source ? `${source.fileName}:${source.lineNumber}:${source.columnNumber}` : undefined;
	const stamped = typeof type === "string" && stamp !== undefined ? { ...props, "data-spool-source": stamp } : props;
	if (typeof type !== "string" && stamp !== undefined && props !== null) callSites.set(props, stamp);
	noteItems(stamped, isStaticChildren);
	const create = isStaticChildren ? jsxs : jsx;
	return (create as (type: unknown, props: unknown, key: unknown) => unknown)(type, stamped, key);
}
