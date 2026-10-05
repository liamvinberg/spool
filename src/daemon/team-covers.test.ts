import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { createTeamCovers } from "./team-covers";

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

function machine(cloud: ReturnType<typeof fakeCloud>) {
	return createTeamCovers({
		spoolDir: makeTempDir(),
		request: () => ({ origin: ORIGIN, vault: { read: async () => "device" }, fetch: cloud.fetch }),
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
});
