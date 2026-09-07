import type { ElementType } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

export { Fragment };

export function jsxDEV(
	type: ElementType,
	props: Record<string, unknown> | null,
	key: string | undefined,
	isStaticChildren: boolean,
	source?: { fileName: string; lineNumber: number; columnNumber: number },
) {
	const element = (isStaticChildren ? jsxs : jsx)(type, props, key);
	if (source && globalThis.__handObserver)
		globalThis.__handObserver.register(element, `${source.fileName}:${source.lineNumber}:${source.columnNumber}`);
	return element;
}
