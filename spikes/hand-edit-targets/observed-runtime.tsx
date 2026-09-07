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
	if (source && globalThis.__handObserver) {
		const original = `${source.fileName}:${source.lineNumber}:${source.columnNumber}`;
		const stamp = globalThis.__handValues?.remap(original) ?? original;
		globalThis.__handValues?.jsx(element, stamp);
		globalThis.__handObserver.register(element, stamp);
	}
	return element;
}
