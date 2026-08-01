import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	COVER_PNG,
	makeApp,
	makeProject,
	makeTempDir,
	writeDesignFile,
	writeFrame,
	writePageFrame,
} from "../test-helpers";

/**
 * The explorer's file operations and its order store (#228).
 *
 * Every verb here moves or copies a folder and never frame source. The two
 * things these hold the daemon to are the ones a folder move can quietly break:
 * a bare frame name is identity across the whole project, so a landing name
 * that is claimed anywhere is refused rather than guessed at; and the stores
 * keyed by that name — a frame's covers, a terminal's persisted screen, a
 * page's camera and its place in the rail — follow the name when it changes.
 */

const label = (text: string) => `export default function F() {\n\treturn <p>${text}</p>;\n}\n`;
const termTsx = "export default function T() {\n\treturn null;\n}\n";

function jsonPost(body: unknown): RequestInit {
	return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function jsonPut(body: unknown): RequestInit {
	return { ...jsonPost(body), method: "PUT" };
}

function explorerProject() {
	const spoolDir = join(makeTempDir(), ".spool");
	return { spoolDir, ...makeProject(spoolDir) };
}

const designFile = (root: string, ...parts: string[]) => join(root, "design", ...parts);
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

/** A real cover through the real store, so a rename has an address to carry. */
async function putCover(app: ReturnType<typeof makeApp>, name: string, frame: string): Promise<string> {
	const body = new FormData();
	body.append("cover", new Blob([COVER_PNG]));
	const res = await app.request(`/api/p/${name}/thumbs/${frame}`, { method: "PUT", body });
	return ((await res.json()) as { hash: string }).hash;
}

describe("renaming a frame", () => {
	it("moves the folder inside its page and carries the stores keyed by the name", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writeDesignFile(root, "frames/shop/checkout/frame.json", '{ "x": 10, "y": 20, "w": 390, "h": 844 }\n');
		const app = makeApp(spoolDir);
		const hash = await putCover(app, name, "checkout");

		const res = await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "checkout", to: "basket" }));

		expect(res.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "shop", "checkout"))).toBe(false);
		expect(readFileSync(designFile(root, "frames", "shop", "basket", "frame.tsx"), "utf8")).toBe(label("checkout"));
		// the sidecar rides in the folder, so the frame keeps its place
		expect(readJson(designFile(root, "frames", "shop", "basket", "frame.json"))).toEqual({
			x: 10,
			y: 20,
			w: 390,
			h: 844,
		});
		// the cover store is keyed by the bare name: the picture follows it
		expect(existsSync(designFile(root, ".spool", "thumbs", "checkout"))).toBe(false);
		expect(existsSync(designFile(root, ".spool", "thumbs", "basket", `${hash}.png`))).toBe(true);
		expect((await app.request(`/covers/${name}/basket/${hash}`)).status).toBe(200);

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; page?: string; cover?: { hash: string } }[];
		};
		expect(frames).toMatchObject([{ name: "basket", page: "shop", cover: { hash } }]);
	});

	it("carries a terminal frame's persisted screen", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeDesignFile(root, "frames/console/term.tsx", termTsx);
		writeDesignFile(root, ".spool/term/console.screen", "the last grid\n");
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "console", to: "shell" }));

		expect(res.status).toBe(204);
		expect(existsSync(designFile(root, ".spool", "term", "console.screen"))).toBe(false);
		expect(readFileSync(designFile(root, ".spool", "term", "shell.screen"), "utf8")).toBe("the last grid\n");
	});

	it("refuses a name claimed anywhere in the project, on any page", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writePageFrame(root, "admin", "users", label("users"));
		const app = makeApp(spoolDir);

		// bare names are identity project-wide: another page's frame still claims one
		const taken = await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "home", to: "checkout" }));
		expect(taken.status).toBe(409);
		expect(await taken.text()).toContain("identity");
		expect(existsSync(designFile(root, "frames", "home", "frame.tsx"))).toBe(true);

		// a page folder holding the name is a collision on disk just the same
		const page = await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "home", to: "shop" }));
		expect(page.status).toBe(409);
		expect(existsSync(designFile(root, "frames", "home", "frame.tsx"))).toBe(true);

		// and a page holds its name against a frame that lives inside another page,
		// where the landing folder collides with nothing on disk at all
		const inside = await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "checkout", to: "admin" }));
		expect(inside.status).toBe(409);
		expect(existsSync(designFile(root, "frames", "shop", "checkout", "frame.tsx"))).toBe(true);
		expect(existsSync(designFile(root, "frames", "shop", "admin"))).toBe(false);
	});

	it("404s a frame nothing claims, and 400s names that are not names", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "ghost", to: "home2" }))).status).toBe(
			404,
		);
		expect(
			(await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "home", to: "../escape" }))).status,
		).toBe(400);
		expect(
			(await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "home", to: ".hidden" }))).status,
		).toBe(400);
		expect((await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "home", to: "" }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/frames/rename`, jsonPost(null))).status).toBe(400);
		expect(existsSync(designFile(root, "frames", "home", "frame.tsx"))).toBe(true);
	});

	it("takes a rename to the name it already has as already answered", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "home", to: "home" }));

		expect(res.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "home", "frame.tsx"))).toBe(true);
	});
});

describe("renaming a page", () => {
	it("moves the folder and carries the state and order keyed by the page name", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);
		await app.request(
			`/api/p/${name}/state`,
			jsonPut({ activePage: "shop", pageCameras: { shop: { x: 10, y: 20, k: 0.5 } }, camera: { x: 0, y: 0, k: 1 } }),
		);
		await app.request(`/api/p/${name}/order`, jsonPut({ pages: ["shop"], frames: { shop: ["checkout"] } }));

		const res = await app.request(`/api/p/${name}/pages/rename`, jsonPost({ from: "shop", to: "store" }));

		expect(res.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "shop"))).toBe(false);
		expect(existsSync(designFile(root, "frames", "store", "checkout", "frame.tsx"))).toBe(true);
		// the frame's identity is its leaf name, so the page move never touched it
		const { frames, pages } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; page?: string }[];
			pages: string[];
		};
		expect(pages).toEqual(["store"]);
		expect(frames).toMatchObject([{ name: "checkout", page: "store" }]);

		expect(await (await app.request(`/api/p/${name}/state`)).json()).toEqual({
			camera: { x: 0, y: 0, k: 1 },
			activePage: "store",
			pageCameras: { store: { x: 10, y: 20, k: 0.5 } },
		});
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({
			pages: ["store"],
			frames: { store: ["checkout"] },
		});
	});

	it("404s a page nothing claims and 409s a name design/frames/ already holds", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writePageFrame(root, "admin", "users", label("users"));
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/pages/rename`, jsonPost({ from: "ghost", to: "gone" }))).status).toBe(
			404,
		);
		expect((await app.request(`/api/p/${name}/pages/rename`, jsonPost({ from: "shop", to: "admin" }))).status).toBe(
			409,
		);
		expect((await app.request(`/api/p/${name}/pages/rename`, jsonPost({ from: "shop", to: "home" }))).status).toBe(
			409,
		);
		expect(
			(await app.request(`/api/p/${name}/pages/rename`, jsonPost({ from: "shop", to: "../escape" }))).status,
		).toBe(400);
		expect(existsSync(designFile(root, "frames", "shop", "checkout", "frame.tsx"))).toBe(true);
	});
});

describe("moving frames between pages", () => {
	it("moves folders onto a page and back to the root, keeping every name-keyed store", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writeFrame(root, "detail", label("detail"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);
		const hash = await putCover(app, name, "home");

		const onto = await app.request(
			`/api/p/${name}/frames/move`,
			jsonPost({ frames: ["home", "detail"], page: "shop" }),
		);

		expect(onto.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "shop", "home", "frame.tsx"))).toBe(true);
		expect(existsSync(designFile(root, "frames", "shop", "detail", "frame.tsx"))).toBe(true);
		expect(existsSync(designFile(root, "frames", "home"))).toBe(false);
		// name is identity, so the cover keyed by it never moved and still answers
		expect((await app.request(`/covers/${name}/home/${hash}`)).status).toBe(200);

		// "" is the root page, the same spelling the order store uses
		const back = await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["checkout"], page: "" }));

		expect(back.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "checkout", "frame.tsx"))).toBe(true);
		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; page?: string }[];
		};
		expect(frames).toMatchObject([
			{ name: "checkout" },
			{ name: "detail", page: "shop" },
			{ name: "home", page: "shop" },
		]);
	});

	it("takes a frame already on the page as arrived", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["checkout"], page: "shop" }));

		expect(res.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "shop", "checkout", "frame.tsx"))).toBe(true);
	});

	it("resolves every frame before the first move, and refuses an unknown page", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const ghost = await app.request(
			`/api/p/${name}/frames/move`,
			jsonPost({ frames: ["home", "ghost"], page: "shop" }),
		);
		expect(ghost.status).toBe(404);
		// all-or-nothing: the frame that did resolve was not moved either
		expect(existsSync(designFile(root, "frames", "home", "frame.tsx"))).toBe(true);

		expect(
			(await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["home"], page: "ghost" }))).status,
		).toBe(404);
		expect(
			(await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["home"], page: "../escape" }))).status,
		).toBe(400);
		expect((await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: [], page: "shop" }))).status).toBe(
			400,
		);
		expect((await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["home"] }))).status).toBe(400);
		expect(existsSync(designFile(root, "frames", "home", "frame.tsx"))).toBe(true);
	});
});

describe("duplicating frames", () => {
	it("copies the folder with its sidecar under a name nothing claims", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writeDesignFile(root, "frames/home/frame.json", '{ "x": 40, "y": 60, "w": 390, "h": 844 }\n');
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["home"] }));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ frames: [{ from: "home", to: "home-copy" }] });
		expect(readFileSync(designFile(root, "frames", "home-copy", "frame.tsx"), "utf8")).toBe(label("home"));
		// sidecars ride along, so a copy lands where its original sits
		expect(readJson(designFile(root, "frames", "home-copy", "frame.json"))).toEqual({
			x: 40,
			y: 60,
			w: 390,
			h: 844,
		});
		expect(readFileSync(designFile(root, "frames", "home", "frame.tsx"), "utf8")).toBe(label("home"));
	});

	it("numbers a copy past every name the projection already holds", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writeFrame(root, "home-copy", label("an earlier copy"));
		// the taken name may be on another page: identity is project-wide
		writePageFrame(root, "shop", "home-copy-2", label("another"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["home"] }));

		expect(await res.json()).toEqual({ frames: [{ from: "home", to: "home-copy-3" }] });
		expect(existsSync(designFile(root, "frames", "home-copy-3", "frame.tsx"))).toBe(true);
	});

	it("mints a distinct name per copy in one request, and lands them on a named page", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writeFrame(root, "detail", label("detail"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const res = await app.request(
			`/api/p/${name}/frames/duplicate`,
			jsonPost({ frames: ["home", "detail", "checkout"], page: "shop" }),
		);

		expect(await res.json()).toEqual({
			frames: [
				{ from: "home", to: "home-copy", page: "shop" },
				{ from: "detail", to: "detail-copy", page: "shop" },
				{ from: "checkout", to: "checkout-copy", page: "shop" },
			],
		});
		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; page?: string }[];
		};
		expect(frames.filter((frame) => frame.page === "shop").map((frame) => frame.name)).toEqual([
			"checkout",
			"checkout-copy",
			"detail-copy",
			"home-copy",
		]);
	});

	it("keeps a copy on its original's own page when no page is asked for", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["checkout"] }));

		expect(await res.json()).toEqual({ frames: [{ from: "checkout", to: "checkout-copy", page: "shop" }] });
		expect(existsSync(designFile(root, "frames", "shop", "checkout-copy", "frame.tsx"))).toBe(true);
	});

	it("never mints a name a page already answers to", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writePageFrame(root, "checkout-copy", "users", label("users"));
		const app = makeApp(spoolDir);

		// the copy lands inside shop, so nothing on disk stands where it would go —
		// only the page list says the first spelling is already answered to
		const res = await app.request(`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["checkout"] }));

		expect(await res.json()).toEqual({ frames: [{ from: "checkout", to: "checkout-copy-2", page: "shop" }] });
		expect(existsSync(designFile(root, "frames", "shop", "checkout-copy-2", "frame.tsx"))).toBe(true);
		expect(existsSync(designFile(root, "frames", "shop", "checkout-copy"))).toBe(false);
	});

	it("resolves every source before the first copy", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["home", "ghost"] }));

		expect(res.status).toBe(404);
		expect(existsSync(designFile(root, "frames", "home-copy"))).toBe(false);
		expect(
			(await app.request(`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["home"], page: "ghost" }))).status,
		).toBe(404);
		expect((await app.request(`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["../escape"] }))).status).toBe(
			400,
		);
	});
});

describe("duplicating a page", () => {
	it("copies the folder and renames every child, because two claimants is a collision", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writePageFrame(root, "shop", "cart", label("cart"));
		writeDesignFile(root, "frames/shop/cart/frame.json", '{ "x": 1, "y": 2, "w": 390, "h": 844 }\n');
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/pages/duplicate`, jsonPost({ name: "shop" }));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			page: "shop-copy",
			frames: [
				{ from: "cart", to: "cart-copy", page: "shop-copy" },
				{ from: "checkout", to: "checkout-copy", page: "shop-copy" },
			],
		});
		expect(readJson(designFile(root, "frames", "shop-copy", "cart-copy", "frame.json"))).toEqual({
			x: 1,
			y: 2,
			w: 390,
			h: 844,
		});
		const projection = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			pages: string[];
			frames: { name: string; page?: string }[];
			collisions: unknown[];
		};
		expect(projection.pages).toEqual(["shop", "shop-copy"]);
		expect(projection.collisions).toEqual([]);
		expect(projection.frames.map((frame) => frame.name)).toEqual(["cart", "cart-copy", "checkout", "checkout-copy"]);
	});

	it("never mints a child name a page already answers to", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "cart", label("cart"));
		writePageFrame(root, "cart-copy", "users", label("users"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/pages/duplicate`, jsonPost({ name: "shop" }));

		expect(await res.json()).toEqual({
			page: "shop-copy",
			frames: [{ from: "cart", to: "cart-copy-2", page: "shop-copy" }],
		});
		expect(existsSync(designFile(root, "frames", "shop-copy", "cart-copy-2", "frame.tsx"))).toBe(true);
	});

	it("copies an empty page, and 404s a page nothing claims", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeDesignFile(root, "frames/admin/.keep", "");
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/pages/duplicate`, jsonPost({ name: "admin" }));

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ page: "admin-copy", frames: [] });
		expect(existsSync(designFile(root, "frames", "admin-copy"))).toBe(true);
		expect((await app.request(`/api/p/${name}/pages/duplicate`, jsonPost({ name: "ghost" }))).status).toBe(404);
		expect((await app.request(`/api/p/${name}/pages/duplicate`, jsonPost({ name: "../escape" }))).status).toBe(400);
	});
});

describe("creating a page", () => {
	it("makes the folder, which is already a page", async () => {
		const { spoolDir, root, name } = explorerProject();
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "admin" }));

		expect(res.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "admin"))).toBe(true);
		const { pages } = (await (await app.request(`/api/p/${name}/frames`)).json()) as { pages: string[] };
		expect(pages).toEqual(["admin"]);
	});

	it("409s a name design/frames/ already holds, and 400s one that is not a name", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "shop" }))).status).toBe(409);
		expect((await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "home" }))).status).toBe(409);
		expect((await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "../escape" }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: ".spool" }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/pages/create`, jsonPost(null))).status).toBe(400);
	});
});

describe("trashing a page", () => {
	it("moves the whole folder through the OS Trash seam and drops the page's state and order", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const trashed: string[] = [];
		const app = makeApp(spoolDir, { moveToTrash: async (paths) => void trashed.push(...paths) });
		await app.request(
			`/api/p/${name}/state`,
			jsonPut({ activePage: "shop", pageCameras: { shop: { x: 1, y: 2, k: 1 }, admin: { x: 3, y: 4, k: 1 } } }),
		);
		await app.request(
			`/api/p/${name}/order`,
			jsonPut({ pages: ["shop", "admin"], frames: { "": ["home"], shop: ["checkout"] } }),
		);

		const res = await app.request(`/api/p/${name}/trash`, jsonPost({ pages: ["shop"] }));

		expect(res.status).toBe(204);
		expect(trashed).toEqual([designFile(root, "frames", "shop")]);
		// the canvas cannot stay on a page that is gone; the root page is permanent
		expect(await (await app.request(`/api/p/${name}/state`)).json()).toEqual({
			pageCameras: { admin: { x: 3, y: 4, k: 1 } },
		});
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({
			pages: ["admin"],
			frames: { "": ["home"] },
		});
	});

	it("takes a page and a frame inside it as one move", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const trashed: string[] = [];
		const app = makeApp(spoolDir, { moveToTrash: async (paths) => void trashed.push(...paths) });

		const res = await app.request(
			`/api/p/${name}/trash`,
			jsonPost({ pages: ["shop"], frames: ["checkout", "home"] }),
		);

		expect(res.status).toBe(204);
		// checkout rides along inside its page's folder rather than being named twice
		expect(trashed).toEqual([designFile(root, "frames", "shop"), designFile(root, "frames", "home")]);
	});

	it("refuses an unknown page and an empty request without touching the trash", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const moveToTrash = vi.fn(async () => {});
		const app = makeApp(spoolDir, { moveToTrash });

		expect((await app.request(`/api/p/${name}/trash`, jsonPost({ pages: ["ghost"] }))).status).toBe(404);
		expect((await app.request(`/api/p/${name}/trash`, jsonPost({ pages: ["../escape"] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/trash`, jsonPost({ pages: [], frames: [] }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/trash`, jsonPost({ pages: ["shop"], frames: ["ghost"] }))).status).toBe(
			404,
		);
		expect(moveToTrash).not.toHaveBeenCalled();
		expect(existsSync(designFile(root, "frames", "shop", "checkout", "frame.tsx"))).toBe(true);
	});
});

describe("the order store", () => {
	it("round-trips through canvas.json, keeping the format stamp and every other field", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeDesignFile(root, "canvas.json", `${JSON.stringify({ format: 1, somethingElse: { kept: true } })}\n`);
		writeFrame(root, "home", label("home"));
		const app = makeApp(spoolDir);

		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({});

		const order = { pages: ["shop"], frames: { "": ["home", "detail"], shop: ["checkout"] } };
		const put = await app.request(`/api/p/${name}/order`, jsonPut(order));

		expect(put.status).toBe(204);
		expect(readJson(designFile(root, "canvas.json"))).toEqual({ format: 1, somethingElse: { kept: true }, order });
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual(order);

		// canvas.json is on disk, so the arrangement outlives the daemon that took it
		const restarted = makeApp(spoolDir);
		expect(await (await restarted.request(`/api/p/${name}/order`)).json()).toEqual(order);
	});

	it("stores names the projection does not have, because order is advisory", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		const app = makeApp(spoolDir);

		// a name can be stale or can name a frame an agent has not written yet:
		// the client merges against the projection and nothing here cleans it
		const order = { pages: ["ghost-page"], frames: { "": ["gone", "home"] } };
		expect((await app.request(`/api/p/${name}/order`, jsonPut(order))).status).toBe(204);
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual(order);

		// and a read never rewrites the file to agree with the canvas
		expect(readJson(designFile(root, "canvas.json"))).toMatchObject({ order });
	});

	it("takes an order of nothing back out of the file rather than storing an empty one", async () => {
		const { spoolDir, root, name } = explorerProject();
		const app = makeApp(spoolDir);
		await app.request(`/api/p/${name}/order`, jsonPut({ pages: ["shop"] }));

		expect((await app.request(`/api/p/${name}/order`, jsonPut({}))).status).toBe(204);

		expect(readJson(designFile(root, "canvas.json"))).toEqual({ format: 1 });
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({});
	});

	it("rejects a name that is not one, and a shape that is not an order", async () => {
		const { spoolDir, name } = explorerProject();
		const app = makeApp(spoolDir);
		const put = (body: unknown) => app.request(`/api/p/${name}/order`, jsonPut(body));

		expect((await put({ pages: ["../escape"] })).status).toBe(400);
		expect((await put({ pages: [".hidden"] })).status).toBe(400);
		// "" is the root page's slot in frames, never a page of its own in the list
		expect((await put({ pages: [""] })).status).toBe(400);
		expect((await put({ frames: { "../escape": ["home"] } })).status).toBe(400);
		expect((await put({ frames: { shop: ["../escape"] } })).status).toBe(400);
		expect((await put({ frames: ["home"] })).status).toBe(400);
		expect((await put({ pages: "shop" })).status).toBe(400);
		expect((await put(null)).status).toBe(400);

		expect((await put({ frames: { "": ["home"] } })).status).toBe(204);
	});

	it("keeps a stale name a page rename does not touch", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);
		await app.request(`/api/p/${name}/order`, jsonPut({ frames: { shop: ["checkout", "gone"] } }));

		await app.request(`/api/p/${name}/pages/rename`, jsonPost({ from: "shop", to: "store" }));

		// the slot follows the page; what is inside it is left exactly as stored
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({
			frames: { store: ["checkout", "gone"] },
		});
	});

	it("refuses to overwrite a canvas.json it cannot read", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeDesignFile(root, "canvas.json", "{ not json\n");
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/order`, jsonPut({ pages: ["shop"] }));

		expect(res.status).toBe(500);
		expect(await res.text()).toContain("canvas.json");
		expect(readFileSync(designFile(root, "canvas.json"), "utf8")).toBe("{ not json\n");
		// and a read of one treats it as nothing stored rather than failing
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({});
	});
});

describe("the explorer's door", () => {
	it("keeps every verb behind the control token, like the writes it sits beside", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir, { moveToTrash: async () => {} });
		const verbs: [string, RequestInit][] = [
			[`/api/p/${name}/frames/rename`, jsonPost({ from: "home", to: "away" })],
			[`/api/p/${name}/pages/rename`, jsonPost({ from: "shop", to: "store" })],
			[`/api/p/${name}/frames/move`, jsonPost({ frames: ["home"], page: "shop" })],
			[`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["home"] })],
			[`/api/p/${name}/pages/duplicate`, jsonPost({ name: "shop" })],
			[`/api/p/${name}/pages/create`, jsonPost({ name: "admin" })],
			[`/api/p/${name}/trash`, jsonPost({ pages: ["shop"] })],
			[`/api/p/${name}/order`, jsonPut({ pages: ["shop"] })],
			[`/api/p/${name}/order`, { method: "GET" }],
		];

		for (const [path, init] of verbs) {
			// the raw door, with no capability on it (#41)
			expect((await app.fetch(path, init)).status).toBe(401);
		}

		// nothing moved, nothing was minted, nothing was stored
		expect(existsSync(designFile(root, "frames", "home", "frame.tsx"))).toBe(true);
		expect(existsSync(designFile(root, "frames", "shop", "checkout", "frame.tsx"))).toBe(true);
		expect(existsSync(designFile(root, "frames", "admin"))).toBe(false);
		expect(readJson(designFile(root, "canvas.json"))).toEqual({ format: 1 });
	});
});
