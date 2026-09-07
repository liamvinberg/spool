// Independent comparison baseline: ordinary production JSX, no observation or
// source stamping. The source triple emitted by the compiler is ignored.
import type { ElementType } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

export { Fragment };

export function jsxDEV(
	type: ElementType,
	props: Record<string, unknown> | null,
	key: string | undefined,
	isStaticChildren: boolean,
) {
	return (isStaticChildren ? jsxs : jsx)(type, props, key);
}
