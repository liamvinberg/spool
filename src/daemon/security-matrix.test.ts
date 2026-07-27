import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { initProject } from "../init";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createDaemonApp } from "./app";
import { captureWorkerCsp } from "./document";
import { CAPTURE_HOST, RENDER_HOST } from "./security";

const CONTROL_HOST = "localhost";
const CONTROL_TOKEN = "control-token-for-tests";

function makeSecurityHarness() {
	const spoolDir = makeTempDir();
	const project = makeProject(spoolDir);
	writeFrame(project.root, "home", "export default function Home() { return <main>safe</main> }");
	writeDesignFile(
		project.root,
		"shared/scenarios/default.json",
		JSON.stringify({ state: { owner: project.root }, mock: {} }),
	);
	writeDesignFile(project.root, "shared/fixtures/secret.json", JSON.stringify({ project: project.root }));
	const daemon = createDaemonApp({
		spoolDir,
		version: "0.0.0-test",
		controlHost: CONTROL_HOST,
		controlToken: CONTROL_TOKEN,
	});
	daemon.setSelfOrigin(`http://${CONTROL_HOST}`);
	onTestFinished(() => daemon.close());

	const request = (host: string, path: string, init?: RequestInit) =>
		daemon.app.request(`http://${host}${path}`, init);
	const control = (path: string, init: RequestInit = {}) =>
		request(CONTROL_HOST, path, {
			...init,
			headers: { "x-spool-control": CONTROL_TOKEN, ...Object.fromEntries(new Headers(init.headers)) },
		});
	const render = (path: string, init?: RequestInit) => request(RENDER_HOST, path, init);
	const capture = (path: string, init?: RequestInit) => request(CAPTURE_HOST, path, init);

	return { spoolDir, project, daemon, request, control, render, capture };
}

function shellConfigOf(document: string): { innerUrl: string } {
	const serialized = document.match(/window\.__SPOOL_SHELL__\s*=\s*JSON\.parse\(("(?:\\.|[^"\\])*")\)/)?.[1];
	expect(serialized, "player shell config").toBeDefined();
	return JSON.parse(JSON.parse(serialized ?? '"{}"'));
}

describe("daemon authority matrix", () => {
	it.each([
		["IPv4", "127.0.0.1", "http://127.0.0.1:7788"],
		["IPv6", "::1", "http://[::1]:7788"],
	])("injects the bound capture origin for %s control hosts", async (_label, controlHost, origin) => {
		const spoolDir = makeTempDir();
		const uiDir = makeTempDir();
		writeFileSync(join(uiDir, "index.html"), "<!doctype html><html><head></head><body></body></html>");
		const daemon = createDaemonApp({
			spoolDir,
			uiDir,
			version: "0.0.0-test",
			controlHost,
			controlToken: CONTROL_TOKEN,
		});
		daemon.setSelfOrigin(origin);
		onTestFinished(() => daemon.close());

		const response = await daemon.app.request(`${origin}/`);
		expect(response.status).toBe(200);
		const document = await response.text();
		expect(document).toContain(`window.__SPOOL_CAPTURE_ORIGIN__ = "http://capture-spool.localhost:7788"`);
	});

	it("accepts only the configured control, render, and capture hosts", async () => {
		const { request } = makeSecurityHarness();

		expect((await request(CONTROL_HOST, "/api/health")).status).toBe(200);
		expect((await request(RENDER_HOST, "/api/health")).status).toBe(404);
		expect((await request(CAPTURE_HOST, "/api/health")).status).toBe(404);
		expect((await request("attacker.example", "/api/health")).status).toBe(421);
		expect((await request("spool.localhost.attacker.example", "/")).status).toBe(421);
	});

	it("serves only the static worker route from the capture host", async () => {
		const { project, capture, control, render, request } = makeSecurityHarness();

		const worker = await capture("/capture");
		expect(worker.status).toBe(200);
		expect(worker.headers.get("content-type")).toContain("text/html");
		expect(worker.headers.get("cache-control")).toBe("no-store");
		expect(worker.headers.get("content-security-policy")).toBe(captureWorkerCsp(`http://${CONTROL_HOST}`));
		expect(worker.headers.get("x-content-type-options")).toBe("nosniff");
		expect(await worker.text()).toContain("spool-capture-bootstrap-v1");

		expect((await control("/capture")).status).toBe(404);
		expect((await render("/capture")).status).toBe(404);
		expect((await capture("/capture?unexpected=1")).status).toBe(404);
		expect((await capture("/capture/")).status).toBe(404);
		expect((await capture("/capt%75re")).status).toBe(404);
		for (const path of [
			"/",
			"/api/health",
			"/vendor/spool.js",
			`/p/${encodeURIComponent(project.name)}/frames/home`,
		]) {
			expect((await capture(path)).status).toBe(404);
		}
		for (const method of ["POST", "HEAD", "OPTIONS"]) {
			expect((await capture("/capture", { method })).status).toBe(404);
		}
		expect((await request("capture-spool.localhost.attacker.example", "/capture")).status).toBe(421);
	});

	it("rebuilds cached frame authority when the bound control origin changes", async () => {
		const { project, daemon, render } = makeSecurityHarness();
		const path = `/p/${encodeURIComponent(project.name)}/frames/home`;

		const first = await render(path);
		expect(first.headers.get("x-spool-cache")).toBe("miss");
		const firstEtag = first.headers.get("etag");
		expect(firstEtag).not.toBeNull();
		expect(await first.text()).toContain('"controlOrigin":"http://localhost"');

		daemon.setSelfOrigin("http://localhost:8899");
		const rebound = await render(path);
		expect(rebound.headers.get("x-spool-cache")).toBe("miss");
		expect(rebound.headers.get("etag")).not.toBe(firstEtag);
		expect(await rebound.text()).toContain('"controlOrigin":"http://localhost:8899"');
	});

	it("authenticates every control API before resolving sensitive targets", async () => {
		const { project, request, control } = makeSecurityHarness();
		const path = `/api/p/${encodeURIComponent(project.name)}/frames`;

		const missing = await request(CONTROL_HOST, path);
		expect(missing.status).toBe(401);
		expect(await missing.text()).not.toContain(project.root);

		const incorrect = await request(CONTROL_HOST, path, {
			headers: { "x-spool-control": "incorrect" },
		});
		expect(incorrect.status).toBe(401);
		expect(await incorrect.text()).not.toContain(project.root);

		expect((await control(path)).status).toBe(200);
		expect((await request(CONTROL_HOST, "/api/health")).status).toBe(200);
	});

	it("lets a cover's own address be its credential, on the control host alone", async () => {
		const { project, request, control } = makeSecurityHarness();
		const body = new FormData();
		body.append("w195", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])]));
		const put = await control(`/api/p/${encodeURIComponent(project.name)}/thumbs/home`, { method: "PUT", body });
		expect(put.status).toBe(200);
		const { hash } = (await put.json()) as { hash: string };
		const rung = `/covers/${encodeURIComponent(project.name)}/home/${hash}/195`;

		// An <img> cannot carry the control header, so writing the ladder's content
		// hash into the URL is what authorizes the read (#111). Nothing weaker
		// does: a wrong hash names no cover, whoever asks.
		expect((await request(CONTROL_HOST, rung)).status).toBe(200);
		expect(
			(await request(CONTROL_HOST, `/covers/${encodeURIComponent(project.name)}/home/${"0".repeat(32)}/195`)).status,
		).toBe(404);

		// and the address only exists on the trusted host: a frame document, which
		// shares neither origin nor capability with the canvas, cannot reach it
		expect((await request(RENDER_HOST, rung)).status).toBe(404);
		expect((await request(CAPTURE_HOST, rung)).status).toBe(404);
	});

	it("protects control writes with the same token and origin policy as reads", async () => {
		const { project, request, control } = makeSecurityHarness();
		const path = `/api/p/${encodeURIComponent(project.name)}/selection`;
		const body = JSON.stringify({ frames: ["home"] });
		const init = { method: "PUT", headers: { "content-type": "application/json" }, body };

		expect((await request(CONTROL_HOST, path, init)).status).toBe(401);
		expect(
			(
				await request(CONTROL_HOST, path, {
					...init,
					headers: {
						...init.headers,
						"x-spool-control": CONTROL_TOKEN,
						origin: "https://attacker.example",
					},
				})
			).status,
		).toBe(403);
		expect((await control(path, init)).status).toBe(204);
		expect(await (await control(path)).json()).toMatchObject({ selection: [{ frame: "home" }] });
	});

	it("requires the expected browser origin in addition to the control token", async () => {
		const { request } = makeSecurityHarness();
		const headers = { "x-spool-control": CONTROL_TOKEN };

		expect(
			(
				await request(CONTROL_HOST, "/api/projects", {
					headers: { ...headers, origin: `http://${CONTROL_HOST}` },
				})
			).status,
		).toBe(200);
		expect(
			(
				await request(CONTROL_HOST, "/api/projects", {
					headers: { ...headers, origin: "https://attacker.example" },
				})
			).status,
		).toBe(403);
		expect(
			(
				await request(CONTROL_HOST, "/api/projects", {
					headers: { ...headers, origin: "null" },
				})
			).status,
		).toBe(403);

		const preflight = await request(CONTROL_HOST, "/api/projects", {
			method: "OPTIONS",
			headers: {
				origin: "https://attacker.example",
				"access-control-request-method": "GET",
				"access-control-request-headers": "x-spool-control",
			},
		});
		expect(preflight.status).toBe(403);
		expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
		expect(preflight.headers.get("access-control-allow-headers")).toBeNull();
	});

	it("partitions control and executable render routes by host", async () => {
		const { project, control, render, request } = makeSecurityHarness();
		const framePath = `/p/${encodeURIComponent(project.name)}/frames/home`;
		const playPath = `/play/${encodeURIComponent(project.name)}?frame=home`;

		expect((await control(framePath)).status).toBe(404);
		expect((await render("/api/projects")).status).toBe(404);
		expect(
			(await request(RENDER_HOST, "/api/projects", { headers: { "x-spool-control": CONTROL_TOKEN } })).status,
		).toBe(404);

		const frame = await render(framePath);
		expect(frame.status).toBe(200);
		expect(frame.headers.get("content-security-policy")).toBe("sandbox allow-scripts");
		expect(await frame.text()).toContain('children: "safe"');

		const shell = await request(CONTROL_HOST, playPath);
		const shellHtml = await shell.text();
		expect(shell.status).toBe(200);
		expect(shell.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
		expect(shell.headers.get("x-frame-options")).toBe("DENY");
		const shellInner = new URL(shellConfigOf(shellHtml).innerUrl);
		expect(`${shellInner.origin}${shellInner.pathname}`).toBe(`http://${RENDER_HOST}${playPath.split("?")[0]}`);
		expect(shellInner.searchParams.get("frame")).toBe("home");
		expect(shellInner.searchParams.get("scenario")).toBe("default");
		expect(shellInner.searchParams.get("shell")).toBe("1");
		expect(shellInner.searchParams.get("handoff")).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(shellHtml).not.toContain("<spool-boot>");
		expect(shellHtml).not.toContain('message.spool === "player-close"');
		// The trusted page owns player chrome and transforms only the native iframe
		// host. The render document stays a composed frame document at its viewport.
		expect(shellHtml).toContain("/player-assets/player-shell.js");
		expect(shellHtml).toContain("/player-assets/react.js");

		const inner = await render(`${shellInner.pathname}${shellInner.search}`);
		const innerHtml = await inner.text();
		expect(inner.status).toBe(200);
		expect(inner.headers.get("content-security-policy")).toBe("sandbox allow-scripts");
		expect(innerHtml).toContain("window.__SPOOL_PLAY__");
	});

	it("pins the resolved start frame into the render-origin player request", async () => {
		const { project, request } = makeSecurityHarness();
		const shell = await request(CONTROL_HOST, `/play/${encodeURIComponent(project.name)}`);

		expect(shell.status).toBe(200);
		const inner = new URL(shellConfigOf(await shell.text()).innerUrl);
		expect(`${inner.origin}${inner.pathname}`).toBe(`http://${RENDER_HOST}/play/${encodeURIComponent(project.name)}`);
		expect(inner.searchParams.get("frame")).toBe("home");
		expect(inner.searchParams.get("scenario")).toBe("default");
		expect(inner.searchParams.get("shell")).toBe("1");
		expect(inner.searchParams.get("handoff")).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("requires one bound, one-time shell handoff on the render origin", async () => {
		const { project, request, render } = makeSecurityHarness();
		const playPath = `/play/${encodeURIComponent(project.name)}?frame=home`;

		const plain = await render(`${playPath}&scenario=default&shell=1`);
		expect(plain.status).toBe(403);
		expect(await plain.text()).not.toContain("window.__SPOOL_PLAY__");

		const shell = await request(CONTROL_HOST, playPath);
		const inner = new URL(shellConfigOf(await shell.text()).innerUrl);
		const first = await render(`${inner.pathname}${inner.search}`);
		expect(first.status).toBe(200);
		expect(await first.text()).toContain("window.__SPOOL_PLAY__");

		const replay = await render(`${inner.pathname}${inner.search}`);
		expect(replay.status).toBe(403);
		expect(await replay.text()).not.toContain("window.__SPOOL_PLAY__");

		for (const mutate of [
			(url: URL) => url.searchParams.set("frame", "other"),
			(url: URL) => url.searchParams.set("scenario", "other"),
			(url: URL) => {
				url.pathname = "/play/other";
			},
		]) {
			const nextShell = await request(CONTROL_HOST, playPath);
			const original = new URL(shellConfigOf(await nextShell.text()).innerUrl);
			const wrong = new URL(original);
			mutate(wrong);
			expect((await render(`${wrong.pathname}${wrong.search}`)).status).toBe(403);
			expect((await render(`${original.pathname}${original.search}`)).status).toBe(403);
		}

		expect((await render(`${playPath}&scenario=default&shell=1&handoff=malformed`)).status).toBe(400);
	});

	it("bounds outstanding shell handoffs and evicts the oldest", async () => {
		const { project, request, render } = makeSecurityHarness();
		const playPath = `/play/${encodeURIComponent(project.name)}?frame=home`;
		const issued: URL[] = [];
		for (let index = 0; index < 65; index++) {
			const shell = await request(CONTROL_HOST, playPath);
			issued.push(new URL(shellConfigOf(await shell.text()).innerUrl));
		}

		const oldest = issued[0] as URL;
		const newest = issued.at(-1) as URL;
		expect((await render(`${oldest.pathname}${oldest.search}`)).status).toBe(403);
		expect((await render(`${newest.pathname}${newest.search}`)).status).toBe(200);
	});

	it("serves public runtime assets only from the render host", async () => {
		const { request, render } = makeSecurityHarness();

		const runtime = await render("/vendor/spool.js", { headers: { origin: "null" } });
		expect(runtime.status).toBe(200);
		expect(runtime.headers.get("access-control-allow-origin")).toBe("*");
		expect((await request(CONTROL_HOST, "/vendor/spool.js")).status).toBe(404);
		expect((await render("/vendor/player-shell.js")).status).toBe(404);

		const shellRuntime = await request(CONTROL_HOST, "/player-assets/player-shell.js");
		expect(shellRuntime.status).toBe(200);
		expect(shellRuntime.headers.get("access-control-allow-origin")).toBeNull();
		expect(await shellRuntime.text()).toContain("bootPlayerShell");
		expect((await request(CONTROL_HOST, "/player-assets/react.js")).status).toBe(200);
		expect((await request(CONTROL_HOST, "/player-assets/fonts/fragment-mono-latin-400-normal.woff2")).status).toBe(
			200,
		);
		expect((await render("/player-assets/player-shell.js")).status).toBe(404);
		expect((await render("/player-assets/react.js")).status).toBe(404);
	});
});

describe("project data capabilities", () => {
	it("mints one project-scoped capability into render documents", async () => {
		const { project, render } = makeSecurityHarness();
		const document = await (await render(`/p/${encodeURIComponent(project.name)}/frames/home`)).text();

		const match = document.match(/"projectCapability":"([^"]+)"/);
		expect(match?.[1]).toBeTruthy();
		expect(document).not.toContain(CONTROL_TOKEN);
	});

	it("accepts opaque-origin reads only with the matching project capability", async () => {
		const first = makeSecurityHarness();
		const second = makeProject(first.spoolDir);
		writeDesignFile(second.root, "shared/fixtures/secret.json", JSON.stringify({ project: second.root }));
		writeDesignFile(
			second.root,
			"shared/scenarios/default.json",
			JSON.stringify({ state: { owner: second.root }, mock: {} }),
		);
		const capability = first.daemon.projectCapability(first.project.root);
		const firstPath = `/api/p/${encodeURIComponent(first.project.name)}/fixtures/secret`;
		const firstScenarioPath = `/api/p/${encodeURIComponent(first.project.name)}/scenarios/default`;
		const secondPath = `/api/p/${encodeURIComponent(second.name)}/fixtures/secret`;
		const secondScenarioPath = `/api/p/${encodeURIComponent(second.name)}/scenarios/default`;
		const headers = { origin: "null", "x-spool-project": capability };

		expect((await first.render(firstPath, { headers: { origin: "null" } })).status).toBe(401);
		expect(
			(await first.render(firstPath, { headers: { origin: "null", "x-spool-project": "incorrect" } })).status,
		).toBe(401);
		expect((await first.render(firstPath, { headers: { "x-spool-project": capability } })).status).toBe(403);
		expect(
			(
				await first.render(firstPath, {
					headers: { origin: `http://${RENDER_HOST}`, "x-spool-project": capability },
				})
			).status,
		).toBe(403);

		const own = await first.render(firstPath, { headers });
		expect(own.status).toBe(200);
		expect((await own.json()) as unknown).toEqual({ project: first.project.root });
		expect(own.headers.get("access-control-allow-origin")).toBe("null");
		expect(own.headers.get("access-control-allow-origin")).not.toBe("*");
		expect(own.headers.get("vary")).toContain("Origin");

		const ownScenario = await first.render(firstScenarioPath, { headers });
		expect(ownScenario.status).toBe(200);
		expect(await ownScenario.json()).toEqual({ state: { owner: first.project.root }, mock: {} });

		const crossProject = await first.render(secondPath, { headers });
		expect(crossProject.status).toBe(403);
		expect(await crossProject.text()).not.toContain(second.root);
		const crossProjectScenario = await first.render(secondScenarioPath, { headers });
		expect(crossProjectScenario.status).toBe(403);
		expect(await crossProjectScenario.text()).not.toContain(second.root);

		const foreignOrigin = await first.render(firstPath, {
			headers: { origin: "https://attacker.example", "x-spool-project": capability },
		});
		expect(foreignOrigin.status).toBe(403);
		expect(await foreignOrigin.text()).not.toContain(first.project.root);
	});

	it("uses the capability to isolate roots that share one display name", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const firstDir = join(makeTempDir(), "same-name");
		const secondDir = join(makeTempDir(), "same-name");
		mkdirSync(firstDir);
		mkdirSync(secondDir);
		const first = { root: initProject(firstDir, spoolDir).root, name: "same-name" };
		const second = { root: initProject(secondDir, spoolDir).root, name: "same-name" };
		writeDesignFile(first.root, "shared/fixtures/secret.json", JSON.stringify({ owner: "first" }));
		writeDesignFile(second.root, "shared/fixtures/secret.json", JSON.stringify({ owner: "second" }));
		const daemon = createDaemonApp({
			spoolDir,
			version: "0.0.0-test",
			controlHost: CONTROL_HOST,
			controlToken: CONTROL_TOKEN,
		});
		onTestFinished(() => daemon.close());
		const read = (capability: string) =>
			daemon.app.request(`http://${RENDER_HOST}/api/p/same-name/fixtures/secret`, {
				headers: { origin: "null", "x-spool-project": capability },
			});

		const firstRead = await read(daemon.projectCapability(first.root));
		expect(await firstRead.json()).toEqual({ owner: "first" });
		expect(firstRead.headers.get("cache-control")).toBe("no-store");
		expect(firstRead.headers.get("vary")).toContain("X-Spool-Project");
		expect(await (await read(daemon.projectCapability(second.root))).json()).toEqual({ owner: "second" });
		const controlAmbiguity = await daemon.app.request(`http://${CONTROL_HOST}/api/p/same-name/frames`, {
			headers: { "x-spool-control": CONTROL_TOKEN },
		});
		expect(controlAmbiguity.status).toBe(409);
		expect(await controlAmbiguity.text()).toContain(first.root);

		const renderAmbiguity = await daemon.app.request(`http://${RENDER_HOST}/p/same-name/frames/ghost`);
		expect(renderAmbiguity.status).toBe(409);
		const renderError = await renderAmbiguity.text();
		expect(renderError).not.toContain(first.root);
		expect(renderError).not.toContain(second.root);
	});

	it("answers only the project-capability preflight used by opaque-origin frames", async () => {
		const { project, daemon, render } = makeSecurityHarness();
		const path = `/api/p/${encodeURIComponent(project.name)}/scenarios/default`;
		const preflight = await render(path, {
			method: "OPTIONS",
			headers: {
				origin: "null",
				"access-control-request-method": "GET",
				"access-control-request-headers": "x-spool-project",
				"x-spool-project": daemon.projectCapability(project.root),
			},
		});

		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("access-control-allow-origin")).toBe("null");
		expect(preflight.headers.get("access-control-allow-methods")).toBe("GET");
		expect(preflight.headers.get("access-control-allow-headers")).toBe("x-spool-project");

		const scenario = await render(path, {
			headers: {
				origin: "null",
				"x-spool-project": daemon.projectCapability(project.root),
			},
		});
		expect(scenario.status).toBe(200);
		expect(await scenario.json()).toEqual({ state: { owner: project.root }, mock: {} });
	});
});
