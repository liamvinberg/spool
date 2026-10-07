import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeApp, makeProject, makeTempDir, sseReader, writeDesignFile } from "../test-helpers";
import {
	FAVICON_FILES,
	findProjectIcon,
	ICON_MAX_BYTES,
	removeProjectIcon,
	sniffIcon,
	writeProjectIcon,
} from "./project-icon";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([8, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

function writeAt(root: string, path: string, content: string | Buffer): void {
	const file = join(root, ...path.split("/"));
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

function project() {
	const spoolDir = join(makeTempDir(), ".spool");
	return { spoolDir, ...makeProject(spoolDir) };
}

describe("finding a project's icon", () => {
	it("has none when there is no icon file and no favicon", async () => {
		const { root } = project();
		expect(await findProjectIcon(root)).toBeUndefined();
	});

	it("takes design/shared/icon.* over the repo's favicon", async () => {
		const { root } = project();
		writeAt(root, "public/favicon.svg", SVG);
		writeDesignFile(root, "shared/icon.png", "png bytes");
		expect(await findProjectIcon(root)).toMatchObject({ from: "file", path: "design/shared/icon.png" });
	});

	it("looks for the icon file's kinds in order: svg first", async () => {
		const { root } = project();
		writeDesignFile(root, "shared/icon.jpg", "jpg bytes");
		writeDesignFile(root, "shared/icon.svg", SVG);
		expect((await findProjectIcon(root))?.path).toBe("design/shared/icon.svg");
	});

	it("falls back to the favicon, the first in the list that is there", async () => {
		const { root } = project();
		writeAt(root, "favicon.ico", "ico");
		writeAt(root, "public/favicon.png", "png");
		writeAt(root, "app/icon.svg", SVG);
		expect(await findProjectIcon(root)).toMatchObject({ from: "favicon", path: "app/icon.svg" });
		// a vector anywhere beats a bitmap, and an .ico comes last
		expect(FAVICON_FILES.indexOf("app/icon.svg")).toBeLessThan(FAVICON_FILES.indexOf("public/favicon.png"));
		expect(FAVICON_FILES.at(-1)).toBe("favicon.ico");
	});

	it("hashes the content, so a changed file is a changed address", async () => {
		const { root } = project();
		writeAt(root, "public/favicon.svg", SVG);
		const before = await findProjectIcon(root);
		writeAt(root, "public/favicon.svg", SVG.replace("16", "15"));
		const after = await findProjectIcon(root);
		expect(before?.hash).toMatch(/^[0-9a-f]{32}$/);
		expect(after?.hash).not.toBe(before?.hash);
	});

	it("never follows a link, and skips a file past the cap", async () => {
		const { root } = project();
		const secret = join(makeTempDir(), "secret.svg");
		writeFileSync(secret, SVG);
		mkdirSync(join(root, "public"));
		symlinkSync(secret, join(root, "public", "favicon.svg"));
		writeAt(root, "public/favicon.png", Buffer.alloc(ICON_MAX_BYTES + 1));
		expect(await findProjectIcon(root)).toBeUndefined();
	});
});

describe("writing and removing the icon file", () => {
	it("reads the kind from the bytes", () => {
		expect(sniffIcon(Buffer.from(SVG))).toBe("svg");
		expect(sniffIcon(Buffer.from(`<?xml version="1.0"?>\n<!-- logo -->\n${SVG}`))).toBe("svg");
		expect(sniffIcon(PNG)).toBe("png");
		expect(sniffIcon(JPEG)).toBe("jpg");
		expect(sniffIcon(WEBP)).toBe("webp");
		expect(sniffIcon(Buffer.from("GIF89a"))).toBeUndefined();
		expect(sniffIcon(Buffer.from("<html><body>no</body></html>"))).toBeUndefined();
	});

	it("writes design/shared/icon.<ext> and takes away every other icon.*", () => {
		const { root } = project();
		writeDesignFile(root, "shared/icon.svg", SVG);
		writeDesignFile(root, "shared/icon.jpeg", "old");
		const icon = writeProjectIcon(root, PNG);
		expect(icon).toMatchObject({ from: "file", path: "design/shared/icon.png" });
		const icons = readdirSync(join(root, "design", "shared")).filter((name) => name.startsWith("icon."));
		expect(icons).toEqual(["icon.png"]);
		expect(readFileSync(join(root, "design", "shared", "icon.png"))).toEqual(PNG);
	});

	it("refuses what isn't an SVG, PNG, WebP or JPEG, and anything over the cap", () => {
		const { root } = project();
		expect(() => writeProjectIcon(root, Buffer.from("GIF89a"))).toThrow("Use an SVG, PNG, WebP or JPEG image.");
		expect(() => writeProjectIcon(root, Buffer.alloc(0))).toThrow("Use an SVG, PNG, WebP or JPEG image.");
		const big = Buffer.concat([PNG, Buffer.alloc(ICON_MAX_BYTES)]);
		expect(() => writeProjectIcon(root, big)).toThrow("Use an image under 1 MB.");
		expect(existsSync(join(root, "design", "shared", "icon.png"))).toBe(false);
	});

	it("removes every icon.* and leaves the rest of shared/ alone", async () => {
		const { root } = project();
		writeAt(root, "public/favicon.svg", SVG);
		writeDesignFile(root, "shared/icon.svg", SVG);
		writeDesignFile(root, "shared/icon.webp", "webp");
		writeDesignFile(root, "shared/icons.css", "a {}");
		removeProjectIcon(root);
		expect(existsSync(join(root, "design", "shared", "icon.svg"))).toBe(false);
		expect(existsSync(join(root, "design", "shared", "icon.webp"))).toBe(false);
		expect(existsSync(join(root, "design", "shared", "icons.css"))).toBe(true);
		expect(await findProjectIcon(root)).toMatchObject({ from: "favicon", path: "public/favicon.svg" });
	});
});

describe("the icon routes", () => {
	it("puts the icon on the project's card", async () => {
		const { spoolDir, root } = project();
		writeAt(root, "public/favicon.svg", SVG);
		const app = makeApp(spoolDir);
		const { projects } = (await (await app.request("/api/projects")).json()) as {
			projects: { root: string; icon?: unknown }[];
		};
		expect(projects.find((card) => card.root === root)?.icon).toMatchObject({
			from: "favicon",
			path: "public/favicon.svg",
		});
	});

	it("serves the bytes at their hash, an SVG sandboxed, and nothing at any other hash", async () => {
		const { spoolDir, root, name } = project();
		writeDesignFile(root, "shared/icon.svg", SVG);
		const app = makeApp(spoolDir);
		const icon = await findProjectIcon(root);
		const got = await app.request(`/icons/${name}/${icon?.hash}`);
		expect(got.status).toBe(200);
		expect(got.headers.get("content-type")).toBe("image/svg+xml");
		expect(got.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
		expect(got.headers.get("x-content-type-options")).toBe("nosniff");
		expect(got.headers.get("cache-control")).toContain("immutable");
		expect(await got.text()).toBe(SVG);
		expect((await app.request(`/icons/${name}/${"0".repeat(32)}`)).status).toBe(404);
		expect((await app.request(`/icons/${name}/not-a-hash`)).status).toBe(404);
		expect((await app.request(`/icons/nobody/${icon?.hash}`)).status).toBe(404);
	});

	it("serves a favicon as what it is", async () => {
		const { spoolDir, root, name } = project();
		writeAt(root, "favicon.ico", "ico bytes");
		const app = makeApp(spoolDir);
		const icon = await findProjectIcon(root);
		const got = await app.request(`/icons/${name}/${icon?.hash}`);
		expect(got.headers.get("content-type")).toBe("image/x-icon");
	});

	it("writes and removes the icon behind the control token, and says so on the app stream", async () => {
		const { spoolDir, root } = project();
		writeAt(root, "public/favicon.svg", SVG);
		const app = makeApp(spoolDir);
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await app.request("/api/events", { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");

		const path = `/api/projects/icon?${new URLSearchParams({ root })}`;
		expect((await app.fetch(path, { method: "POST", body: PNG })).status).toBe(401);
		const written = await app.request(path, { method: "POST", body: PNG, headers: { "content-type": "image/png" } });
		expect(written.status).toBe(200);
		const { icon } = (await written.json()) as { icon: { from: string; path: string; hash: string } };
		expect(icon).toMatchObject({ from: "file", path: "design/shared/icon.png" });
		expect(await events.next()).toEqual({ event: "app", data: { kind: "icon", root, icon } });

		const removed = await app.request("/api/projects/icon/remove", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ root }),
		});
		expect(removed.status).toBe(200);
		const back = await findProjectIcon(root);
		expect(back).toMatchObject({ from: "favicon" });
		expect(await removed.json()).toEqual({ icon: back });
		expect(await events.next()).toEqual({ event: "app", data: { kind: "icon", root, icon: back } });
		expect(existsSync(join(root, "design", "shared", "icon.png"))).toBe(false);
	});

	it("refuses a write that isn't an image, is too big, or names no project", async () => {
		const { spoolDir, root } = project();
		const app = makeApp(spoolDir);
		const path = `/api/projects/icon?${new URLSearchParams({ root })}`;
		const wrong = await app.request(path, { method: "POST", body: "<html></html>" });
		expect(wrong.status).toBe(400);
		expect(await wrong.json()).toEqual({ error: "Use an SVG, PNG, WebP or JPEG image." });
		const big = await app.request(path, { method: "POST", body: Buffer.concat([PNG, Buffer.alloc(ICON_MAX_BYTES)]) });
		expect(big.status).toBe(413);
		expect(await big.json()).toEqual({ error: "Use an image under 1 MB." });
		const stranger = await app.request(`/api/projects/icon?${new URLSearchParams({ root: "/nowhere" })}`, {
			method: "POST",
			body: PNG,
		});
		expect(stranger.status).toBe(404);
		expect(existsSync(join(root, "design", "shared", "icon.png"))).toBe(false);
	});

	it("tells the pages when the icon file changes on disk by another hand", async () => {
		const { spoolDir, root } = project();
		const app = makeApp(spoolDir);
		// the watch seeds what each project wears before it listens
		await new Promise((resolve) => setTimeout(resolve, 100));
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await app.request("/api/events", { signal: controller.signal }));
		expect((await events.next()).event).toBe("hello");
		writeDesignFile(root, "shared/icon.svg", SVG);
		const icon = await findProjectIcon(root);
		expect(await events.next()).toEqual({ event: "app", data: { kind: "icon", root, icon } });
	});
});
