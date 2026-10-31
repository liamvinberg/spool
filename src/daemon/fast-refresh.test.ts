import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { refreshFooter } from "./fast-refresh";

/** What a footer says, read back by running it against a stand-in runtime. */
function footer(source: string, scope: Record<string, unknown> = {}) {
	const said: { rerunnable: boolean[]; signed: Record<string, { key: string; forceReset: boolean }> } = {
		rerunnable: [],
		signed: {},
	};
	const hot = {
		module: (_id: string, rerunnable: boolean) => said.rerunnable.push(rerunnable),
		register: () => {},
		sign: (type: { name: string }, key: string, forceReset: boolean) => {
			said.signed[type.name] = { key, forceReset };
		},
	};
	const names = Object.keys(scope);
	const code = refreshFooter("frames/a/frame.tsx", source).replaceAll("globalThis.__spoolHot", "hot");
	new Function("hot", ...names, code)(hot, ...Object.values(scope));
	return said;
}

const component = (name: string) => Object.defineProperty(() => null, "name", { value: name });

describe("refreshFooter", () => {
	it("signs a component by each hook call's line in order, so hooks that trade places remount it", () => {
		const frame = (first: string, second: string) => `import { useState } from "react";
export default function Frame() {
	${first}
	${second}
	return null;
}
`;
		const a = "const [count, setCount] = useState(0);";
		const b = 'const [text, setText] = useState("");';
		const signed = footer(frame(a, b), { Frame: component("Frame") }).signed.Frame;
		expect(signed).toEqual({ key: `${a}\n${b}`, forceReset: false });
		expect(footer(frame(b, a), { Frame: component("Frame") }).signed.Frame?.key).not.toBe(signed?.key);
	});

	it("signs through a custom hook declared in the module, and remounts on every update for one it can't see", () => {
		const source = `import { useState } from "react";
import { useStore } from "shared/store";
function useToggle() {
	const [on, setOn] = useState(false);
	return [on, () => setOn(!on)];
}
function Local() {
	const [on, toggle] = useToggle();
	return null;
}
const Remote = memo(function Remote() {
	const value = useStore();
	return null;
});
`;
		const { signed } = footer(source, { Local: component("Local"), Remote: component("Remote") });
		expect(signed.Local).toEqual({
			key: "const [on, toggle] = useToggle();\n{const [on, setOn] = useState(false);}",
			forceReset: false,
		});
		expect(signed.Remote).toEqual({ key: "const value = useStore();", forceReset: true });
	});

	it("lets a module run again only when it exports nothing but components, or declares nothing but functions", () => {
		const rerunnable = (source: string) => footer(source).rerunnable[0];
		expect(rerunnable("export function Card() {}\nexport type Props = {};\nexport { Card as Tile };\n")).toBe(true);
		expect(rerunnable('import x from "y";\n// helpers\nexport function format() {}\nfunction pad() {}\n')).toBe(true);
		expect(rerunnable("const w = window;\nif (w) {}\nexport {};\n")).toBe(true);
		for (const source of [
			"export const items = [1];\n",
			"const merge = make();\nexport function cn() {}\n",
			"export const useStore = create(() => ({}));\n",
			"export * from './x';\n",
			"export default memo(Card);\n",
		]) {
			expect(rerunnable(source), source).toBe(false);
		}
	});
});

it("serves the document as it was unless Fast Refresh is asked for", async () => {
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	writeFrame(root, "home", "export default function Home() { return <main>home</main>; }\n");
	const compiler = createFrameCompiler("0.0.0-test");
	const authority = { projectCapability: "capability", controlOrigin: "http://127.0.0.1:1" };
	const plain = await compiler.getDocument(root, "home", authority);
	const hot = await compiler.getDocument(root, "home", authority, true);
	if (plain.kind !== "ok" || hot.kind !== "ok") throw new Error("the frame did not compile");
	for (const mark of ["__spoolHot", "/vendor/react-dev.js", 'id="spool-css"', "react-refresh"]) {
		expect(plain.document).not.toContain(mark);
	}
	expect(plain.document).toContain('"react":"/vendor/react.js"');
	expect(hot.document).toContain('"react":"/vendor/react-dev.js"');
	expect(hot.etag).not.toBe(plain.etag);
});
