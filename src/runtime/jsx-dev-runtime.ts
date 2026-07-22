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

export function jsxDEV(
	type: unknown,
	props: Record<string, unknown> | null,
	key: unknown,
	isStaticChildren: boolean,
	source?: JsxSource,
): unknown {
	const stamped =
		typeof type === "string" && source !== undefined
			? { ...props, "data-spool-source": `${source.fileName}:${source.lineNumber}:${source.columnNumber}` }
			: props;
	const create = isStaticChildren ? jsxs : jsx;
	return (create as (type: unknown, props: unknown, key: unknown) => unknown)(type, stamped, key);
}
