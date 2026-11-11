import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createDaemonApp } from "./app";
import { createFrameCompiler } from "./compile";
import { type HotModule, hotPlan, isRefreshBoundary, refreshFooter } from "./fast-refresh";
import { RENDER_HOST } from "./security";

/** What a footer says, read back by running it against a stand-in runtime. */
function footer(source: string, scope: Record<string, unknown> = {}) {
	const said: { signed: Record<string, { key: string; forceReset: boolean }> } = { signed: {} };
	const hot = {
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

	it("names a module a boundary only when every export it has is a component", () => {
		expect(isRefreshBoundary("export function Card() {}\nexport type Props = {};\nexport { Card as Tile };\n")).toBe(
			true,
		);
		expect(isRefreshBoundary("export const Row = memo(() => null);\nexport const Cell = (props) => null;\n")).toBe(
			true,
		);
		for (const source of [
			"export const items = [1];\n",
			"const merge = make();\nexport function cn() {}\n",
			"export const useStore = create(() => ({}));\n",
			"export * from './x';\n",
			"export default memo(Card);\n",
			"export const USERS = [{ name: 'Ada' }];\n",
			"export const Theme = { accent: 'red' };\n",
			"export class Store {}\n",
			"const Config = { dense: true };\nexport default Config;\n",
			"const Palette = makePalette();\nexport { Palette };\n",
		]) {
			expect(isRefreshBoundary(source), source).toBe(false);
		}
	});
});

describe("hotPlan", () => {
	// frame -> Card (a boundary) -> cn (not); frame -> store (not)
	const graph = (changed: string[], frameBoundary = true) => {
		const modules = new Map<string, HotModule>([
			["frame.tsx", { hash: "f", boundary: frameBoundary, importers: [] }],
			["card.tsx", { hash: "c", boundary: true, importers: ["frame.tsx"] }],
			["cn.ts", { hash: "n", boundary: false, importers: ["card.tsx"] }],
			["store.ts", { hash: "s", boundary: false, importers: ["frame.tsx"] }],
		]);
		const served = new Map([...modules].map(([path, module]) => [path, module.hash]));
		for (const path of changed) served.set(path, "old");
		return hotPlan(modules, served);
	};

	it("runs the changed modules and their importers up to the nearest boundary, and nothing else", () => {
		expect(graph(["card.tsx"])).toEqual({ rerun: ["card.tsx"], roots: ["card.tsx"] });
		expect(graph(["cn.ts"])).toEqual({ rerun: ["card.tsx", "cn.ts"], roots: ["card.tsx"] });
		expect(graph(["store.ts"])).toEqual({ rerun: ["frame.tsx", "store.ts"], roots: ["frame.tsx"] });
		expect(graph([])).toEqual({ rerun: [], roots: [] });
	});

	it("refuses a change that climbs to a frame that exports more than components", () => {
		expect(graph(["store.ts"], false)).toHaveProperty("refused");
		expect(graph(["cn.ts"], false)).toEqual({ rerun: ["card.tsx", "cn.ts"], roots: ["card.tsx"] });
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

it("assembles the document with the experiment off byte for byte as main does", async () => {
	const { root, name } = makeProject(join(makeTempDir(), ".spool"));
	writeDesignFile(root, "shared/badge.tsx", "export function Badge() { return <p>badge</p>; }\n");
	writeFrame(
		root,
		"home",
		'import { Badge } from "shared/badge";\nexport default function Home() { return <main className="p-4"><Badge /></main>; }\n',
	);
	const compiler = createFrameCompiler("0.0.0-test");
	const doc = await compiler.getDocument(root, "home", {
		projectCapability: "capability",
		controlOrigin: "http://127.0.0.1:1",
	});
	if (doc.kind !== "ok") throw new Error("the frame did not compile");
	// main's document for this frame: a
	// change to the plain document on main updates it with `vitest -u`
	expect(createHash("sha256").update(doc.document.replaceAll(name, "PROJECT")).digest("hex")).toMatchInlineSnapshot(
		`"ba56ed9d096900e8beb5c577739e29d6d9e9dc1a64f9d52b0935f5808856cb54"`,
	);
});

describe("a Fast Refresh document's modules", () => {
	function harness() {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const daemon = createDaemonApp({ spoolDir, version: "0.0.0-test" });
		onTestFinished(() => daemon.close());
		const render = (path: string, origin?: string) =>
			daemon.app.request(`http://${RENDER_HOST}${path}`, origin === undefined ? {} : { headers: { origin } });
		const module = (session: string, path: string, origin = "null") =>
			render(`/p/${name}/hot/${encodeURIComponent(path)}?s=${session}&v=0`, origin);
		const open = async (frame: string) => {
			const document = await (await render(`/p/${name}/frames/${frame}?refresh=1`)).text();
			const session = /\?s=([\w-]{20,})&/.exec(document)?.[1];
			if (session === undefined) throw new Error("the document carries no session");
			return session;
		};
		return { root, name, render, module, open };
	}

	it("serves them only in a session the daemon minted, to the sandboxed frame, inside design/", async () => {
		const { root, name, render, module, open } = harness();
		writeFrame(root, "home", "export default function Home() { return <main>home</main>; }\n");
		writeDesignFile(root, "secret.ts", "export const secret = 1;\n");
		const session = await open("home");
		expect(await open("home")).not.toBe(session);

		const served = await module(session, "frames/home/frame.tsx");
		expect(served.status).toBe(200);
		expect(served.headers.get("access-control-allow-origin")).toBe("null");
		expect(await served.text()).toContain("home");

		expect((await module(session, "frames/home/frame.tsx", "https://example.com")).status).toBe(403);
		expect((await module("guessed", "frames/home/frame.tsx")).status).toBe(404);
		expect((await module(session, "frames/home/../../secret.ts")).status).toBe(404);
		expect((await module(session, "../secret.ts")).status).toBe(404);
		const plan = await render(`/p/${name}/frames/home?hot=guessed&n=1`, "null");
		expect(await plan.json()).toHaveProperty("refused");
	});

	it("compiles a module again when a new file changes what one of its imports resolves to", async () => {
		const { root, module, open } = harness();
		writeFrame(root, "home", 'import { Card } from "./card";\nexport default function Home() { return <Card />; }\n');
		writeDesignFile(root, "frames/home/card/index.tsx", "export function Card() { return <p>folder</p>; }\n");
		const before = await (await module(await open("home"), "frames/home/frame.tsx")).text();
		expect(before).toContain(encodeURIComponent("frames/home/card/index.tsx"));
		writeDesignFile(root, "frames/home/card.tsx", "export function Card() { return <p>file</p>; }\n");
		const after = await (await module(await open("home"), "frames/home/frame.tsx")).text();
		expect(after).toContain(encodeURIComponent("frames/home/card.tsx"));
		expect(after).not.toContain(encodeURIComponent("card/index.tsx"));
	});

	it("refuses an update over a font file changed behind the same fonts.css or theme, so the frame reloads", async () => {
		const { root, name, render } = harness();
		writeDesignFile(root, "shared/fonts.css", '@font-face { font-family: "Brand"; src: url("./brand.woff2"); }\n');
		writeDesignFile(root, "shared/brand.woff2", "one");
		writeDesignFile(
			root,
			"frames/themed/theme.css",
			'@import "tailwindcss";\n@font-face { font-family: "Own"; src: url("./own.woff2"); }\n',
		);
		writeDesignFile(root, "frames/themed/own.woff2", "one");
		writeFrame(root, "home", "export default function Home() { return <main>home</main>; }\n");
		writeFrame(
			root,
			"themed",
			'import "./theme.css";\nexport default function Themed() { return <main>themed</main>; }\n',
		);
		const opened = async (frame: string) => {
			const document = await (await render(`/p/${name}/frames/${frame}?refresh=1`)).text();
			const session = /\?s=([\w-]{20,})&/.exec(document)?.[1] ?? "";
			const head = /window\.__spoolHot\.head = "(\w+)"/.exec(document)?.[1];
			const plan = async () =>
				(await (await render(`/p/${name}/frames/${frame}?hot=${session}&n=1`, "null")).json()) as { head?: string };
			return { head, plan };
		};
		for (const [frame, face] of [
			["home", "shared/brand.woff2"],
			["themed", "frames/themed/own.woff2"],
		] as const) {
			const { head, plan } = await opened(frame);
			expect(head).toBeDefined();
			expect((await plan()).head).toBe(head);
			writeDesignFile(root, face, "two");
			expect((await plan()).head, frame).not.toBe(head);
		}
	});
});
