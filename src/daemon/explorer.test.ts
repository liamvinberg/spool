import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FORMAT_VERSION } from "../templates";
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
 * Every verb here moves or copies a folder. A frame is named by its path under
 * frames/ (#336), so a name only has to be free among the folders beside it,
 * and the disk is the whole of what refuses one. What a folder move could
 * quietly break is everything keyed by a name that changed: a frame's covers,
 * a page's camera and its place in the rail, and every walk into a moved frame,
 * which is written again at its new name. The one other write is the re-aim of
 * `../` imports whose targets stayed put (#273, `import-aim.test.ts` holds its
 * rules). A copy changes no name, so it rewrites no walk.
 */

const label = (text: string) => `export default function F() {\n\treturn <p>${text}</p>;\n}\n`;

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
	const res = await app.request(`/api/p/${name}/thumbs/${encodeURIComponent(frame)}`, { method: "PUT", body });
	return ((await res.json()) as { hash: string }).hash;
}

describe("renaming a frame", () => {
	it("moves the folder inside its page and carries the stores keyed by the name", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writeDesignFile(root, "frames/shop/checkout/frame.json", '{ "x": 10, "y": 20, "w": 390, "h": 844 }\n');
		const app = makeApp(spoolDir);
		const hash = await putCover(app, name, "shop/checkout");

		const res = await app.request(
			`/api/p/${name}/frames/rename`,
			jsonPost({ from: "shop/checkout", to: "shop/basket" }),
		);

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
		// the cover store is keyed by the name, one segment per frame: the picture follows it
		expect(existsSync(designFile(root, ".spool", "thumbs", "shop%2Fcheckout"))).toBe(false);
		expect(existsSync(designFile(root, ".spool", "thumbs", "shop%2Fbasket", `${hash}.png`))).toBe(true);
		expect((await app.request(`/covers/${name}/shop%2Fbasket/${hash}`)).status).toBe(200);

		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; page?: string; cover?: { hash: string } }[];
		};
		expect(frames).toMatchObject([{ name: "shop/basket", page: "shop", cover: { hash } }]);
	});

	it("refuses only a name the folders beside it already hold", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writePageFrame(root, "shop", "cart", label("cart"));
		const app = makeApp(spoolDir);

		// a frame beside it holds the name
		const taken = await app.request(
			`/api/p/${name}/frames/rename`,
			jsonPost({ from: "shop/checkout", to: "shop/cart" }),
		);
		expect(taken.status).toBe(409);
		expect(await taken.text()).toBe('design/frames/shop/ already holds a folder named "cart"');
		expect(existsSync(designFile(root, "frames", "shop", "checkout", "frame.tsx"))).toBe(true);

		// a page folder beside it holds the name just the same
		const page = await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "home", to: "shop" }));
		expect(page.status).toBe(409);
		expect(existsSync(designFile(root, "frames", "home", "frame.tsx"))).toBe(true);

		// the same leaf on another page is another name, so it is free
		const elsewhere = await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "home", to: "checkout" }));
		expect(elsewhere.status).toBe(204);
		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as { frames: { name: string }[] };
		expect(frames.map((frame) => frame.name)).toEqual(["checkout", "shop/cart", "shop/checkout"]);
	});

	it("refuses a rename that would change the page holding the frame", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writePageFrame(root, "admin", "users", label("users"));
		const app = makeApp(spoolDir);

		const across = await app.request(
			`/api/p/${name}/frames/rename`,
			jsonPost({ from: "shop/checkout", to: "admin/checkout" }),
		);
		expect(across.status).toBe(400);
		expect(await across.text()).toContain("a rename keeps a frame on its page");
		const out = await app.request(
			`/api/p/${name}/frames/rename`,
			jsonPost({ from: "shop/checkout", to: "checkout" }),
		);
		expect(out.status).toBe(400);
		expect(existsSync(designFile(root, "frames", "shop", "checkout", "frame.tsx"))).toBe(true);
		expect(existsSync(designFile(root, "frames", "admin", "checkout"))).toBe(false);
	});

	it("404s a frame nothing claims, and 400s names that are not names", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		// a folder inside a frame is the frame's own business, never a frame
		writeDesignFile(root, "frames/home/inner/frame.tsx", label("inner"));
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
		expect((await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "home", to: "a\\b" }))).status).toBe(
			400,
		);
		expect(
			(await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "shop//home", to: "shop//away" }))).status,
		).toBe(400);
		// a frame is never a page, so nothing inside one is a frame
		expect(
			(await app.request(`/api/p/${name}/frames/rename`, jsonPost({ from: "home/inner", to: "home/outer" }))).status,
		).toBe(404);
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
		// a frame is named by its path, so every frame inside the page changed name with it
		const { frames, pages } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; page?: string }[];
			pages: string[];
		};
		expect(pages).toEqual(["store"]);
		expect(frames).toMatchObject([{ name: "store/checkout", page: "store" }]);

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
	it("moves folders onto a page and back to the root, carrying every name-keyed store", async () => {
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
		// the move changed the frame's name, and its cover followed it there
		expect(existsSync(designFile(root, ".spool", "thumbs", "home"))).toBe(false);
		expect((await app.request(`/covers/${name}/shop%2Fhome/${hash}`)).status).toBe(200);

		// "" is the root page, the same spelling the order store uses
		const back = await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["shop/checkout"], page: "" }));

		expect(back.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "checkout", "frame.tsx"))).toBe(true);
		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; page?: string }[];
		};
		expect(frames).toMatchObject([
			{ name: "checkout" },
			{ name: "shop/detail", page: "shop" },
			{ name: "shop/home", page: "shop" },
		]);
	});

	it("refuses a landing the page already holds, and two frames landing on one name", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "checkout", label("root checkout"));
		writePageFrame(root, "shop", "checkout", label("shop checkout"));
		writePageFrame(root, "admin", "cart", label("admin cart"));
		writePageFrame(root, "store", "cart", label("store cart"));
		const app = makeApp(spoolDir);

		const taken = await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["checkout"], page: "shop" }));
		expect(taken.status).toBe(409);
		expect(existsSync(designFile(root, "frames", "checkout", "frame.tsx"))).toBe(true);

		const twice = await app.request(
			`/api/p/${name}/frames/move`,
			jsonPost({ frames: ["admin/cart", "store/cart"], page: "" }),
		);
		expect(twice.status).toBe(409);
		// all-or-nothing: neither of them moved
		expect(existsSync(designFile(root, "frames", "admin", "cart", "frame.tsx"))).toBe(true);
		expect(existsSync(designFile(root, "frames", "store", "cart", "frame.tsx"))).toBe(true);
		expect(existsSync(designFile(root, "frames", "cart"))).toBe(false);
	});

	it("re-aims a ../ import at shared/ as the folder changes depth (#273)", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(
			root,
			"dashboard",
			'import { cn } from "../../shared/lib/utils";\nexport default () => <p className={cn("x")} />;\n',
		);
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["dashboard"], page: "shop" }));

		expect(res.status).toBe(204);
		const moved = readFileSync(designFile(root, "frames", "shop", "dashboard", "frame.tsx"), "utf8");
		// the healed form counts no folders, so no later move can break it again
		expect(moved).toContain('from "shared/lib/utils"');
		expect(moved).not.toContain("../");
	});

	it("takes a frame already on the page as arrived", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const res = await app.request(
			`/api/p/${name}/frames/move`,
			jsonPost({ frames: ["shop/checkout"], page: "shop" }),
		);

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

	it("numbers a copy past the names beside it, never those on another page", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writeFrame(root, "home-copy", label("an earlier copy"));
		// a name only has to be free where the copy lands
		writePageFrame(root, "shop", "home-copy-2", label("another"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["home"] }));

		expect(await res.json()).toEqual({ frames: [{ from: "home", to: "home-copy-2" }] });
		expect(existsSync(designFile(root, "frames", "home-copy-2", "frame.tsx"))).toBe(true);
	});

	it("mints a distinct name per copy in one request, and lands them on a named page", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", label("home"));
		writeFrame(root, "detail", label("detail"));
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writePageFrame(root, "admin", "home", label("admin home"));
		const app = makeApp(spoolDir);

		const res = await app.request(
			`/api/p/${name}/frames/duplicate`,
			jsonPost({ frames: ["home", "detail", "shop/checkout", "admin/home"], page: "shop" }),
		);

		// two copies of a "home" land on one page, so the second is numbered past the first
		expect(await res.json()).toEqual({
			frames: [
				{ from: "home", to: "shop/home-copy", page: "shop" },
				{ from: "detail", to: "shop/detail-copy", page: "shop" },
				{ from: "shop/checkout", to: "shop/checkout-copy", page: "shop" },
				{ from: "admin/home", to: "shop/home-copy-2", page: "shop" },
			],
		});
		const { frames } = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			frames: { name: string; page?: string }[];
		};
		expect(frames.filter((frame) => frame.page === "shop").map((frame) => frame.name)).toEqual([
			"shop/checkout",
			"shop/checkout-copy",
			"shop/detail-copy",
			"shop/home-copy",
			"shop/home-copy-2",
		]);
	});

	it("keeps a copy on its original's own page when no page is asked for", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["shop/checkout"] }));

		expect(await res.json()).toEqual({
			frames: [{ from: "shop/checkout", to: "shop/checkout-copy", page: "shop" }],
		});
		expect(existsSync(designFile(root, "frames", "shop", "checkout-copy", "frame.tsx"))).toBe(true);
	});

	it("never mints a name a page folder beside it holds, and ignores pages elsewhere", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "shop", "checkout", label("checkout"));
		writePageFrame(root, "shop/checkout-copy", "users", label("users"));
		writePageFrame(root, "checkout-copy-2", "users", label("users"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/duplicate`, jsonPost({ frames: ["shop/checkout"] }));

		expect(await res.json()).toEqual({
			frames: [{ from: "shop/checkout", to: "shop/checkout-copy-2", page: "shop" }],
		});
		expect(existsSync(designFile(root, "frames", "shop", "checkout-copy-2", "frame.tsx"))).toBe(true);
	});

	it("rewrites no walk, because the frame it copied still answers to its name", async () => {
		const { spoolDir, root, name } = explorerProject();
		const home = 'export default () => <a data-go="shop/checkout">buy</a>;\n';
		const checkout = 'export default () => <a data-go="shop/checkout">again</a>;\n';
		writeFrame(root, "home", home);
		writePageFrame(root, "shop", "checkout", checkout);
		const app = makeApp(spoolDir);

		const res = await app.request(
			`/api/p/${name}/frames/duplicate`,
			jsonPost({ frames: ["shop/checkout"], page: "" }),
		);

		expect(await res.json()).toEqual({ frames: [{ from: "shop/checkout", to: "checkout-copy" }] });
		expect(readFileSync(designFile(root, "frames", "home", "frame.tsx"), "utf8")).toBe(home);
		// the copy walks where its original walked: back to the original
		expect(readFileSync(designFile(root, "frames", "checkout-copy", "frame.tsx"), "utf8")).toBe(checkout);
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
	it("copies the folder, every frame inside keeping its own name on the new page", async () => {
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
				{ from: "shop/cart", to: "shop-copy/cart", page: "shop-copy" },
				{ from: "shop/checkout", to: "shop-copy/checkout", page: "shop-copy" },
			],
		});
		expect(readJson(designFile(root, "frames", "shop-copy", "cart", "frame.json"))).toEqual({
			x: 1,
			y: 2,
			w: 390,
			h: 844,
		});
		const projection = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			pages: string[];
			frames: { name: string; page?: string }[];
		};
		expect(projection.pages).toEqual(["shop", "shop-copy"]);
		expect(projection.frames.map((frame) => frame.name).sort()).toEqual(
			["shop-copy/cart", "shop-copy/checkout", "shop/cart", "shop/checkout"].sort(),
		);
	});

	it("keeps a child's name even where another page holds the same one", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "cart", label("root cart"));
		writePageFrame(root, "shop", "cart", label("cart"));
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/pages/duplicate`, jsonPost({ name: "shop" }));

		expect(await res.json()).toEqual({
			page: "shop-copy",
			frames: [{ from: "shop/cart", to: "shop-copy/cart", page: "shop-copy" }],
		});
		expect(existsSync(designFile(root, "frames", "shop-copy", "cart", "frame.tsx"))).toBe(true);
	});

	it("leaves every walk where it pointed, the copy's own included", async () => {
		const { spoolDir, root, name } = explorerProject();
		const cart = 'export default () => <a data-go="shop/checkout">pay</a>;\n';
		writePageFrame(root, "shop", "cart", cart);
		writePageFrame(root, "shop", "checkout", label("checkout"));
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/pages/duplicate`, jsonPost({ name: "shop" }))).status).toBe(200);

		expect(readFileSync(designFile(root, "frames", "shop", "cart", "frame.tsx"), "utf8")).toBe(cart);
		expect(readFileSync(designFile(root, "frames", "shop-copy", "cart", "frame.tsx"), "utf8")).toBe(cart);
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
			jsonPost({ pages: ["shop"], frames: ["shop/checkout", "home"] }),
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
		// the leaf alone names no frame on a page
		expect(
			(await app.request(`/api/p/${name}/trash`, jsonPost({ pages: ["shop"], frames: ["checkout"] }))).status,
		).toBe(404);
		expect(moveToTrash).not.toHaveBeenCalled();
		expect(existsSync(designFile(root, "frames", "shop", "checkout", "frame.tsx"))).toBe(true);
	});
});

describe("the order store", () => {
	it("round-trips through canvas.json, keeping the format stamp and every other field", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeDesignFile(
			root,
			"canvas.json",
			`${JSON.stringify({ format: FORMAT_VERSION, somethingElse: { kept: true } })}\n`,
		);
		writeFrame(root, "home", label("home"));
		const app = makeApp(spoolDir);

		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({});

		const order = { pages: ["shop"], frames: { "": ["home", "detail"], shop: ["checkout"] } };
		const put = await app.request(`/api/p/${name}/order`, jsonPut(order));

		expect(put.status).toBe(204);
		expect(readJson(designFile(root, "canvas.json"))).toEqual({
			format: FORMAT_VERSION,
			somethingElse: { kept: true },
			order,
		});
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

		// the key is gone and everything init wrote is still there
		expect(readJson(designFile(root, "canvas.json"))).toEqual({ format: FORMAT_VERSION, history: false });
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
		expect(readJson(designFile(root, "canvas.json"))).toEqual({ format: FORMAT_VERSION, history: false });
	});
});

/**
 * Depth (#231). A page's identity is its path under frames/, so every verb here
 * takes one and a page carries its whole subtree — the frames inside it, the
 * pages inside those, and the cameras and lists keyed by all of them.
 */
describe("pages inside pages", () => {
	/** explorations > chat > agent-chat, beside explorations/landing-page */
	function nested() {
		const held = explorerProject();
		writePageFrame(held.root, "explorations/chat", "agent-chat", label("agent-chat"));
		writePageFrame(held.root, "explorations/landing-page", "hero", label("hero"));
		writeFrame(held.root, "home", label("home"));
		return held;
	}

	it("discovers a page at every depth and attributes its frames to the path", async () => {
		const { spoolDir, name } = nested();
		const app = makeApp(spoolDir);

		const read = (await (await app.request(`/api/p/${name}/frames`)).json()) as {
			pages: string[];
			frames: { name: string; page?: string }[];
		};

		expect(read.pages).toEqual(["explorations", "explorations/chat", "explorations/landing-page"]);
		expect(read.frames).toMatchObject([
			{ name: "explorations/chat/agent-chat", page: "explorations/chat" },
			{ name: "explorations/landing-page/hero", page: "explorations/landing-page" },
			{ name: "home" },
		]);
	});

	it("creates a page inside a page, and refuses one whose page nothing holds", async () => {
		const { spoolDir, root, name } = nested();
		const app = makeApp(spoolDir);

		expect(
			(await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "explorations/pricing" }))).status,
		).toBe(204);
		expect(existsSync(designFile(root, "frames", "explorations", "pricing"))).toBe(true);

		const orphan = await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "nowhere/deep" }));
		expect(orphan.status).toBe(404);
		expect(await orphan.text()).toContain('no page "nowhere"');
		expect(existsSync(designFile(root, "frames", "nowhere"))).toBe(false);
	});

	it("names the folder that already holds one when a page name is taken where it lands", async () => {
		const { spoolDir, name } = nested();
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "explorations/chat" }));

		expect(res.status).toBe(409);
		expect(await res.text()).toBe('design/frames/explorations/ already holds a folder named "chat"');
	});

	/** Two pages under different parents are two pages, not a collision. */
	it("lets two pages share a name under different pages", async () => {
		const { spoolDir, name } = nested();
		const app = makeApp(spoolDir);

		expect((await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "site" }))).status).toBe(204);
		expect((await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "site/chat" }))).status).toBe(204);

		const read = (await (await app.request(`/api/p/${name}/frames`)).json()) as { pages: string[] };
		expect(read.pages).toContain("explorations/chat");
		expect(read.pages).toContain("site/chat");
	});

	it("renames a page mid-tree, carrying every frame, camera and list under it", async () => {
		const { spoolDir, root, name } = nested();
		const app = makeApp(spoolDir);
		await app.request(
			`/api/p/${name}/state`,
			jsonPut({
				activePage: "explorations/chat",
				pageCameras: { explorations: { x: 1, y: 1, k: 1 }, "explorations/chat": { x: 2, y: 2, k: 2 } },
			}),
		);
		await app.request(
			`/api/p/${name}/order`,
			jsonPut({
				pages: { "": ["explorations"], explorations: ["chat", "landing-page"] },
				frames: { "explorations/chat": ["agent-chat"] },
			}),
		);

		const res = await app.request(`/api/p/${name}/pages/rename`, jsonPost({ from: "explorations", to: "research" }));

		expect(res.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "research", "chat", "agent-chat", "frame.tsx"))).toBe(true);
		expect(await (await app.request(`/api/p/${name}/state`)).json()).toMatchObject({
			activePage: "research/chat",
			pageCameras: { research: { x: 1, y: 1, k: 1 }, "research/chat": { x: 2, y: 2, k: 2 } },
		});
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({
			pages: { "": ["research"], research: ["chat", "landing-page"] },
			frames: { "research/chat": ["agent-chat"] },
		});
	});

	it("refuses a rename that would change the page holding it", async () => {
		const { spoolDir, name } = nested();
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/pages/rename`, jsonPost({ from: "explorations/chat", to: "chat" }));

		expect(res.status).toBe(400);
		expect(await res.text()).toContain("a rename keeps a page where it is");
	});

	it("moves a page into another and back out, carrying its subtree's bookkeeping", async () => {
		const { spoolDir, root, name } = nested();
		const app = makeApp(spoolDir);
		await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "application" }));
		await app.request(
			`/api/p/${name}/state`,
			jsonPut({ activePage: "explorations/chat", pageCameras: { "explorations/chat": { x: 3, y: 3, k: 1 } } }),
		);
		await app.request(`/api/p/${name}/order`, jsonPut({ frames: { "explorations/chat": ["agent-chat"] } }));

		const into = await app.request(
			`/api/p/${name}/pages/move`,
			jsonPost({ pages: ["explorations/chat"], page: "application" }),
		);

		expect(into.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "application", "chat", "agent-chat", "frame.tsx"))).toBe(true);
		expect(await (await app.request(`/api/p/${name}/state`)).json()).toMatchObject({
			activePage: "application/chat",
			pageCameras: { "application/chat": { x: 3, y: 3, k: 1 } },
		});
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({
			frames: { "application/chat": ["agent-chat"] },
		});

		// "" is the root page, the same spelling the frame move wire uses
		const out = await app.request(`/api/p/${name}/pages/move`, jsonPost({ pages: ["application/chat"], page: "" }));
		expect(out.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "chat", "agent-chat", "frame.tsx"))).toBe(true);
	});

	it("refuses to move a page into itself or into a page inside it", async () => {
		const { spoolDir, root, name } = nested();
		const app = makeApp(spoolDir);

		const itself = await app.request(
			`/api/p/${name}/pages/move`,
			jsonPost({ pages: ["explorations"], page: "explorations" }),
		);
		expect(itself.status).toBe(409);
		expect(await itself.text()).toContain("cannot move into itself");

		const inside = await app.request(
			`/api/p/${name}/pages/move`,
			jsonPost({ pages: ["explorations"], page: "explorations/chat" }),
		);
		expect(inside.status).toBe(409);
		expect(existsSync(designFile(root, "frames", "explorations", "chat", "agent-chat", "frame.tsx"))).toBe(true);
	});

	it("moves frames onto a nested page and duplicates them there", async () => {
		const { spoolDir, root, name } = nested();
		const app = makeApp(spoolDir);

		expect(
			(await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["home"], page: "explorations/chat" })))
				.status,
		).toBe(204);
		expect(existsSync(designFile(root, "frames", "explorations", "chat", "home", "frame.tsx"))).toBe(true);

		const copied = await app.request(
			`/api/p/${name}/frames/duplicate`,
			jsonPost({ frames: ["explorations/landing-page/hero"], page: "explorations/chat" }),
		);
		expect(await copied.json()).toEqual({
			frames: [
				{ from: "explorations/landing-page/hero", to: "explorations/chat/hero-copy", page: "explorations/chat" },
			],
		});
	});

	it("copies a page's whole subtree, every frame at every depth keeping its own name", async () => {
		const { spoolDir, root, name } = nested();
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/pages/duplicate`, jsonPost({ name: "explorations" }));

		expect(await res.json()).toEqual({
			page: "explorations-copy",
			frames: [
				{
					from: "explorations/chat/agent-chat",
					to: "explorations-copy/chat/agent-chat",
					page: "explorations-copy/chat",
				},
				{
					from: "explorations/landing-page/hero",
					to: "explorations-copy/landing-page/hero",
					page: "explorations-copy/landing-page",
				},
			],
		});
		expect(existsSync(designFile(root, "frames", "explorations-copy", "chat", "agent-chat", "frame.tsx"))).toBe(true);
	});

	it("takes a page, the pages inside it and their frames as one move to the Trash", async () => {
		const { spoolDir, root, name } = nested();
		const trashed: string[] = [];
		const app = makeApp(spoolDir);
		await app.request(
			`/api/p/${name}/state`,
			jsonPut({ activePage: "explorations/chat", pageCameras: { "explorations/chat": { x: 1, y: 1, k: 1 } } }),
		);
		await app.request(
			`/api/p/${name}/order`,
			jsonPut({
				pages: { "": ["explorations"], explorations: ["chat"] },
				frames: { "explorations/chat": ["agent-chat"] },
			}),
		);
		const held = makeApp(spoolDir, { moveToTrash: async (paths) => void trashed.push(...paths) });

		const res = await held.request(
			`/api/p/${name}/trash`,
			jsonPost({ pages: ["explorations", "explorations/chat"], frames: ["explorations/chat/agent-chat"] }),
		);

		expect(res.status).toBe(204);
		// one folder move: the page inside it and the frame inside that ride along
		expect(trashed).toEqual([designFile(root, "frames", "explorations")]);
		expect(await (await held.request(`/api/p/${name}/state`)).json()).toEqual({ pageCameras: {} });
		// nothing is left of the order, and an order naming nothing is no order
		expect(await (await held.request(`/api/p/${name}/order`)).json()).toEqual({});
	});

	it("refuses a page path with a segment that is not a name", async () => {
		const { spoolDir, name } = nested();
		const app = makeApp(spoolDir);
		const create = (page: string) => app.request(`/api/p/${name}/pages/create`, jsonPost({ name: page }));

		expect((await create("explorations/../escape")).status).toBe(400);
		expect((await create("explorations/.hidden")).status).toBe(400);
		expect((await create("explorations//chat")).status).toBe(400);
		expect((await create("")).status).toBe(400);
		expect(
			(await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["home"], page: "explorations/../x" })))
				.status,
		).toBe(400);
		expect((await app.request(`/api/p/${name}/order`, jsonPut({ pages: { "a/../b": ["c"] } }))).status).toBe(400);
		expect((await app.request(`/api/p/${name}/state`, jsonPut({ activePage: "a/.b" }))).status).toBe(400);
	});

	it("keeps a nested page's own list, and writes a flat one as the bare list it has always been", async () => {
		const { spoolDir, root, name } = nested();
		const app = makeApp(spoolDir);

		await app.request(
			`/api/p/${name}/order`,
			jsonPut({ pages: { "": ["explorations"], explorations: ["landing-page", "chat"] } }),
		);

		// keyed the moment a second page has a list of its own
		expect(readJson(designFile(root, "canvas.json"))).toMatchObject({
			order: { pages: { "": ["explorations"], explorations: ["landing-page", "chat"] } },
		});
		await app.request(`/api/p/${name}/order`, jsonPut({ pages: { "": ["explorations"] } }));
		expect(readJson(designFile(root, "canvas.json"))).toMatchObject({ order: { pages: ["explorations"] } });
	});
});

/**
 * The carry, three pages down (#231). A page takes its whole subtree, so the
 * test that matters is the one nothing on the path is named in: a grandchild's
 * camera and lists have to arrive at their new paths without anybody naming it.
 */
describe("what a page carries at depth", () => {
	/** explorations > chat > deeper > buried */
	function threeDeep() {
		const held = explorerProject();
		writePageFrame(held.root, "explorations/chat/deeper", "buried", label("buried"));
		return held;
	}

	async function bookkeep(app: ReturnType<typeof makeApp>, name: string): Promise<void> {
		await app.request(
			`/api/p/${name}/state`,
			jsonPut({
				activePage: "explorations/chat/deeper",
				pageCameras: {
					"explorations/chat": { x: 1, y: 1, k: 1 },
					"explorations/chat/deeper": { x: 9, y: 9, k: 2 },
				},
			}),
		);
		await app.request(
			`/api/p/${name}/order`,
			jsonPut({
				pages: { "": ["explorations"], explorations: ["chat"], "explorations/chat": ["deeper"] },
				frames: { "explorations/chat/deeper": ["buried"] },
			}),
		);
	}

	it("carries a grandchild's camera and lists when the page above them all is renamed", async () => {
		const { spoolDir, root, name } = threeDeep();
		const app = makeApp(spoolDir);
		await bookkeep(app, name);

		const res = await app.request(`/api/p/${name}/pages/rename`, jsonPost({ from: "explorations", to: "research" }));

		expect(res.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "research", "chat", "deeper", "buried", "frame.tsx"))).toBe(true);
		expect(await (await app.request(`/api/p/${name}/state`)).json()).toMatchObject({
			activePage: "research/chat/deeper",
			pageCameras: {
				"research/chat": { x: 1, y: 1, k: 1 },
				"research/chat/deeper": { x: 9, y: 9, k: 2 },
			},
		});
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({
			pages: { "": ["research"], research: ["chat"], "research/chat": ["deeper"] },
			frames: { "research/chat/deeper": ["buried"] },
		});
	});

	it("carries a grandchild when the page in the middle is the one that moved", async () => {
		const { spoolDir, root, name } = threeDeep();
		const app = makeApp(spoolDir);
		await app.request(`/api/p/${name}/pages/create`, jsonPost({ name: "application" }));
		await bookkeep(app, name);

		const res = await app.request(
			`/api/p/${name}/pages/move`,
			jsonPost({ pages: ["explorations/chat"], page: "application" }),
		);

		expect(res.status).toBe(204);
		expect(existsSync(designFile(root, "frames", "application", "chat", "deeper", "buried", "frame.tsx"))).toBe(true);
		expect(await (await app.request(`/api/p/${name}/state`)).json()).toMatchObject({
			activePage: "application/chat/deeper",
			pageCameras: {
				"application/chat": { x: 1, y: 1, k: 1 },
				"application/chat/deeper": { x: 9, y: 9, k: 2 },
			},
		});
		// the page leaves the list it was in; where it lands in the new one is the
		// drop's to say, so the daemon writes no list for it
		expect(await (await app.request(`/api/p/${name}/order`)).json()).toEqual({
			pages: { "": ["explorations"], explorations: [], "application/chat": ["deeper"] },
			frames: { "application/chat/deeper": ["buried"] },
		});
	});
});

/**
 * Walks follow a frame that changed name (#336). A frame is named by its path,
 * so a gesture that moves one changes what every walk into it has to say, and
 * the daemon writes each literal the flow map reads at the new name, wherever
 * it is spelled: another page's frame, the frame itself, a shared/ component.
 */
describe("walks into a frame that changed name", () => {
	async function edges(app: ReturnType<typeof makeApp>, name: string) {
		const flows = (await (await app.request(`/api/p/${name}/flows`)).json()) as {
			edges: { from: string; to: string; missing?: true }[];
		};
		return flows.edges.map(({ from, to, missing }) => ({ from, to, ...(missing ? { missing } : {}) }));
	}

	it("rewrites every walk into a renamed page's frames and carries their covers", async () => {
		const { spoolDir, root, name } = explorerProject();
		writePageFrame(root, "vercel", "buttons", label("vercel buttons"));
		writeFrame(root, "buttons", label("root buttons"));
		writePageFrame(
			root,
			"docs",
			"intro",
			[
				'import { ui } from "spool";',
				'import { Nav } from "shared/ui/nav";',
				"export default () => (",
				"\t<main>",
				'\t\t<a data-go="vercel/buttons">see</a>',
				'\t\t<button onClick={() => ui.go("vercel/buttons")}>go</button>',
				"\t\t<Nav />",
				"\t</main>",
				");",
				"",
			].join("\n"),
		);
		writeDesignFile(
			root,
			"shared/ui/nav.tsx",
			'export function Nav() {\n\treturn <nav><a data-go="vercel/buttons">v</a><a data-go="buttons">r</a></nav>;\n}\n',
		);
		const app = makeApp(spoolDir);
		const hash = await putCover(app, name, "vercel/buttons");

		const res = await app.request(`/api/p/${name}/pages/rename`, jsonPost({ from: "vercel", to: "acme" }));

		expect(res.status).toBe(204);
		const intro = readFileSync(designFile(root, "frames", "docs", "intro", "frame.tsx"), "utf8");
		expect(intro).toContain('data-go="acme/buttons"');
		expect(intro).toContain('ui.go("acme/buttons")');
		expect(intro).not.toContain("vercel/buttons");
		// a shared component names frames the same way, and only the moved one changed
		expect(readFileSync(designFile(root, "shared", "ui", "nav.tsx"), "utf8")).toBe(
			'export function Nav() {\n\treturn <nav><a data-go="acme/buttons">v</a><a data-go="buttons">r</a></nav>;\n}\n',
		);
		expect(existsSync(designFile(root, ".spool", "thumbs", "vercel%2Fbuttons"))).toBe(false);
		expect((await app.request(`/covers/${name}/acme%2Fbuttons/${hash}`)).status).toBe(200);
		expect(await edges(app, name)).toEqual([
			{ from: "docs/intro", to: "acme/buttons" },
			{ from: "docs/intro", to: "buttons" },
		]);
	});

	it("rewrites the walk into a frame renamed through the route", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", 'export default () => <a data-go="shop/checkout">buy</a>;\n');
		writePageFrame(
			root,
			"shop",
			"checkout",
			'export const links = { back: "home", self: "shop/checkout" } as const;\nexport default () => null;\n',
		);
		const app = makeApp(spoolDir);

		const res = await app.request(
			`/api/p/${name}/frames/rename`,
			jsonPost({ from: "shop/checkout", to: "shop/basket" }),
		);

		expect(res.status).toBe(204);
		expect(readFileSync(designFile(root, "frames", "home", "frame.tsx"), "utf8")).toBe(
			'export default () => <a data-go="shop/basket">buy</a>;\n',
		);
		// a links value naming the frame is a walk too, even inside the frame that moved
		expect(readFileSync(designFile(root, "frames", "shop", "basket", "frame.tsx"), "utf8")).toBe(
			'export const links = { back: "home", self: "shop/basket" } as const;\nexport default () => null;\n',
		);
	});

	it("rewrites the walk into a frame moved onto another page", async () => {
		const { spoolDir, root, name } = explorerProject();
		writeFrame(root, "home", "export default () => <a data-go='checkout'>buy</a>;\n");
		writeFrame(root, "checkout", label("checkout"));
		mkdirSync(designFile(root, "frames", "shop"), { recursive: true });
		const app = makeApp(spoolDir);

		const res = await app.request(`/api/p/${name}/frames/move`, jsonPost({ frames: ["checkout"], page: "shop" }));

		expect(res.status).toBe(204);
		// written inside the quotes the author chose
		expect(readFileSync(designFile(root, "frames", "home", "frame.tsx"), "utf8")).toBe(
			"export default () => <a data-go='shop/checkout'>buy</a>;\n",
		);
		expect(await edges(app, name)).toEqual([{ from: "home", to: "shop/checkout" }]);
	});
});
