import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeFrame } from "../test-helpers";

/**
 * The compile probe behind shot and logs (#25): the CLI branches on this JSON
 * — ok hands the closure etag (the log cache key), error the text verbatim.
 */

describe("the verify surface", () => {
	it("answers ok with the served document's etag", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "hello", "export default function Hello() {\n\treturn <main>hi</main>;\n}\n");
		const app = makeApp(spoolDir);

		const verify = await app.request(`/api/p/${name}/verify/hello`);
		expect(verify.status).toBe(200);
		const body = (await verify.json()) as { kind: string; etag: string };
		expect(body.kind).toBe("ok");
		expect(body.etag).toBe((await app.request(`/p/${name}/frames/hello`)).headers.get("etag"));
	});

	it("hands the compile error verbatim for a broken frame", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "broken", "export default function Broken() { return <main>unclosed;\n}\n");
		const app = makeApp(spoolDir);

		const verify = await app.request(`/api/p/${name}/verify/broken`);

		expect(verify.status).toBe(500);
		const body = (await verify.json()) as { kind: string; message: string };
		expect(body.kind).toBe("error");
		expect(body.message).toContain("frame.tsx");
	});

	it("404s a frame that does not exist", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir);

		const verify = await app.request(`/api/p/${name}/verify/ghost`);

		expect(verify.status).toBe(404);
	});
});
