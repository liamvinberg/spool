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
	const create = isStaticChildren ? jsxs : jsx;
	return (create as (type: unknown, props: unknown, key: unknown) => unknown)(type, stamped, key);
}
