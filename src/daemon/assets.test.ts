import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { COVER_PNG, makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { FILE_LIMIT_BYTES } from "../team-sync-protocol";
import { LOCAL_FONT_BUDGET_BYTES } from "./assets";

/**
 * A frame imports an asset (#101) and its document names it by the URL of its
 * bytes (#216): what the document says, the closure that decides when it
 * changes, and what the route at that URL answers.
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
	it("serves an imported image by a URL named for its bytes, never inlined", async () => {
		const { root, document } = project();
		writeAsset(root, "frames/entry/hero.png", COVER_PNG);
		writeFrame(
			root,
			"entry",
			'import hero from "./hero.png";\nexport default function Frame() { return <img src={hero} alt="" />; }\n',
		);

		const response = await document();
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain(`"/asset/${createHash("sha256").update(COVER_PNG).digest("hex")}.png"`);
		expect(body).not.toContain("data:image/png");
	});

	it.each(["txt", "glsl", "wgsl"])(
		"carries an imported .%s file as text and makes it a cache input",
		async (extension) => {
			const { root, document } = project();
			writeDesignFile(root, `frames/entry/copy.${extension}`, "first copy\n");
			writeFrame(
				root,
				"entry",
				`import copy from "./copy.${extension}";\nexport default function Frame() { return <p>{copy}</p>; }\n`,
			);

			const first = await document();
			expect(await first.text()).toContain("first copy");
			const etag = first.headers.get("etag");
			expect(etag).toBeTruthy();

			writeDesignFile(root, `frames/entry/copy.${extension}`, "second copy\n");
			const second = await document();
			expect(await second.text()).toContain("second copy");
			expect(second.headers.get("etag")).not.toBe(etag);
		},
	);

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

	it("fails the frame on an image bigger than a project file may be, naming the file", async () => {
		const { root, document } = project();
		writeAsset(root, "frames/entry/huge.png", Buffer.alloc(FILE_LIMIT_BYTES + 1, 7));
		writeFrame(
			root,
			"entry",
			'import huge from "./huge.png";\nexport default function Frame() { return <img src={huge} alt="" />; }\n',
		);

		const body = await (await document()).text();
		expect(body).toContain("design/frames/entry/huge.png is 26 MB, over the 25 MB a project file may be");
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
