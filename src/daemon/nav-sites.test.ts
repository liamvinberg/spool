import { describe, expect, it } from "vitest";
import { makeTempDir, writeDesignFile } from "../test-helpers";
import { frameSource, parseNavSites } from "./nav-sites";

/**
 * The claim reader (#34): arrows claim what the code says, so this parser is
 * the map's whole source of truth — data-go attributes and ui.go calls read
 * from the AST, branch literals fanned out, computed targets flagged as
 * unreadable instead of guessed. Positions use the stamp convention
 * (1-based line and column) so anchors match data-spool-source verbatim.
 */

const PATH = "frames/cart/frame.tsx";

describe("data-go sites", () => {
	it("reads a string attribute, anchored at its element", () => {
		const source = `export default function Frame() {
	return (
		<main>
			<button data-go="checkout">go</button>
		</main>
	);
}
`;
		expect(parseNavSites(source, PATH)).toEqual({
			sites: [{ target: "checkout", via: "data-go", path: PATH, line: 4, anchor: { line: 4, col: 4 } }],
			unreadable: [],
		});
	});

	it("reads the braced literal forms agents emit", () => {
		const source = `export default function Frame() {
	return (
		<nav>
			<a data-go={"inbox"}>inbox</a>
			<a data-go={\`archive\`}>archive</a>
		</nav>
	);
}
`;
		const { sites, unreadable } = parseNavSites(source, PATH);
		expect(sites.map((s) => s.target)).toEqual(["inbox", "archive"]);
		expect(unreadable).toEqual([]);
	});

	it("flags a computed data-go as unreadable instead of guessing", () => {
		const source = `export default function Frame() {
	const route = (open: boolean) => (open ? "inbox" : "archive");
	return <button data-go={route(true)}>go</button>;
}
`;
		expect(parseNavSites(source, PATH)).toEqual({
			sites: [],
			unreadable: [{ via: "data-go", path: PATH, line: 3, anchor: { line: 3, col: 9 } }],
		});
	});

	it("a template with substitutions cannot be read", () => {
		const source = `export default function Frame() {
	const n = 2;
	return <button data-go={\`step-\${n}\`}>next</button>;
}
`;
		expect(parseNavSites(source, PATH).sites).toEqual([]);
		expect(parseNavSites(source, PATH).unreadable).toEqual([
			{ via: "data-go", path: PATH, line: 3, anchor: { line: 3, col: 9 } },
		]);
	});
});

describe("ui.go sites", () => {
	it("reads a literal call, anchored at the element whose handler makes it", () => {
		const source = `import { ui } from "spool";
export default function Frame() {
	return (
		<button type="button" onClick={() => ui.go("receipt", { paid: true })}>
			pay
		</button>
	);
}
`;
		expect(parseNavSites(source, PATH)).toEqual({
			sites: [{ target: "receipt", via: "ui.go", path: PATH, line: 4, anchor: { line: 4, col: 3 } }],
			unreadable: [],
		});
	});

	it("a call outside any element carries no anchor", () => {
		const source = `import { ui } from "spool";
export default function Frame() {
	function submit() {
		ui.go("receipt");
	}
	return <button onClick={submit}>pay</button>;
}
`;
		expect(parseNavSites(source, PATH).sites).toEqual([{ target: "receipt", via: "ui.go", path: PATH, line: 4 }]);
	});

	it("a destination the parser cannot read is flagged, never guessed", () => {
		const source = `import { ui } from "spool";
const routeFor = (state: { ok: boolean }) => (state.ok ? "receipt" : "topup");
export default function Frame() {
	return <button onClick={() => ui.go(routeFor(ui.state))}>pay</button>;
}
`;
		// The element still navigates at runtime: preserve its anchor even
		// though the destination cannot become an arrow.
		expect(parseNavSites(source, PATH)).toEqual({
			sites: [],
			unreadable: [{ via: "ui.go", path: PATH, line: 4, anchor: { line: 4, col: 9 } }],
		});
	});

	it("ui.back is a history pop, never a site", () => {
		const source = `import { ui } from "spool";
export default function Frame() {
	return <button onClick={() => ui.back()}>back</button>;
}
`;
		expect(parseNavSites(source, PATH)).toEqual({ sites: [], unreadable: [] });
	});
});

describe("branches make sites conditional", () => {
	it("a ternary argument fans out into two conditional sites", () => {
		const source = `import { ui } from "spool";
export default function Frame() {
	const { ok } = ui.use();
	return <button onClick={() => ui.go(ok ? "receipt" : "topup")}>pay</button>;
}
`;
		const { sites, unreadable } = parseNavSites(source, PATH);
		expect(sites.map(({ target, conditional }) => ({ target, conditional }))).toEqual([
			{ target: "receipt", conditional: true },
			{ target: "topup", conditional: true },
		]);
		expect(unreadable).toEqual([]);
	});

	it("an if between the call and its function marks the site", () => {
		const source = `import { ui } from "spool";
export default function Frame() {
	const submit = () => {
		if (ui.state.cart === undefined) {
			ui.go("cart");
			return;
		}
		ui.go("checkout");
	};
	return <button onClick={submit}>continue</button>;
}
`;
		expect(parseNavSites(source, PATH).sites).toEqual([
			{ target: "cart", via: "ui.go", path: PATH, line: 5, conditional: true },
			{ target: "checkout", via: "ui.go", path: PATH, line: 8 },
		]);
	});

	it("a switch case and a logical guard both mark the site", () => {
		const source = `import { ui } from "spool";
export default function Frame() {
	const onDone = () => {
		switch (ui.state.plan) {
			case "pro":
				ui.go("invoice");
				break;
		}
	};
	const onSkip = () => ui.state.ready && ui.go("summary");
	return <button onClick={onDone} onBlur={onSkip}>done</button>;
}
`;
		const targets = parseNavSites(source, PATH).sites.map(({ target, conditional }) => ({ target, conditional }));
		expect(targets).toEqual([
			{ target: "invoice", conditional: true },
			{ target: "summary", conditional: true },
		]);
	});

	it("a branch outside the enclosing function does not leak in", () => {
		const source = `import { ui } from "spool";
export default function Frame() {
	if (!ui.state.busy) {
		const pay = () => ui.go("receipt");
		return <button onClick={pay}>pay</button>;
	}
	return <main aria-busy="true">…</main>;
}
`;
		// the if guards the handler's existence, not the walk the handler makes
		expect(parseNavSites(source, PATH).sites).toEqual([{ target: "receipt", via: "ui.go", path: PATH, line: 4 }]);
	});

	it("a conditionally rendered element makes its data-go conditional", () => {
		const source = `export default function Frame() {
	const empty = true;
	return <main>{empty ? <a data-go="browse">browse</a> : <a data-go="checkout">checkout</a>}</main>;
}
`;
		const targets = parseNavSites(source, PATH).sites.map(({ target, conditional }) => ({ target, conditional }));
		expect(targets).toEqual([
			{ target: "browse", conditional: true },
			{ target: "checkout", conditional: true },
		]);
	});

	it("a half-readable ternary keeps the literal and names the gap", () => {
		const source = `import { ui } from "spool";
const routeFor = (s: unknown) => "somewhere";
export default function Frame() {
	return <button onClick={() => ui.go(ui.state.ok ? "receipt" : routeFor(ui.state))}>pay</button>;
}
`;
		const { sites, unreadable } = parseNavSites(source, PATH);
		expect(sites.map(({ target, conditional }) => ({ target, conditional }))).toEqual([
			{ target: "receipt", conditional: true },
		]);
		expect(unreadable).toEqual([{ via: "ui.go", path: PATH, line: 4, anchor: { line: 4, col: 9 } }]);
	});
});

describe("frameSource", () => {
	it("reads every source file in the folder, paths design-relative, and follows edits", () => {
		const root = makeTempDir();
		writeDesignFile(
			root,
			"frames/home/frame.tsx",
			`export default function Frame() {\n\treturn <a data-go="inbox">in</a>;\n}\n`,
		);
		writeDesignFile(
			root,
			"frames/home/parts/nav.tsx",
			`export function Nav() {\n\treturn <a data-go="archive">arc</a>;\n}\n`,
		);

		expect(frameSource(root, "home").sites.map((s) => `${s.path} ${s.target}`)).toEqual([
			"frames/home/frame.tsx inbox",
			"frames/home/parts/nav.tsx archive",
		]);

		// the cache is keyed to content: an edit moves the map, same process
		writeDesignFile(
			root,
			"frames/home/frame.tsx",
			`export default function Frame() {\n\treturn <main>quiet</main>;\n}\n`,
		);
		expect(frameSource(root, "home").sites.map((s) => s.target)).toEqual(["archive"]);
	});
});

describe("the source graph — a frame is its folder plus what it imports", () => {
	it("claims a walk declared in a shared component it mounts", () => {
		const root = makeTempDir();
		writeDesignFile(root, "shared/ui/nav.tsx", `export function Nav() {\n\treturn <a data-go="inbox">in</a>;\n}\n`);
		writeDesignFile(
			root,
			"frames/home/frame.tsx",
			`import { Nav } from "../../shared/ui/nav";\nexport default function Frame() {\n\treturn <Nav />;\n}\n`,
		);

		expect(frameSource(root, "home").sites.map((s) => `${s.path} ${s.target}`)).toEqual(["shared/ui/nav.tsx inbox"]);
	});

	it("shares one nav bar's walk across every frame mounting it", () => {
		const root = makeTempDir();
		writeDesignFile(root, "shared/ui/back.tsx", `export function Back() {\n\treturn <a data-go="home">up</a>;\n}\n`);
		const frame = `import { Back } from "../../shared/ui/back";\nexport default function Frame() {\n\treturn <Back />;\n}\n`;
		writeDesignFile(root, "frames/one/frame.tsx", frame);
		writeDesignFile(root, "frames/two/frame.tsx", frame);

		expect(frameSource(root, "one").sites.map((s) => s.target)).toEqual(["home"]);
		expect(frameSource(root, "two").sites.map((s) => s.target)).toEqual(["home"]);
	});

	it("follows a chain of imports, not just the first hop", () => {
		const root = makeTempDir();
		writeDesignFile(root, "shared/ui/row.tsx", `export function Row() {\n\treturn <a data-go="deep">d</a>;\n}\n`);
		writeDesignFile(
			root,
			"shared/ui/list.tsx",
			`import { Row } from "./row";\nexport function List() {\n\treturn <Row />;\n}\n`,
		);
		writeDesignFile(
			root,
			"frames/home/frame.tsx",
			`import { List } from "../../shared/ui/list";\nexport default function Frame() {\n\treturn <List />;\n}\n`,
		);

		expect(frameSource(root, "home").sites.map((s) => s.target)).toEqual(["deep"]);
	});

	it("resolves an extensionless directory import through its index", () => {
		const root = makeTempDir();
		writeDesignFile(root, "shared/ui/index.tsx", `export function Kit() {\n\treturn <a data-go="kit">k</a>;\n}\n`);
		writeDesignFile(
			root,
			"frames/home/frame.tsx",
			`import { Kit } from "../../shared/ui";\nexport default function Frame() {\n\treturn <Kit />;\n}\n`,
		);

		expect(frameSource(root, "home").sites.map((s) => s.target)).toEqual(["kit"]);
	});

	it("terminates on an import cycle instead of walking forever", () => {
		const root = makeTempDir();
		writeDesignFile(
			root,
			"shared/ui/a.tsx",
			`import { B } from "./b";\nexport function A() {\n\treturn <a data-go="from-a">{B()}</a>;\n}\n`,
		);
		writeDesignFile(
			root,
			"shared/ui/b.tsx",
			`import { A } from "./a";\nexport function B() {\n\treturn <a data-go="from-b">{typeof A}</a>;\n}\n`,
		);
		writeDesignFile(
			root,
			"frames/home/frame.tsx",
			`import { A } from "../../shared/ui/a";\nexport default function Frame() {\n\treturn <A />;\n}\n`,
		);

		expect(
			frameSource(root, "home")
				.sites.map((s) => s.target)
				.sort(),
		).toEqual(["from-a", "from-b"]);
	});

	it("ignores package specifiers — they are never project source", () => {
		const root = makeTempDir();
		writeDesignFile(
			root,
			"frames/home/frame.tsx",
			`import { ui } from "spool";\nimport { useState } from "react";\nexport default function Frame() {\n\treturn <a data-go="only">{typeof ui}{typeof useState}</a>;\n}\n`,
		);

		expect(frameSource(root, "home").sites.map((s) => s.target)).toEqual(["only"]);
	});

	it("reaches a walk behind a type-only import and an export-from barrel", () => {
		const root = makeTempDir();
		writeDesignFile(root, "shared/ui/tile.tsx", `export function Tile() {\n\treturn <a data-go="tile">t</a>;\n}\n`);
		writeDesignFile(root, "shared/ui/kit.tsx", `export { Tile } from "./tile";\n`);
		writeDesignFile(
			root,
			"frames/home/frame.tsx",
			`import { Tile } from "../../shared/ui/kit";\nexport default function Frame() {\n\treturn <Tile />;\n}\n`,
		);

		expect(frameSource(root, "home").sites.map((s) => s.target)).toEqual(["tile"]);
	});

	it("keeps an import that climbs out of design/ from claiming anything", () => {
		const root = makeTempDir();
		writeDesignFile(root, "frames/home/frame.tsx", `import "../../../outside/escape";\nexport default 1;\n`);
		writeDesignFile(root, "../outside/escape.tsx", `export const x = <a data-go="stolen">s</a>;\n`);

		expect(frameSource(root, "home").sites).toEqual([]);
	});
});

describe("term.go sites — the terminal dialect's coded walk (#42)", () => {
	const TERM_PATH = "frames/dash/term.tsx";

	it("reads a literal call with will certainty", () => {
		const source = `import { term } from "spool/term";
export default function App() {
	return <box onSelect={() => term.go("checkout")}>pay</box>;
}
`;
		expect(parseNavSites(source, TERM_PATH)).toEqual({
			sites: [{ target: "checkout", via: "term.go", path: TERM_PATH, line: 3, anchor: { line: 3, col: 9 } }],
			unreadable: [],
		});
	});

	it("marks a branched call conditional — might, not will", () => {
		const source = `import { term } from "spool/term";
export function onKey(paid) {
	if (paid) term.go("receipt");
}
`;
		const { sites } = parseNavSites(source, TERM_PATH);
		expect(sites).toEqual([{ target: "receipt", via: "term.go", path: TERM_PATH, line: 3, conditional: true }]);
	});

	it("flags an unreadable destination, never guessing", () => {
		const source = `import { term } from "spool/term";
export function onKey(name) {
	term.go(name);
}
`;
		const { sites, unreadable } = parseNavSites(source, TERM_PATH);
		expect(sites).toEqual([]);
		expect(unreadable).toEqual([{ via: "term.go", path: TERM_PATH, line: 3 }]);
	});
});
