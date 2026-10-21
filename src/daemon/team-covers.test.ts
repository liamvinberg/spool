import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeFrame } from "../test-helpers";
import { type CoverOwed, createTeamCovers } from "./team-covers";
import { writeCaptureError, writeCover } from "./thumbs";

/**
 * Covers of a team project reach Spool Cloud from members' daemons, filed by the version of the frame they are
 * of: whichever Mac shot a version first sends it, and every other Mac that shoots the same version asks, finds
 * it there and sends nothing.
 */

const ORIGIN = "https://cloud.test";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

/** spool.page's side: the covers it keeps by version, and every request that reached it. */
function fakeCloud() {
	const kept = new Map<string, { frame: string; bytes: Uint8Array }>();
	const requests: { method: string; path: string }[] = [];
	const fetch: typeof globalThis.fetch = async (input, init) => {
		const url = new URL(String(input));
		const method = init?.method ?? "GET";
		requests.push({ method, path: url.pathname });
		const source = url.pathname.split("/").at(-1) ?? "";
		if (new Headers(init?.headers).get("authorization") !== "Bearer device")
			return new Response(null, { status: 401 });
		// which version's cover each frame has: the newest kept of it
		if (method === "GET" && source === "covers")
			return Response.json({
				covers: Object.fromEntries([...kept].map(([version, { frame }]) => [frame, version])),
			});
		if (method === "HEAD") return new Response(null, { status: kept.has(source) ? 200 : 404 });
		if (method === "PUT") {
			if (!kept.has(source))
				kept.set(source, {
					frame: url.searchParams.get("frame") ?? "",
					bytes: new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer()),
				});
			return new Response(null, { status: 201 });
		}
		return new Response(null, { status: 405 });
	};
	return { kept, requests, fetch };
}

function project(link?: string): string {
	const root = join(makeTempDir(), "checkout");
	mkdirSync(join(root, "design", ".spool"), { recursive: true });
	if (link !== undefined) writeFileSync(join(root, "spool.json"), JSON.stringify({ project: link }));
	return root;
}

function machine(cloud: Pick<ReturnType<typeof fakeCloud>, "fetch">, owed: [string, string, CoverOwed][] = []) {
	return createTeamCovers({
		spoolDir: makeTempDir(),
		request: () => ({ origin: ORIGIN, vault: { read: async () => "device" }, fetch: cloud.fetch }),
		owe: (root, frame, why) => owed.push([root, frame, why]),
	});
}

describe("a team project's covers", () => {
	it("are sent once per version, by whichever Mac shot it first", async () => {
		const cloud = fakeCloud();
		const ana = machine(cloud);
		const ben = machine(cloud);
		const anas = project(`${ORIGIN}/devosurf/checkout`);
		const bens = project(`${ORIGIN}/devosurf/checkout`);

		ana.stored(anas, "home", "a".repeat(64), JPEG);
		await ana.settled();
		ben.stored(bens, "home", "a".repeat(64), new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9]));
		await ben.settled();

		expect([...cloud.kept.keys()]).toEqual(["a".repeat(64)]);
		expect(cloud.kept.get("a".repeat(64))).toEqual({ frame: "home", bytes: JPEG });
		expect(cloud.requests.filter((request) => request.method === "PUT")).toHaveLength(1);
		expect(cloud.requests.map((request) => request.path)).toEqual(
			Array(3).fill(`/api/teams/devosurf/projects/checkout/covers/${"a".repeat(64)}`),
		);

		// a new version is a new cover
		ben.stored(bens, "home", "b".repeat(64), JPEG);
		await ben.settled();
		expect([...cloud.kept.keys()]).toEqual(["a".repeat(64), "b".repeat(64)]);
	});

	it("stay on this Mac for a solo project, an ended copy and a team on another cloud", async () => {
		const cloud = fakeCloud();
		const mac = machine(cloud);
		const ended = project(`${ORIGIN}/devosurf/checkout`);
		writeFileSync(join(ended, "design", ".spool", "sync.json"), JSON.stringify({ ended: true }));

		mac.stored(project(), "home", "a".repeat(64), JPEG);
		mac.stored(ended, "home", "a".repeat(64), JPEG);
		mac.stored(project("https://elsewhere.test/devosurf/checkout"), "home", "a".repeat(64), JPEG);
		await mac.settled();

		expect(cloud.requests).toEqual([]);
	});

	it("are not sent again once a newer version's cover replaced them", async () => {
		const methods: string[] = [];
		const mac = machine({
			fetch: async (_input, init) => {
				methods.push(init?.method ?? "GET");
				return Response.json({ error: "cover_replaced" }, { status: 410 });
			},
		});
		mac.stored(project(`${ORIGIN}/devosurf/checkout`), "home", "a".repeat(64), JPEG);
		await mac.settled();
		expect(methods).toEqual(["HEAD"]);
	});

	it("say nothing when spool.page already holds a newer cover", async () => {
		const lines: string[] = [];
		const fetch: typeof globalThis.fetch = async (_input, init) => {
			if ((init?.method ?? "GET") === "HEAD") return new Response(null, { status: 404 });
			return Response.json({ error: "cover_stale" }, { status: 409 });
		};
		const mac = createTeamCovers({
			spoolDir: makeTempDir(),
			request: () => ({ origin: ORIGIN, vault: { read: async () => "device" }, fetch }),
			log: (line) => lines.push(line),
		});
		mac.stored(project(`${ORIGIN}/devosurf/checkout`), "home", "a".repeat(64), JPEG);
		await mac.settled();
		expect(lines).toEqual([]);
	});
});

describe("a team project brought level with spool.page's covers", () => {
	const A = "a".repeat(64);
	const B = "b".repeat(64);
	const C = "c".repeat(64);
	const D = "d".repeat(64);
	const link = `${ORIGIN}/devosurf/checkout`;
	const withFrames = (...frames: string[]) => {
		const root = project(link);
		for (const frame of frames) writeFrame(root, frame, "export default () => null;\n");
		return root;
	};

	it("sends each still the cloud keeps another version's cover of, or none", async () => {
		const cloud = fakeCloud();
		const root = withFrames("home", "cart", "menu");
		// the cloud keeps home at A and menu at C; the stills here are of home at B, cart at B and menu at C
		cloud.kept.set(A, { frame: "home", bytes: JPEG });
		cloud.kept.set(C, { frame: "menu", bytes: JPEG });
		writeCover(root, "home", Buffer.from(JPEG), undefined, B);
		writeCover(root, "cart", Buffer.from(JPEG), undefined, D);
		writeCover(root, "menu", Buffer.from(JPEG), undefined, C);
		const mac = machine(cloud);
		mac.keeping([root]);
		await mac.settled();

		expect(cloud.kept.get(B)?.frame).toBe("home");
		expect(cloud.kept.get(D)?.frame).toBe("cart");
		const sent = cloud.requests.filter((one) => one.method === "PUT").map((one) => one.path.split("/").at(-1));
		expect(sent.sort()).toEqual([B, D]);
	});

	it("asks once when nothing is owed, however often it is kept", async () => {
		const cloud = fakeCloud();
		const root = withFrames("home");
		cloud.kept.set(A, { frame: "home", bytes: JPEG });
		writeCover(root, "home", Buffer.from(JPEG), undefined, A);
		const owed: [string, string, CoverOwed][] = [];
		const mac = machine(cloud, owed);
		mac.keeping([root]);
		mac.keeping([root]);
		await mac.settled();

		expect(cloud.requests).toEqual([{ method: "GET", path: "/api/teams/devosurf/projects/checkout/covers" }]);
		expect(owed).toEqual([]);
	});

	it("owes the booth a frame the cloud has no cover of, and no still here can be sent of", async () => {
		const cloud = fakeCloud();
		const root = withFrames("never", "unknown", "failed", "covered");
		writeCover(root, "unknown", Buffer.from(JPEG));
		writeCover(root, "failed", Buffer.from(JPEG));
		writeCaptureError(root, "failed", "too slow");
		writeCover(root, "covered", Buffer.from(JPEG));
		cloud.kept.set(A, { frame: "covered", bytes: JPEG });
		const owed: [string, string, CoverOwed][] = [];
		const mac = machine(cloud, owed);
		mac.keeping([root]);
		await mac.settled();

		// a frame the booth failed on would only fail again, and one the cloud has a cover of is left as it is
		expect(owed.sort()).toEqual([
			[root, "never", "missing"],
			[root, "unknown", "stale"],
		]);
	});

	it("goes through one root of the copies that follow the same project", async () => {
		const cloud = fakeCloud();
		const checkout = withFrames("home");
		const worktree = withFrames("home");
		const owed: [string, string, CoverOwed][] = [];
		const mac = machine(cloud, owed);
		mac.keeping([checkout, worktree, project(), project("https://elsewhere.test/devosurf/checkout")]);
		await mac.settled();

		expect(cloud.requests).toHaveLength(1);
		expect(owed).toEqual([[checkout, "home", "missing"]]);
	});

	it("is brought level when its team link appears, and again when it comes back", async () => {
		const cloud = fakeCloud();
		const root = join(makeTempDir(), "checkout");
		mkdirSync(join(root, "design", ".spool"), { recursive: true });
		const mac = machine(cloud);
		mac.keeping([root]);
		await mac.settled();
		expect(cloud.requests).toEqual([]);

		writeFileSync(join(root, "spool.json"), JSON.stringify({ project: link }));
		mac.keeping([root]);
		mac.keeping([]);
		mac.keeping([root]);
		await mac.settled();
		expect(cloud.requests).toHaveLength(2);
	});

	it("skips a spool.page with no list of covers, and asks again after a failure", async () => {
		const root = withFrames("home");
		const owed: [string, string, CoverOwed][] = [];
		let older = 0;
		const mac = machine(
			{
				fetch: async () => {
					older++;
					return new Response("404 Not Found", { status: 404 });
				},
			},
			owed,
		);
		mac.keeping([root]);
		await mac.settled();
		mac.keeping([root]);
		await mac.settled();
		// a spool.page from before the list: nothing to bring level with, and not asked again
		expect(older).toBe(1);

		let offline = 0;
		const away = machine(
			{
				fetch: async () => {
					offline++;
					throw new Error("offline");
				},
			},
			owed,
		);
		away.keeping([root]);
		await away.settled();
		away.keeping([root]);
		await away.settled();
		expect(offline).toBe(2);
		expect(owed).toEqual([]);
	});
});
