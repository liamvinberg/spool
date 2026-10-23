import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fetchLocalCopy, openProject } from "../open";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { makeApp, makeTempDir, until, writeDesignFile, writeFrame, writePageFrame } from "../test-helpers";

/**
 * Restore (spool#188), as two editors' daemons do it against one fake spool.page: the restorer's daemon puts a file,
 * a frame, a page or the whole project back to how it stood at a team version, as new saves marked as a restore,
 * and both Macs' disks end up holding exactly that. Assertions are on disk, on the team's files and on its history.
 */

function repo(): string {
	const root = join(makeTempDir(), "checkout");
	mkdirSync(root);
	execFileSync("git", ["init", "--quiet", "--initial-branch=main", "."], { cwd: root });
	return realpathSync(root);
}

async function twoEditors() {
	const cloud = fakeTeam();
	const ana = cloud.machine("ana");
	const ben = cloud.machine("ben");
	const anaState = join(makeTempDir(), ".spool");
	const benState = join(makeTempDir(), ".spool");
	const { root: anaRoot } = await initTeamProject(repo(), anaState, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	const benRoot = repo();
	copyFileSync(join(anaRoot, "spool.json"), join(benRoot, "spool.json"));
	await fetchLocalCopy(benRoot, benState, { origin: TEAM_ORIGIN, request: ben.request, openSocket: ben.openSocket });
	openProject(benRoot, benState);
	const anaDaemon = makeApp(anaState, { cloud: ana.cloud, teamNotice: () => {} });
	const benDaemon = makeApp(benState, { cloud: ben.cloud, teamNotice: () => {} });
	return {
		cloud,
		ana: { root: anaRoot, daemon: anaDaemon },
		ben: { root: benRoot, daemon: benDaemon },
		/** The team's newest version. */
		head: () => cloud.history("checkout").at(-1)?.version ?? 0,
		team: (path: string) => cloud.file("checkout", path),
	};
}

const text = (root: string, path: string) =>
	existsSync(join(root, "design", path)) ? readFileSync(join(root, "design", path), "utf8") : undefined;

/** Every Mac and the team hold these files so: undefined for one that isn't there. */
async function everywhere(
	roots: string[],
	team: (path: string) => string | null | undefined,
	files: Record<string, string | undefined>,
) {
	for (const [path, want] of Object.entries(files)) {
		await until(() => (team(path) ?? undefined) === want, 10_000);
		for (const root of roots) await until(() => text(root, path) === want, 10_000);
	}
}

type Restored = {
	id: string;
	applied: string[];
	setAside: string[];
	refused: string[];
	undo: { kind: string; target: string; to: number; paths: string[] } | null;
};

async function restore(daemon: ReturnType<typeof makeApp>, body: Record<string, unknown>) {
	const response = await daemon.request("/api/p/checkout/history/restore", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	return { status: response.status, body: (await response.json()) as Restored & { error?: string } };
}

async function plan(daemon: ReturnType<typeof makeApp>, query: Record<string, string>) {
	const response = await daemon.request(`/api/p/checkout/history/restore?${new URLSearchParams(query)}`);
	return (await response.json()) as { files: number; shared: { path: string; frames: string[] }[] };
}

describe("restoring from the team history", { timeout: 60_000 }, () => {
	it("puts a frame back as it stood on both Macs: a deleted file back, one made since gone", async () => {
		const { ana, ben, head, team } = await twoEditors();
		writeFrame(ana.root, "cart", "first\n");
		writeDesignFile(ana.root, "frames/cart/data.json", "{}\n");
		await everywhere([ben.root], team, { "frames/cart/frame.tsx": "first\n", "frames/cart/data.json": "{}\n" });
		const then = head();
		writeFrame(ana.root, "cart", "second\n");
		rmSync(join(ana.root, "design/frames/cart/data.json"));
		writeDesignFile(ana.root, "frames/cart/extra.tsx", "new\n");
		await everywhere([ben.root], team, {
			"frames/cart/frame.tsx": "second\n",
			"frames/cart/data.json": undefined,
			"frames/cart/extra.tsx": "new\n",
		});

		expect(await plan(ben.daemon, { kind: "frame", target: "cart", to: String(then) })).toEqual({
			files: 3,
			shared: [],
		});
		const done = await restore(ben.daemon, { kind: "frame", target: "cart", to: then });
		expect(done.status).toBe(200);
		expect([...done.body.applied].sort()).toEqual([
			"frames/cart/data.json",
			"frames/cart/extra.tsx",
			"frames/cart/frame.tsx",
		]);
		await everywhere([ana.root, ben.root], team, {
			"frames/cart/frame.tsx": "first\n",
			"frames/cart/data.json": "{}\n",
			"frames/cart/extra.tsx": undefined,
		});
	});

	it("puts back the frames a version's restore ticks, and only those, as one restore", async () => {
		const { ana, ben, head, team, cloud } = await twoEditors();
		writePageFrame(ana.root, "shop", "cart", "cart 1\n");
		writePageFrame(ana.root, "shop", "receipt", "receipt 1\n");
		writePageFrame(ana.root, "shop", "promo", "promo 1\n");
		await everywhere([ben.root], team, { "frames/shop/promo/frame.tsx": "promo 1\n" });
		const then = head();
		writePageFrame(ana.root, "shop", "cart", "cart 2\n");
		writePageFrame(ana.root, "shop", "receipt", "receipt 2\n");
		rmSync(join(ana.root, "design/frames/shop/promo"), { recursive: true });
		await everywhere([ben.root], team, {
			"frames/shop/receipt/frame.tsx": "receipt 2\n",
			"frames/shop/promo/frame.tsx": undefined,
		});

		const done = await restore(ben.daemon, {
			kind: "project",
			target: "",
			to: then,
			frames: ["shop/cart", "shop/promo"],
		});
		expect(done.status).toBe(200);
		expect([...done.body.applied].sort()).toEqual(["frames/shop/cart/frame.tsx", "frames/shop/promo/frame.tsx"]);
		await everywhere([ana.root, ben.root], team, {
			"frames/shop/cart/frame.tsx": "cart 1\n",
			"frames/shop/promo/frame.tsx": "promo 1\n",
			"frames/shop/receipt/frame.tsx": "receipt 2\n",
		});
		const restores = new Set(
			cloud.history("checkout").flatMap((save) => (save.restore === null ? [] : [save.restore.id])),
		);
		expect(restores.size).toBe(1);
		expect((await restore(ben.daemon, { kind: "project", target: "", to: then, frames: ["../x"] })).status).toBe(400);
	});

	it("puts back one file, a page and the whole project, each touching only its own", async () => {
		const { ana, ben, head, team } = await twoEditors();
		writePageFrame(ana.root, "shop", "cart", "cart 1\n");
		writePageFrame(ana.root, "shop", "receipt", "receipt 1\n");
		writePageFrame(ana.root, "home", "welcome", "welcome 1\n");
		await everywhere([ben.root], team, { "frames/home/welcome/frame.tsx": "welcome 1\n" });
		const then = head();
		writePageFrame(ana.root, "shop", "cart", "cart 2\n");
		writePageFrame(ana.root, "shop", "receipt", "receipt 2\n");
		writePageFrame(ana.root, "home", "welcome", "welcome 2\n");
		await everywhere([ben.root], team, { "frames/home/welcome/frame.tsx": "welcome 2\n" });

		await restore(ben.daemon, { kind: "file", target: "frames/shop/receipt/frame.tsx", to: then });
		await everywhere([ana.root, ben.root], team, {
			"frames/shop/receipt/frame.tsx": "receipt 1\n",
			"frames/shop/cart/frame.tsx": "cart 2\n",
		});
		await restore(ben.daemon, { kind: "page", target: "shop", to: then });
		await everywhere([ana.root, ben.root], team, {
			"frames/shop/cart/frame.tsx": "cart 1\n",
			"frames/home/welcome/frame.tsx": "welcome 2\n",
		});
		await restore(ben.daemon, { kind: "project", target: "", to: then });
		await everywhere([ana.root, ben.root], team, { "frames/home/welcome/frame.tsx": "welcome 1\n" });
	});

	it("offers a changed shared file the frame imports, naming the other frames using it, and restores it when asked", async () => {
		const { ana, ben, head, team } = await twoEditors();
		const using = (name: string) =>
			`import { Go } from "shared/ui/go";\n\nexport default function F() {\n\treturn <Go label="${name}" />;\n}\n`;
		writeDesignFile(ana.root, "shared/ui/go.tsx", "export const Go = (p: { label: string }) => <b>{p.label}</b>;\n");
		writeFrame(ana.root, "cart", using("cart"));
		writeFrame(ana.root, "menu", using("menu"));
		await everywhere([ben.root], team, { "frames/menu/frame.tsx": using("menu") });
		const then = head();
		const changed = "export const Go = (p: { label: string }) => <i>{p.label}</i>;\n";
		writeDesignFile(ana.root, "shared/ui/go.tsx", changed);
		writeFrame(ana.root, "cart", `${using("cart")}// 2\n`);
		await everywhere([ben.root], team, { "shared/ui/go.tsx": changed });

		// the frame's imports are known once its source graph is built
		for (
			let tries = 0;
			(await plan(ben.daemon, { kind: "frame", target: "cart", to: String(then) })).shared.length === 0;
			tries++
		) {
			if (tries > 200) throw new Error("the shared file was never offered");
			await new Promise((wake) => setTimeout(wake, 50));
		}
		expect(await plan(ben.daemon, { kind: "frame", target: "cart", to: String(then) })).toEqual({
			files: 1,
			shared: [{ path: "shared/ui/go.tsx", frames: ["menu"] }],
		});
		await restore(ben.daemon, { kind: "frame", target: "cart", to: then });
		await everywhere([ana.root, ben.root], team, {
			"frames/cart/frame.tsx": using("cart"),
			"shared/ui/go.tsx": changed,
		});
		await restore(ben.daemon, { kind: "frame", target: "cart", to: then, also: ["shared/ui/go.tsx"] });
		await everywhere([ana.root, ben.root], team, {
			"shared/ui/go.tsx": "export const Go = (p: { label: string }) => <b>{p.label}</b>;\n",
		});
	});

	it("undoes a restore as a restore of the same paths to just before it", async () => {
		const { cloud, ana, ben, head, team } = await twoEditors();
		writeFrame(ana.root, "cart", "first\n");
		await everywhere([ben.root], team, { "frames/cart/frame.tsx": "first\n" });
		const then = head();
		writeFrame(ana.root, "cart", "second\n");
		writeDesignFile(ana.root, "frames/cart/extra.tsx", "new\n");
		await everywhere([ben.root], team, { "frames/cart/extra.tsx": "new\n" });

		const before = head();
		const done = await restore(ben.daemon, { kind: "frame", target: "cart", to: then });
		await everywhere([ana.root, ben.root], team, {
			"frames/cart/frame.tsx": "first\n",
			"frames/cart/extra.tsx": undefined,
		});
		expect(done.body.undo).toMatchObject({ kind: "frame", target: "cart", to: before });
		const undone = await restore(ben.daemon, done.body.undo ?? {});
		expect(undone.status).toBe(200);
		await everywhere([ana.root, ben.root], team, {
			"frames/cart/frame.tsx": "second\n",
			"frames/cart/extra.tsx": "new\n",
		});
		// each a restore of its own in the history
		const restores = cloud.history("checkout").flatMap((row) => (row.restore === null ? [] : [row.restore.id]));
		expect(new Set(restores)).toEqual(new Set([done.body.id, undone.body.id]));
	});

	it("puts back a set-aside save as a file restore to it", async () => {
		const { cloud, ana, ben, team } = await twoEditors();
		writeFrame(ana.root, "cart", "first\n");
		await everywhere([ben.root], team, { "frames/cart/frame.tsx": "first\n" });
		const back = cloud.offline("ben");
		writeFrame(ben.root, "cart", "ben's\n");
		writeFrame(ana.root, "cart", "ana's\n");
		await until(() => team("frames/cart/frame.tsx") === "ana's\n");
		back();
		await everywhere([ben.root], team, { "frames/cart/frame.tsx": "ana's\n" });
		const aside = cloud.history("checkout").find((row) => row.outcome === "set_aside");
		const done = await restore(ben.daemon, { kind: "file", target: "frames/cart/frame.tsx", to: aside?.version });
		await everywhere([ana.root, ben.root], team, { "frames/cart/frame.tsx": "ben's\n" });
		// its undo puts back what stood over the set-aside save, not the set-aside save again
		expect(done.body.undo?.to).toBe((aside?.version ?? 0) - 1);
		expect((await restore(ben.daemon, done.body.undo ?? {})).body.applied).toEqual(["frames/cart/frame.tsx"]);
		await everywhere([ana.root, ben.root], team, { "frames/cart/frame.tsx": "ana's\n" });
	});

	it("sets a restore's save aside when a teammate's save lands first, like any collision", async () => {
		const { cloud, ana, ben, head, team } = await twoEditors();
		writeFrame(ana.root, "cart", "first\n");
		await everywhere([ben.root], team, { "frames/cart/frame.tsx": "first\n" });
		const then = head();
		writeFrame(ana.root, "cart", "second\n");
		await everywhere([ben.root], team, { "frames/cart/frame.tsx": "second\n" });

		cloud.landFirst("checkout", "ana", "frames/cart/frame.tsx", "ana's third\n");
		const done = await restore(ben.daemon, { kind: "frame", target: "cart", to: then });
		expect(done.body.setAside).toEqual(["frames/cart/frame.tsx"]);
		await everywhere([ana.root, ben.root], team, { "frames/cart/frame.tsx": "ana's third\n" });
		const marks = (await (await ben.daemon.request("/api/p/checkout/set-aside")).json()) as {
			marks: { path: string }[];
		};
		expect(marks.marks.map((mark) => mark.path)).toEqual(["frames/cart/frame.tsx"]);
	});
});
