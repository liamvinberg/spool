import { createContext, createElement, type ElementType, type ReactNode, useContext, useId } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

// Disposable experiment, never imported by the product. Additional React
// boundaries demonstrate committed call ancestry without private Fiber fields.
// Only plain function components are covered. This is not a production runtime.
interface Source {
	fileName: string;
	lineNumber: number;
	columnNumber: number;
}
interface Call {
	source: string;
	occurrence: string;
}
interface Props {
	target: ElementType;
	supplied: Record<string, unknown> | null;
	source: string;
}
const Ancestry = createContext<readonly Call[]>([]);
const wrappers = new Map<ElementType, (props: Props) => ReactNode>();

function Host({ target, supplied, source }: Props) {
	const chain = useContext(Ancestry);
	const occurrence = useId();
	return createElement(target, {
		...supplied,
		"data-spool-source": source,
		"data-probe-chain": JSON.stringify(chain),
		"data-probe-occurrence": occurrence,
	});
}

function wrapper(target: ElementType) {
	let held = wrappers.get(target);
	if (held === undefined) {
		held = function CallBoundary({ supplied, source }: Props) {
			const ancestry = useContext(Ancestry);
			const occurrence = useId();
			return createElement(Ancestry.Provider, {
				value: [...ancestry, { source, occurrence }],
				children: createElement(target, supplied),
			});
		};
		wrappers.set(target, held);
	}
	return held;
}

export { Fragment };
export function jsxDEV(
	type: ElementType,
	props: Record<string, unknown> | null,
	key: string | undefined,
	isStaticChildren: boolean,
	source?: Source,
): ReactNode {
	const make = isStaticChildren ? jsxs : jsx;
	if (source === undefined || (typeof type !== "string" && typeof type !== "function")) return make(type, props, key);
	const at = `${source.fileName}:${source.lineNumber}:${source.columnNumber}`;
	return jsx(typeof type === "string" ? Host : wrapper(type), { target: type, supplied: props, source: at }, key);
}
