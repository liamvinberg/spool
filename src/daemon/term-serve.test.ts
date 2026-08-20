import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureTermExecutor, makeApp, makeProject, makeTempDir, serveProject, writeDesignFile } from "../test-helpers";
import { terminalSourceVersion } from "./term-source";

/**
 * Terminal frames remain discoverable and preserve their last safe still, but
 * the daemon exposes no path that can start project code without an OS sandbox.
 */

function expectSocketRefused(url: string, protocols: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url, protocols);
		socket.addEventListener("open", () => {
			socket.close();
			reject(new Error("terminal socket unexpectedly opened"));
		});
		socket.addEventListener("error", () => resolve());
		socket.addEventListener("close", () => resolve());
	});
}

describe("terminal frame documents", () => {
	it("serves term.tsx as a static disabled surface with no execution capability", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");
		const app = makeApp(spoolDir, { termExecutor: executor });

		const res = await app.request(`/p/${name}/frames/dash`);

		expect(res.status).toBe(200);
		const doc = await res.text();
		expect(doc).toContain("terminal execution is disabled until it can run in an OS sandbox");
		expect(doc).not.toContain("/vendor/spool-term.js");
		expect(doc).not.toContain("terminalCapability");
		expect(doc).not.toContain("projectCapability");
		expect(doc).toContain(`"frame":"dash"`);
		expect(spawned).toEqual([]);
	});

	it("serves the terminal runtime as a self-contained bundle", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		makeProject(spoolDir);
		const app = makeApp(spoolDir);
		const res = await app.request("/vendor/spool-term.js");
		expect(res.status).toBe(200);
		const js = await res.text();
		expect(js).toContain("WebSocket");
		expect(js.length).toBeGreaterThan(10_000);
	});

	it("names a folder holding both entries a discovery error", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "both", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(root, join("frames", "both", "term.tsx"), "// tui\n");
		const app = makeApp(spoolDir);

		const doc = await app.request(`/p/${name}/frames/both`);
		expect(doc.status).toBe(500);
		expect(await doc.text()).toContain("holds both frame.tsx and term.tsx");

		const verify = await app.request(`/api/p/${name}/verify/both`);
		expect(verify.status).toBe(500);
		const body = (await verify.json()) as { kind: string; message: string };
		expect(body.message).toContain("design/frames/both");
	});

	it("names a paged conflict by its real folder, page segment and all", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		// the folder is known here, so the message must not invent the flat
		// `frames/cart` the way the missing case used to (#219, same class as #156)
		writeDesignFile(root, join("frames", "shop", "cart", "frame.tsx"), "export default () => null;\n");
		writeDesignFile(root, join("frames", "shop", "cart", "term.tsx"), "// tui\n");
		const app = makeApp(spoolDir);

		const doc = await app.request(`/p/${name}/frames/cart`);
		expect(doc.status).toBe(500);
		expect(await doc.text()).toContain("design/frames/shop/cart holds both frame.tsx and term.tsx");

		const verify = await app.request(`/api/p/${name}/verify/cart`);
		expect(verify.status).toBe(500);
		const body = (await verify.json()) as { kind: string; message: string };
		expect(body.message).toContain("design/frames/shop/cart");
		expect(body.message).not.toContain("design/frames/cart ");
	});

	it("verify reports a terminal frame as ok — kind is knowable without a compile", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "syntax error here ((\n");
		const app = makeApp(spoolDir, { termExecutor: executor });
		const res = await app.request(`/api/p/${name}/verify/dash`);
		expect(res.status).toBe(200);
		expect(((await res.json()) as { kind: string }).kind).toBe("ok");
		expect(spawned).toEqual([]);
	});

	it("refuses a DOM capture for a terminal frame", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");
		const app = makeApp(spoolDir);
		const res = await app.request(`/api/p/${name}/thumbs/dash`, { method: "PUT", body: new Uint8Array([1]) });
		expect(res.status).toBe(400);
	});
});

describe("the terminal bridge", () => {
	it("refuses every socket without invoking the configured executor", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url, renderUrl } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// dash\n");

		const document = await (await fetch(`${renderUrl}/p/${encodeURIComponent(name)}/frames/dash`)).text();
		const credential = document.match(/"terminalCapability":"([^"]+)"/)?.[1] ?? "guessed-capability";
		const renderSocket = `${renderUrl.replace(/^http/, "ws")}/term/${name}/dash`;
		const controlSocket = `${url.replace(/^http/, "ws")}/term/${name}/dash`;

		await expectSocketRefused(controlSocket, ["spool-term", credential]);
		await expectSocketRefused(renderSocket, ["spool-term"]);
		await expectSocketRefused(renderSocket, ["spool-term", credential]);
		expect(spawned).toEqual([]);
	});
});

describe("shot for terminal frames", () => {
	it("captures a persisted screen without starting a process", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url, controlToken } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");
		writeDesignFile(
			root,
			join(".spool", "term", "dash.screen"),
			`${JSON.stringify({
				cols: 80,
				rows: 24,
				screen: "status: all systems go",
				sourceVersion: terminalSourceVersion(root, "dash"),
			})}\n`,
		);

		const { shotFrame } = await import("../verify");
		const outcome = await shotFrame({ daemonUrl: url, controlToken, root, name, frame: "dash", narrate: () => {} });
		expect(outcome.kind).toBe("shot");
		if (outcome.kind === "shot") {
			expect(outcome.files).toHaveLength(1);
			expect(outcome.files[0]?.endsWith("dash.svg")).toBe(true);
			expect(readFileSync(outcome.files[0] as string, "utf8")).toContain("all systems go");
		}
		expect(spawned).toEqual([]);
	});

	it("rejects a versionless or source-stale persisted screen without starting a process", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url, controlToken } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, "frames/dash/term.tsx", "// v1\n");
		writeDesignFile(root, ".spool/term/dash.screen", `${JSON.stringify({ cols: 80, rows: 24, screen: "old" })}\n`);
		const res = await fetch(`${url}/api/p/${name}/thumbs/dash`, {
			headers: { "X-Spool-Control": controlToken },
		});
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("stale after its source changed");

		writeDesignFile(
			root,
			".spool/term/dash.screen",
			`${JSON.stringify({
				cols: 80,
				rows: 24,
				screen: "v1",
				sourceVersion: terminalSourceVersion(root, "dash"),
			})}\n`,
		);
		writeDesignFile(root, "frames/dash/term.tsx", "// v2\n");
		const { shotFrame } = await import("../verify");
		const outcome = await shotFrame({
			daemonUrl: url,
			controlToken,
			root,
			name,
			frame: "dash",
			narrate: () => {},
		});
		expect(outcome.kind).toBe("broken");
		if (outcome.kind === "broken") expect(outcome.message).toContain("stale after its source changed");
		expect(spawned).toEqual([]);
	});

	it("rejects malformed persisted dimensions at the public thumb seam", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url, controlToken } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, "frames/dash/term.tsx", "// tui\n");
		writeDesignFile(
			root,
			".spool/term/dash.screen",
			`${JSON.stringify({
				cols: 0,
				rows: 24,
				screen: "invalid grid",
				sourceVersion: terminalSourceVersion(root, "dash"),
			})}\n`,
		);

		const res = await fetch(`${url}/api/p/${name}/thumbs/dash`, {
			headers: { "X-Spool-Control": controlToken },
		});
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("stale");
		expect(spawned).toEqual([]);
	});

	it("returns 500 for an operational persisted-store read failure", async () => {
		const { root, name, url, controlToken } = await serveProject();
		writeDesignFile(root, "frames/dash/term.tsx", "// tui\n");
		mkdirSync(join(root, "design", ".spool", "term", "dash.screen"), { recursive: true });

		const res = await fetch(`${url}/api/p/${name}/thumbs/dash`, {
			headers: { "X-Spool-Control": controlToken },
		});
		expect(res.status).toBe(500);
	});

	it.runIf(process.platform !== "win32" && process.getuid?.() !== 0)(
		"returns 500 for an operational terminal source read failure",
		async () => {
			const { root, name, url, controlToken } = await serveProject();
			writeDesignFile(root, "frames/dash/term.tsx", "// tui\n");
			writeDesignFile(root, "frames/dash/private.ts", "export const privateValue = 1;\n");
			writeDesignFile(
				root,
				".spool/term/dash.screen",
				`${JSON.stringify({
					cols: 80,
					rows: 24,
					screen: "current grid",
					sourceVersion: terminalSourceVersion(root, "dash"),
				})}\n`,
			);
			const source = join(root, "design", "frames", "dash", "private.ts");
			chmodSync(source, 0);
			try {
				const res = await fetch(`${url}/api/p/${name}/thumbs/dash`, {
					headers: { "X-Spool-Control": controlToken },
				});
				expect(res.status).toBe(500);
			} finally {
				chmodSync(source, 0o644);
			}
		},
	);

	it("names a never-run terminal honestly instead of shooting a blank", async () => {
		const { spawned, executor } = fixtureTermExecutor();
		const { root, name, url, controlToken } = await serveProject({ termExecutor: executor });
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// tui\n");

		const { shotFrame } = await import("../verify");
		const outcome = await shotFrame({ daemonUrl: url, controlToken, root, name, frame: "dash", narrate: () => {} });
		expect(outcome.kind).toBe("broken");
		if (outcome.kind === "broken") expect(outcome.message).toContain("saving it does not create a screen");
		expect(spawned).toEqual([]);
	});
});
