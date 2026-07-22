import { describe, expect, it } from "vitest";
import { assembleFrameDocument, errorDocument, mergeImportMap } from "./document";

describe("assembleFrameDocument", () => {
	it("keeps a </script> inside frame code from ending the boot module", () => {
		const doc = assembleFrameDocument({
			project: "demo",
			frame: "hello",
			css: "",
			importMap: { imports: {} },
			bootJs: 'const markup = "</script><script>alert(1)</script>";',
		});

		expect(doc).not.toContain('"</script>');
		expect(doc).toContain('"<\\/script>');
	});

	it("escapes the import map against script breakout", () => {
		const doc = assembleFrameDocument({
			project: "demo",
			frame: "hello",
			css: "",
			importMap: { imports: { evil: "https://x/</script>" } },
			bootJs: "",
		});

		expect(doc).not.toContain("https://x/</script>");
	});

	it("escapes frame names in the title and the document config", () => {
		const doc = assembleFrameDocument({ project: "demo", frame: "a<b>", css: "", importMap: {}, bootJs: "" });

		expect(doc).toContain("<title>a&lt;b&gt; · spool</title>");
		expect(doc).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
		expect(doc).toContain('window.__SPOOL__ = {"project":"demo","frame":"a\\u003cb>"}');
	});
});

describe("errorDocument", () => {
	it("shows the message verbatim as text and reports it to a listening canvas", () => {
		const doc = errorDocument("broken", 'x [ERROR] Expected ">" but found "<"');

		expect(doc).toContain("broken failed to compile");
		expect(doc).toContain("Expected &quot;&gt;&quot; but found &quot;&lt;&quot;");
		expect(doc).toContain('parent.postMessage({ spool: "error", frame: "broken"');
	});
});

describe("mergeImportMap", () => {
	it("keeps project libraries but spool's react pins always win", () => {
		const merged = mergeImportMap(
			{ imports: { clsx: "https://esm.sh/clsx", react: "https://esm.sh/react@17" } },
			{ react: "/vendor/react.js" },
		);

		expect(merged).toEqual({ imports: { clsx: "https://esm.sh/clsx", react: "/vendor/react.js" } });
	});

	it("rejects a non-object imports field with a speakable error", () => {
		expect(() => mergeImportMap({ imports: [] }, {})).toThrow(/imports/);
	});
});
