import { readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, markProject, writeDesignFile, writeFrame, writePageFrame } from "../test-helpers";
import { retargetFor, retargetLinks, retargetSource } from "./frame-links";
import { frameDirectories } from "./projection";
import { markSeen, unseenNow } from "./seen";

const moved = retargetFor({ frames: [{ from: "shop/cart", to: "store/cart" }] });

describe("retargeting one file", () => {
	it("rewrites every target the flow map reads, inside the author's own quotes", () => {
		const source = [
			`export const links = { paid: "shop/cart", back: 'home' } as const;`,
			`export default function F() {`,
			`\treturn <div>`,
			`\t\t<a data-go="shop/cart">cart</a>`,
			`\t\t<a data-go={'shop/cart'}>cart</a>`,
			"\t\t<button onClick={() => ui.go(`shop/cart`)}>go</button>",
			`\t\t<button onClick={() => ui.go(ok ? "shop/cart" : "home")}>maybe</button>`,
			`\t</div>;`,
			`}`,
		].join("\n");

		expect(retargetSource(source, "frames/a/frame.tsx", moved)).toBe(source.replaceAll("shop/cart", "store/cart"));
	});

	it("leaves text that only looks like a target alone", () => {
		const source = [
			`const label = "shop/cart";`,
			`const target = "shop/cart";`,
			`export default function F() {`,
			`\treturn <p title="shop/cart" onClick={() => ui.go(target)}>shop/cart {label}</p>;`,
			`}`,
		].join("\n");

		expect(retargetSource(source, "frames/a/frame.tsx", moved)).toBe(source);
	});

	it("carries every frame under a page that moved, and nothing that merely shares its prefix", () => {
		const page = retargetFor({ pages: [{ from: "shop", to: "store/shop" }] });
		const source = `<><a data-go="shop/cart" /><a data-go="shop/sale/item" /><a data-go="shopping/cart" /></>`;

		expect(retargetSource(source, "shared/nav.tsx", page)).toBe(
			`<><a data-go="store/shop/cart" /><a data-go="store/shop/sale/item" /><a data-go="shopping/cart" /></>`,
		);
	});

	it("leaves a source that does not parse exactly as it was", () => {
		const source = `<a data-go="shop/cart">`;
		expect(retargetSource(source, "frames/a/frame.tsx", moved)).toBe(source);
	});
});

describe("retargeting a project", () => {
	it("rewrites frames and shared/ alike and says which files it wrote", () => {
		const root = join(makeTempDir(), "project");
		markProject(root);
		writePageFrame(root, "store", "cart", `export default () => <p>cart</p>;\n`);
		writeFrame(root, "home", `export default () => <a data-go="shop/cart">cart</a>;\n`);
		writeDesignFile(root, "shared/nav.tsx", `export const Nav = () => <a data-go="shop/cart">cart</a>;\n`);
		writeDesignFile(root, "shared/copy.tsx", `export const Copy = () => <p>shop/cart</p>;\n`);

		expect(retargetLinks(root, moved)).toEqual(["frames/home/frame.tsx", "shared/nav.tsx"]);
		expect(readFileSync(join(root, "design", "frames", "home", "frame.tsx"), "utf8")).toContain(`"store/cart"`);
		expect(readFileSync(join(root, "design", "shared", "nav.tsx"), "utf8")).toContain(`"store/cart"`);
	});

	it("keeps a frame somebody had already looked at seen", () => {
		const root = join(makeTempDir(), "project");
		markProject(root);
		writeFrame(root, "home", `export default () => <a data-go="shop/cart">cart</a>;\n`);
		writeFrame(root, "about", `export default () => <p>about</p>;\n`);
		const frames = () => [...frameDirectories(root)].map(([name, dir]) => ({ name, dir }));
		const past = new Date(Date.now() - 60_000);
		utimesSync(join(root, "design", "frames", "home", "frame.tsx"), past, past);
		unseenNow(root, frames());
		markSeen(root, frames(), ["home"]);

		retargetLinks(root, moved);

		expect(unseenNow(root, frames()).get("home")).toBeUndefined();
	});
});
