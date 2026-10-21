import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { APP_PATH_SEGMENTS } from "./app-paths";
import { createDaemonApp } from "./daemon/app";
import { placeOf } from "./home-places";
import * as protocol from "./team-sync-protocol";
import { makeApp, makeTempDir } from "./test-helpers";

/** The daemon's routes as Hono holds them, split into their literal segments. */
function routes(): string[][] {
	const daemon = createDaemonApp({ spoolDir: join(makeTempDir(), ".spool"), version: "0.0.0-test" });
	onTestFinished(() => daemon.close());
	return daemon.app.routes.map((route) => route.path.split("/").filter(Boolean));
}

const literal = (segment: string | undefined): segment is string =>
	segment !== undefined && segment !== "*" && !segment.startsWith(":");

describe("the app's own first path segments", () => {
	it("hold every first segment the daemon serves", () => {
		const served = new Set(
			routes()
				.map(([first]) => first)
				.filter(literal),
		);
		expect([...served].filter((segment) => !APP_PATH_SEGMENTS.includes(segment))).toEqual([]);
	});

	it("hold every segment of the daemon's API beneath /api", () => {
		const api = new Set(
			routes()
				.filter(([first]) => first === "api")
				.map(([, second]) => second)
				.filter(literal),
		);
		expect([...api].filter((segment) => !APP_PATH_SEGMENTS.includes(segment))).toEqual([]);
	});

	it("hold Home's own places in the Mac app", () => {
		expect(APP_PATH_SEGMENTS).toEqual(expect.arrayContaining(["recent", "account", "p"]));
	});

	it("ship in the sync protocol, which spool.page reads them from", () => {
		expect(protocol.APP_PATH_SEGMENTS).toBe(APP_PATH_SEGMENTS);
	});

	it("are never read as a team's address", () => {
		for (const segment of APP_PATH_SEGMENTS.filter((segment) => !["recent", "account"].includes(segment)))
			expect(placeOf(`/${segment}`)).toBeNull();
	});
});

describe("the daemon serving Home's places", () => {
	const app = () => {
		const uiDir = makeTempDir();
		writeFileSync(join(uiDir, "index.html"), "<!doctype html><title>spool</title><div id=app></div>\n");
		return makeApp(join(makeTempDir(), ".spool"), { uiDir });
	};

	it("serves the app at every place's address, a reload of Settings › Billing included", async () => {
		const daemon = app();
		for (const path of ["/", "/recent", "/account", "/tidemark", "/tidemark/people", "/tidemark/settings/billing"]) {
			const response = await daemon.request(path);
			expect(response.status, path).toBe(200);
			expect(await response.text(), path).toContain("<title>spool</title>");
		}
	});

	it("serves nothing at a path that is no place, nor beneath its own routes", async () => {
		const daemon = app();
		for (const path of ["/tidemark/elsewhere", "/tidemark/settings/general/x", "/api/nothing", "/vendor", "/p"])
			expect((await daemon.request(path)).status, path).toBe(404);
		expect((await daemon.request("/api/health")).status).toBe(200);
	});
});
