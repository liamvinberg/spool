import { describe, expect, it } from "vitest";
import { refreshFooter } from "./fast-refresh";

/** What a footer registers, read back by running it against a stand-in runtime. */
function registered(source: string, scope: Record<string, unknown>) {
	const calls: { modules: [string, boolean][]; families: [string, string][] } = { modules: [], families: [] };
	const hot = {
		module: (id: string, _hash: string, boundary: boolean) => calls.modules.push([id, boundary]),
		register: () => {},
		sign: (type: { name: string }, key: string) => calls.families.push([type.name, key]),
	};
	const names = Object.keys(scope);
	const footer = refreshFooter("frames/a/frame.tsx", source).replaceAll("globalThis.__spoolHot", "hot");
	new Function("hot", ...names, footer)(hot, ...Object.values(scope));
	return calls;
}

const component = (name: string) => Object.defineProperty(() => null, "name", { value: name });

describe("refreshFooter", () => {
	it("registers each top-level component with its hook calls, and keeps a module of components a boundary", () => {
		const source = `import { useState } from "react";
function Inner() {
	const [n] = useState(0);
	useEffect(() => {}, []);
	return <b>{n}</b>;
}
export default function Frame() {
	return <Inner />;
}
const helper = () => 1;
`;
		const calls = registered(source, { Inner: component("Inner"), Frame: component("Frame") });
		expect(calls.modules).toEqual([["frames/a/frame.tsx", true]]);
		expect(calls.families).toEqual([
			["Inner", "useState,useEffect"],
			["Frame", ""],
		]);
	});

	it("says a module exporting anything but components is no boundary, which reloads when it changes", () => {
		for (const source of [
			"export const items = [1];\n",
			"export function format() {}\n",
			"export { format };\n",
			"export * from './x';\n",
			"export default function () {}\n",
			"export default memo(Card);\n",
		]) {
			expect(registered(source, {}).modules, source).toEqual([["frames/a/frame.tsx", false]]);
		}
		expect(registered("export type Props = {};\nexport { Card };\n", {}).modules).toEqual([
			["frames/a/frame.tsx", true],
		]);
	});
});
