import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * Compile-time JSX source stamps (#23): frames compile through spool's
 * stamping runtime, so served documents carry exact design-relative source
 * locations for every intrinsic element — the element picker's truth (#6).
 * The stamping import is toolchain, not knowledge: the shared/ui boundary
 * still refuses hand-written "spool" imports.
 */

const frameTsx = `export default function Frame() {
	return (
		<main>
			<button className="pay">Pay now</button>
		</main>
	);
}
`;

describe("JSX source stamps", () => {
	it("compiles frames through the stamping runtime with design-relative locations", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "checkout", frameTsx);
		const app = makeApp(spoolDir);

		const doc = await (await app.request(`/p/${name}/frames/checkout`)).text();

		expect(doc).toContain('from "spool/jsx-dev-runtime"');
		expect(doc).toContain('fileName: "frames/checkout/frame.tsx"');
		// the import map resolves the injected specifier to the served runtime
		expect(doc).toContain('"spool/jsx-dev-runtime":"/vendor/spool-jsx.js"');
	});

	it("serves the stamping runtime at /vendor/spool-jsx.js with an etag", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		makeProject(spoolDir);
		const app = makeApp(spoolDir);

		const res = await app.request("/vendor/spool-jsx.js");

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("javascript");
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
		const js = await res.text();
		expect(js).toContain("data-spool-source");

		const etag = res.headers.get("etag") ?? "";
		expect(etag).not.toBe("");
		expect((await app.request("/vendor/spool-jsx.js", { headers: { "if-none-match": etag } })).status).toBe(304);
	});

	it("keeps the shared/ui boundary: hand-written spool imports still refuse to compile", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(
			root,
			"shared/ui/knowing-button.tsx",
			'import { ui } from "spool";\n\nexport function KnowingButton() {\n\treturn <button onClick={() => ui.back()}>back</button>;\n}\n',
		);
		writeFrame(
			root,
			"hello",
			'import { KnowingButton } from "../../shared/ui/knowing-button";\n\nexport default function Hello() {\n\treturn <KnowingButton />;\n}\n',
		);
		const app = makeApp(spoolDir);

		const res = await app.request(`/p/${name}/frames/hello`);

		expect(res.status).toBe(500);
		expect(await res.text()).toContain("never knowledge");
	});
});
