import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { COVER_PNG, makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { IMAGE_BUDGET_BYTES, LOCAL_FONT_BUDGET_BYTES } from "./assets";

/**
 * A frame imports an asset and the compiler bakes it into the document (#101).
 * There is no asset route and no asset URL, so every claim here is about the
 * served document's own bytes and the closure that decides when it changes.
 */

function writeAsset(root: string, rel: string, bytes: Uint8Array): void {
	const file = join(root, "design", rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, bytes);
}

function project() {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	const { request } = makeApp(spoolDir);
	return { root, name, document: () => request(`/p/${name}/frames/entry`) };
}

describe("project assets", () => {
	it("inlines an imported raster as a base64 data URI", async () => {
		const { root, document } = project();
		writeAsset(root, "frames/entry/hero.png", COVER_PNG);
		writeFrame(
			root,
			"entry",
			'import hero from "./hero.png";\nexport default function Frame() { return <img src={hero} alt="" />; }\n',
		);

		const response = await document();
		expect(response.status).toBe(200);
		expect(await response.text()).toContain(`data:image/png;base64,${Buffer.from(COVER_PNG).toString("base64")}`);
	});

	it("inlines an imported svg as base64 rather than percent-encoding it", async () => {
		const { root, document } = project();
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
		writeAsset(root, "shared/assets/logo.svg", Buffer.from(svg));
		writeFrame(
			root,
			"entry",
			`import logo from "../../shared/assets/logo.svg";\nexport default function Frame() { return <div style={{ backgroundImage: \`url(\${logo})\` }} />; }\n`,
		);

		const body = await (await document()).text();
		expect(body).toContain(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
		expect(body).not.toContain("data:image/svg+xml,");
	});

	it("carries an imported text file as its contents, and makes it a cache input", async () => {
		const { root, document } = project();
		writeDesignFile(root, "frames/entry/copy.txt", "first copy\n");
		writeFrame(
			root,
			"entry",
			'import copy from "./copy.txt";\nexport default function Frame() { return <p>{copy}</p>; }\n',
		);

		const first = await document();
		expect(await first.text()).toContain("first copy");
		const etag = first.headers.get("etag");
		expect(etag).toBeTruthy();

		writeDesignFile(root, "frames/entry/copy.txt", "second copy\n");
		const second = await document();
		expect(await second.text()).toContain("second copy");
		expect(second.headers.get("etag")).not.toBe(etag);
	});

	it("makes an asset a cache input, so swapping its bytes reissues the document", async () => {
		const { root, document } = project();
		writeAsset(root, "frames/entry/hero.png", COVER_PNG);
		writeFrame(
			root,
			"entry",
			'import hero from "./hero.png";\nexport default function Frame() { return <img src={hero} alt="" />; }\n',
		);

		const first = (await document()).headers.get("etag");
		expect(first).toBeTruthy();
		writeAsset(root, "frames/entry/hero.png", Uint8Array.from([...COVER_PNG, 0]));
		const second = (await document()).headers.get("etag");
		expect(second).not.toBe(first);

		writeAsset(root, "frames/entry/hero.png", COVER_PNG);
		expect((await document()).headers.get("etag")).toBe(first);
	});

	it("fails the frame when its images outgrow the document budget, naming the file", async () => {
		const { root, document } = project();
		writeAsset(root, "frames/entry/huge.png", Buffer.alloc(IMAGE_BUDGET_BYTES, 7));
		writeFrame(
			root,
			"entry",
			'import huge from "./huge.png";\nexport default function Frame() { return <img src={huge} alt="" />; }\n',
		);

		const response = await document();
		const body = await response.text();
		expect(body).toContain("design/frames/entry/huge.png");
		expect(body).toContain("512 KB");
		expect(body).not.toContain("data:image/png;base64,");
	});

	it("counts every asset in one document against the same budget", async () => {
		const { root, document } = project();
		// Each encodes to about 60% of the budget: either alone fits, both cannot.
		const each = Buffer.alloc(Math.floor(IMAGE_BUDGET_BYTES * 0.45), 7);
		writeAsset(root, "frames/entry/one.png", each);
		writeAsset(root, "frames/entry/two.png", each);
		writeFrame(
			root,
			"entry",
			'import one from "./one.png";\nimport two from "./two.png";\nexport default function Frame() { return <><img src={one} alt="" /><img src={two} alt="" /></>; }\n',
		);

		expect(await (await document()).text()).toContain("512 KB");
	});

	it("names the import form when a stylesheet reaches an asset through url()", async () => {
		const { root, document } = project();
		writeAsset(root, "frames/entry/hero.png", COVER_PNG);
		writeDesignFile(root, "frames/entry/hero.css", ".hero { background-image: url(./hero.png); }\n");
		writeFrame(
			root,
			"entry",
			'import "./hero.css";\nexport default function Frame() { return <div className="hero" />; }\n',
		);

		const body = await (await document()).text();
		expect(body).toContain("an asset is imported, not referenced");
		expect(body).toContain("frames/entry/hero.css");
	});

	it("leaves a remote image url() in a stylesheet alone", async () => {
		const { root, document } = project();
		writeDesignFile(
			root,
			"frames/entry/hero.css",
			".hero { background-image: url(https://example.test/hero.png); }\n",
		);
		writeFrame(
			root,
			"entry",
			'import "./hero.css";\nexport default function Frame() { return <div className="hero" />; }\n',
		);

		const body = await (await document()).text();
		expect(body).toContain("https://example.test/hero.png");
		expect(body).not.toContain("an asset is imported, not referenced");
	});

	// The budget guards a frame document, because the canvas loads a page full of
	// them. The player is one document, loaded once, so it composes whatever the
	// frames carry — three frames that each fit their own document must not add
	// up to a dead player.
	it("composes a player from frames that each fit their own budget but not one between them", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const { request } = makeApp(spoolDir);
		const each = Buffer.alloc(Math.floor(IMAGE_BUDGET_BYTES * 0.45), 7);
		for (const frame of ["one", "two", "three"]) {
			writeAsset(root, `frames/${frame}/art.png`, each);
			writeFrame(
				root,
				frame,
				'import art from "./art.png";\nexport default function Frame() { return <img src={art} alt="" />; }\n',
			);
			expect((await request(`/p/${name}/frames/${frame}`)).status).toBe(200);
		}

		const response = await request(`/play/${name}`);
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).not.toContain("image budget");
		for (const frame of ["one", "two", "three"]) expect(body).toContain(frame);
	});

	it("refuses an asset that resolves outside design/", async () => {
		const { root, document } = project();
		writeFileSync(join(root, "outside.png"), COVER_PNG);
		writeFrame(
			root,
			"entry",
			'import hero from "../../../outside.png";\nexport default function Frame() { return <img src={hero} alt="" />; }\n',
		);

		const response = await document();
		expect(await response.text()).toContain("design boundary");
	});
});

/**
 * `spool init` has scaffolded `shared/assets/fonts/` since #80 and no code has
 * ever read it. A relative `url()` in shared/fonts.css now resolves against that
 * stylesheet's own folder and rides the document as a bounded data:font URI,
 * which is the one shape both capture allowlists already accept.
 */
describe("local fonts", () => {
	const face = (url: string) => `@font-face { font-family: "Local"; src: url(${url}) format("woff2"); }\n`;

	it("inlines a relative font file as a bounded data:font uri", async () => {
		const { root, document } = project();
		writeAsset(root, "shared/assets/fonts/local.woff2", Buffer.from("pretend woff2"));
		writeDesignFile(root, "shared/fonts.css", face("./assets/fonts/local.woff2"));
		writeFrame(root, "entry", "export default function Frame() { return <p>hello</p>; }\n");

		const body = await (await document()).text();
		expect(body).toContain(`data:font/woff2;base64,${Buffer.from("pretend woff2").toString("base64")}`);
		expect(body).not.toContain("url(./assets/fonts/local.woff2)");
	});

	it("makes a local font a cache input", async () => {
		const { root, document } = project();
		writeAsset(root, "shared/assets/fonts/local.woff2", Buffer.from("first"));
		writeDesignFile(root, "shared/fonts.css", face("assets/fonts/local.woff2"));
		writeFrame(root, "entry", "export default function Frame() { return <p>hello</p>; }\n");

		const first = (await document()).headers.get("etag");
		expect(first).toBeTruthy();
		writeAsset(root, "shared/assets/fonts/local.woff2", Buffer.from("second"));
		expect((await document()).headers.get("etag")).not.toBe(first);
	});

	it("fails the build when a local font outgrows its own budget", async () => {
		const { root, document } = project();
		writeAsset(root, "shared/assets/fonts/huge.woff2", Buffer.alloc(LOCAL_FONT_BUDGET_BYTES, 7));
		writeDesignFile(root, "shared/fonts.css", face("./assets/fonts/huge.woff2"));
		writeFrame(root, "entry", "export default function Frame() { return <p>hello</p>; }\n");

		const body = await (await document()).text();
		expect(body).toContain("design/shared/assets/fonts/huge.woff2");
		expect(body).toContain("1024 KB");
		expect(body).not.toContain("data:font/woff2;base64,");
	});

	it("leaves a font url it cannot answer exactly as written", async () => {
		const { root, document } = project();
		writeDesignFile(root, "shared/fonts.css", face("./assets/fonts/absent.woff2"));
		writeFrame(root, "entry", "export default function Frame() { return <p>hello</p>; }\n");

		const body = await (await document()).text();
		expect(body).toContain("url(./assets/fonts/absent.woff2)");
	});

	it("claims no url that is not a project-relative path", async () => {
		const { root, document } = project();
		writeDesignFile(
			root,
			"shared/fonts.css",
			`${face("https://example.test/remote.woff2")}${face("/vendor/fonts/pinned.woff2")}`,
		);
		writeFrame(root, "entry", "export default function Frame() { return <p>hello</p>; }\n");

		const body = await (await document()).text();
		// a remote face is the webfont store's to re-point; a root-absolute one is
		// the author's own reference. Neither is a file under design/ to inline.
		expect(body).toContain("/vendor/fonts/pinned.woff2");
		expect(body).not.toContain("data:font/");
	});

	it("refuses a local font that resolves outside design/", async () => {
		const { root, document } = project();
		writeFileSync(join(root, "outside.woff2"), Buffer.from("pretend woff2"));
		writeDesignFile(root, "shared/fonts.css", face("../../outside.woff2"));
		writeFrame(root, "entry", "export default function Frame() { return <p>hello</p>; }\n");

		expect(await (await document()).text()).toContain("design boundary");
	});
});
