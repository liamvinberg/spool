import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeTempDir } from "../test-helpers";
import { mapCssResources } from "./css-resources";
import { createResources } from "./resources";

describe("portable resource closure", () => {
	it("pins cyclic modules, literal lazy imports and nested CSS/font resources once", async () => {
		const fetched: string[] = [];
		const sources: Record<string, string> = {
			"https://cdn.example/a.js": 'export {b} from "./b.js"; export const lazy=()=>import("./lazy.js");',
			"https://cdn.example/b.js": 'import "./a.js"; export const b=1;',
			"https://cdn.example/lazy.js": "export default 1;",
			"https://fonts.example/style": '@import "./nested"; @font-face{font-family:Test;src:url("./font.woff2")}',
			"https://fonts.example/nested": "body{color:red}",
			"https://fonts.example/font.woff2": "font-bytes",
		};
		const resources = createResources(makeTempDir(), { lib: "https://cdn.example/a.js" }, async (url) => {
			fetched.push(url);
			const source = sources[url];
			if (source === undefined) throw new Error("missing fixture resource");
			return { bytes: Buffer.from(source), url, mediaType: "font/woff2" };
		});
		resources.add(
			"entry.js",
			resources.rewriteModule('import "lib"; import "lib";', "entry.js"),
			"application/javascript",
		);
		resources.add(
			"style.css",
			resources.rewriteCss(
				'@import url("https://fonts.example/style");',
				"style.css",
				join(makeTempDir(), "style.css"),
			),
			"text/css",
		);
		await resources.finish();
		expect(fetched.length).toBe(6);
		expect(new Set(fetched).size).toBe(6);
		const emitted = [...resources.objects.values()].map((object) => Buffer.from(object.bytes).toString()).join("");
		expect(emitted).not.toContain("https://");
		expect(emitted).toContain("font-bytes");
	});
	it("ignores resource-looking comments and string values, and rejects computed module imports", () => {
		const map = vi.fn((value: string) => `pinned-${value}`);
		expect(
			mapCssResources('/* url(missing) */ a{content:"url(keep)";background:url("image.png")} @import "theme";', map),
		).toContain('content:"url(keep)"');
		expect(map.mock.calls.map((call) => call[0])).toEqual(["image.png", "theme"]);
		const resources = createResources(makeTempDir(), {});
		expect(() => resources.rewriteModule("import(name)", "entry.js")).toThrow("computed module import");
		expect(() => resources.rewriteModule('import "unknown"', "entry.js")).toThrow("pinned HTTPS");
	});
});
